import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { decrypt, encrypt, randomToken, sha256 } from "@/server/auth/tokens";
import { getDb, getPool } from "@/server/db";
import {
  ghlCalendars,
  ghlContacts,
  ghlOpportunities,
  ghlPipelines,
  ghlProductLinks,
  ghlUsers,
  integrationConnections,
  integrationMismatches,
  integrationSyncEvents,
  oauthStates,
} from "@/server/db/schema";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { audit, conflict, invalid, requirePermission, type Ctx } from "@/server/services/core";
import { ghlApi } from "./api";
import { GhlClient, type Fetch, type TokenSource } from "./client";
import { parseSettings, type GhlSettings } from "./config";
import { GHL_MARKETPLACE_URL, GHL_SCOPES, GHL_TOKEN_URL } from "./constants";
import { enqueue, GHL } from "./engine";
import { GhlError, GhlReauthRequiredError } from "./errors";

/**
 * One GHL sub-account per business. Two ways to connect:
 *  - OAuth (marketplace app) — preferred; supports many businesses with one app. Tokens rotate.
 *  - Private Integration token — for a single sub-account when no marketplace app exists.
 * Credentials are encrypted with APP_SECRET (AES-256-GCM) and never leave the server.
 */

type ConnectionRow = typeof integrationConnections.$inferSelect;
const REFRESH_MARGIN_MS = 5 * 60_000;

export function oauthConfigured() {
  const e = env();
  return Boolean(e.GHL_CLIENT_ID && e.GHL_CLIENT_SECRET);
}

export function redirectUri() {
  const e = env();
  return e.GHL_REDIRECT_URI ?? `${e.APP_URL.replace(/\/$/, "")}/api/integrations/ghl/oauth/callback`;
}

export async function connectionRow(businessId: string) {
  const [row] = await getDb()
    .select()
    .from(integrationConnections)
    .where(and(eq(integrationConnections.businessId, businessId), eq(integrationConnections.provider, GHL)))
    .limit(1);
  return row ?? null;
}

// ─── Token source ────────────────────────────────────────────────────────────

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; userType?: string; locationId?: string; companyId?: string; userId?: string };

async function callTokenEndpoint(fetchImpl: Fetch, params: Record<string, string>): Promise<TokenResponse> {
  const e = env();
  const body = new URLSearchParams({ client_id: e.GHL_CLIENT_ID ?? "", client_secret: e.GHL_CLIENT_SECRET ?? "", user_type: "Location", redirect_uri: redirectUri(), ...params });
  let res: Response;
  try {
    res = await fetchImpl(GHL_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GhlError("Couldn't reach GoHighLevel to authorise the connection.");
  }
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string; message?: string };
  if (!res.ok) {
    const detail = json.error_description ?? json.message ?? json.error ?? `HTTP ${res.status}`;
    // invalid_grant / 400 / 401 on refresh = the refresh token is used, revoked or expired.
    if (params.grant_type === "refresh_token" && (res.status === 400 || res.status === 401)) throw new GhlReauthRequiredError(`GoHighLevel refused the stored authorisation (${detail}). Reconnect GoHighLevel.`);
    throw new GhlError(`GoHighLevel authorisation failed: ${detail}`, res.status);
  }
  if (!json.access_token) throw new GhlError("GoHighLevel returned no access token.");
  return json;
}

/**
 * Refreshes OAuth tokens under a row lock. GHL refresh tokens are single-use, so two workers must never
 * refresh at the same time: the second one waits for the lock and then reuses the first one's result.
 * Uses a raw client (not db.transaction) so the external call is never re-run by transaction retries.
 */
async function refreshTokens(businessId: string, staleAccessToken: string | null, fetchImpl: Fetch): Promise<string> {
  const secret = env().APP_SECRET;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string; status: string; access_token_encrypted: string | null; refresh_token_encrypted: string | null; token_expires_at: Date | null }>(
      "select id, status, access_token_encrypted, refresh_token_encrypted, token_expires_at from integration_connections where business_id = $1 and provider = $2 for update",
      [businessId, GHL],
    );
    const row = rows[0];
    if (!row?.refresh_token_encrypted || row.status === "disabled") throw new GhlReauthRequiredError();
    const current = row.access_token_encrypted ? decrypt(row.access_token_encrypted, secret) : null;
    // Someone else refreshed while we waited for the lock — use their token.
    if (current && current !== staleAccessToken && row.token_expires_at && row.token_expires_at.getTime() - Date.now() > REFRESH_MARGIN_MS) {
      await client.query("COMMIT");
      return current;
    }
    let tokens: TokenResponse;
    try {
      tokens = await callTokenEndpoint(fetchImpl, { grant_type: "refresh_token", refresh_token: decrypt(row.refresh_token_encrypted, secret) });
    } catch (error) {
      if (error instanceof GhlReauthRequiredError) {
        await client.query("update integration_connections set status = 'reauth_required', last_error = $2, updated_at = now() where id = $1", [row.id, error.message]);
        await client.query("COMMIT");
      } else await client.query("ROLLBACK");
      throw error;
    }
    await client.query(
      `update integration_connections set access_token_encrypted = $2, refresh_token_encrypted = $3, token_expires_at = $4, scopes = coalesce($5, scopes),
         status = case when status = 'reauth_required' then 'connected' else status end, updated_at = now() where id = $1`,
      [
        row.id,
        encrypt(tokens.access_token!, secret),
        tokens.refresh_token ? encrypt(tokens.refresh_token, secret) : row.refresh_token_encrypted,
        new Date(Date.now() + (tokens.expires_in ?? 86_399) * 1000),
        tokens.scope ?? null,
      ],
    );
    await client.query("COMMIT");
    log.info("ghl.token_refreshed", { businessId });
    return tokens.access_token!;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function tokenSourceFor(row: ConnectionRow, fetchImpl: Fetch): TokenSource {
  const secret = env().APP_SECRET;
  if (row.authType === "private_token") {
    const token = row.credentialsEncrypted ? decrypt(row.credentialsEncrypted, secret) : null;
    return {
      get: async () => {
        if (!token) throw new GhlReauthRequiredError("No GoHighLevel token is saved.");
        return token;
      },
      refresh: async () => {
        throw new GhlReauthRequiredError("GoHighLevel rejected the Private Integration token. Save a new token.");
      },
    };
  }
  let cached = row.accessTokenEncrypted ? decrypt(row.accessTokenEncrypted, secret) : null;
  let expiresAt = row.tokenExpiresAt?.getTime() ?? 0;
  return {
    get: async () => {
      if (cached && expiresAt - Date.now() > REFRESH_MARGIN_MS) return cached;
      cached = await refreshTokens(row.businessId, cached, fetchImpl);
      expiresAt = Date.now() + 23 * 3_600_000;
      return cached;
    },
    refresh: async () => {
      cached = await refreshTokens(row.businessId, cached, fetchImpl);
      expiresAt = Date.now() + 23 * 3_600_000;
      return cached;
    },
  };
}

/** A ready-to-use API for the business's connected sub-account, or a typed error explaining why not. */
export async function apiFor(businessId: string, fetchImpl: Fetch = fetch) {
  const row = await connectionRow(businessId);
  if (!row || !row.externalAccountId || row.status === "disabled" || row.status === "not_configured") throw new GhlReauthRequiredError("GoHighLevel isn't connected for this business.");
  if (row.status === "reauth_required") throw new GhlReauthRequiredError();
  const client = new GhlClient(tokenSourceFor(row, fetchImpl), fetchImpl, { businessId, locationId: row.externalAccountId });
  return { api: ghlApi(client, row.externalAccountId), connection: row, settings: parseSettings(row.settings) };
}

// ─── OAuth connect / reconnect ───────────────────────────────────────────────

/** Builds the HighLevel consent URL with a single-use state bound to this business and staff member. */
export async function startOAuth(ctx: Ctx) {
  requirePermission(ctx, "integrations.manage");
  if (!oauthConfigured()) throw invalid("The GoHighLevel app isn't configured on this server (GHL_CLIENT_ID / GHL_CLIENT_SECRET). Use a Private Integration token instead, or ask your administrator.");
  if (!ctx.membershipId) throw invalid("Sign in again.");
  const state = randomToken(24);
  await getDb()
    .insert(oauthStates)
    .values({ id: sha256(state), businessId: ctx.businessId, membershipId: ctx.membershipId, provider: GHL, expiresAt: new Date(Date.now() + 15 * 60_000) });
  const base = (env().GHL_MARKETPLACE_URL ?? GHL_MARKETPLACE_URL).replace(/\/$/, "");
  const url = new URL(`${base}/v2/oauth/chooselocation`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("client_id", env().GHL_CLIENT_ID!);
  url.searchParams.set("scope", GHL_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Completes OAuth for the signed-in staff member. The state must have been issued to this member of
 * this business in the last 15 minutes. (HighLevel's docs don't confirm that `state` is echoed back;
 * if it isn't, the member's most recent unused state is used — the binding to their session remains.)
 */
export async function completeOAuth(ctx: Ctx, params: { code: string | null; state: string | null }, fetchImpl: Fetch = fetch) {
  requirePermission(ctx, "integrations.manage");
  if (!params.code) throw invalid("GoHighLevel didn't return an authorisation code. Try connecting again.");
  const db = getDb();
  const stateRow = await db.transaction(async (tx) => {
    const base = and(eq(oauthStates.businessId, ctx.businessId), eq(oauthStates.membershipId, ctx.membershipId ?? ""), eq(oauthStates.provider, GHL), isNull(oauthStates.usedAt), gt(oauthStates.expiresAt, new Date()));
    const [row] = params.state
      ? await tx.select().from(oauthStates).where(and(base, eq(oauthStates.id, sha256(params.state)))).limit(1).for("update")
      : await tx.select().from(oauthStates).where(base).orderBy(desc(oauthStates.createdAt)).limit(1).for("update");
    if (!row) return null;
    await tx.update(oauthStates).set({ usedAt: new Date() }).where(eq(oauthStates.id, row.id));
    return row;
  });
  if (!stateRow) throw invalid("This connection link has expired or was started by someone else. Start again from Settings → Integrations.");
  if (!params.state) log.warn("ghl.oauth_state_missing", { businessId: ctx.businessId });

  const tokens = await callTokenEndpoint(fetchImpl, { grant_type: "authorization_code", code: params.code });
  if (tokens.userType !== "Location" || !tokens.locationId) {
    throw invalid("GoHighLevel returned an agency-level authorisation. Install the app from the sub-account (choose a single location) so this business is linked to exactly one sub-account.");
  }
  return saveConnection(ctx, {
    authType: "oauth",
    locationId: tokens.locationId,
    companyId: tokens.companyId ?? null,
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token ?? null,
    expiresIn: tokens.expires_in ?? 86_399,
    scopes: tokens.scope ?? null,
    fetchImpl,
  });
}

// ─── Private Integration token ───────────────────────────────────────────────

const privateTokenInput = z.object({
  locationId: z.string().trim().min(5, "Enter the sub-account (location) ID.").max(80),
  token: z.string().trim().min(10, "Enter the Private Integration token.").max(400),
});

/** Connects with a Private Integration token after verifying it can read the sub-account. */
export async function connectPrivateToken(ctx: Ctx, raw: unknown, fetchImpl: Fetch = fetch) {
  requirePermission(ctx, "integrations.manage");
  const input = privateTokenInput.parse(raw);
  return saveConnection(ctx, { authType: "private_token", locationId: input.locationId, companyId: null, accessToken: input.token, refreshToken: null, expiresIn: null, scopes: null, fetchImpl });
}

async function saveConnection(
  ctx: Ctx,
  c: { authType: "oauth" | "private_token"; locationId: string; companyId: string | null; accessToken: string; refreshToken: string | null; expiresIn: number | null; scopes: string | null; fetchImpl: Fetch },
) {
  const secret = env().APP_SECRET;
  const db = getDb();
  // One sub-account ↔ one business.
  const [elsewhere] = await db
    .select({ businessId: integrationConnections.businessId })
    .from(integrationConnections)
    .where(and(eq(integrationConnections.provider, GHL), eq(integrationConnections.externalAccountId, c.locationId), ne(integrationConnections.status, "disabled"), ne(integrationConnections.businessId, ctx.businessId)))
    .limit(1);
  if (elsewhere) throw conflict("That GoHighLevel sub-account is already connected to another business on this platform.");
  const existing = await connectionRow(ctx.businessId);
  if (existing?.externalAccountId && existing.externalAccountId !== c.locationId && (await hasSyncData(ctx.businessId))) {
    throw conflict(`This business already has sync data for sub-account ${existing.externalAccountId}. Disconnect and choose "forget sync data" before connecting a different sub-account.`);
  }

  // Verify the identity of the sub-account with the new credentials before saving anything.
  const verifyClient = new GhlClient(
    { get: async () => c.accessToken, refresh: async () => { throw new GhlReauthRequiredError("GoHighLevel rejected the new credentials."); } },
    c.fetchImpl,
    { businessId: ctx.businessId, locationId: c.locationId },
  );
  const { location } = await ghlApi(verifyClient, c.locationId).getLocation();
  if (location?.id && location.id !== c.locationId) throw invalid("GoHighLevel returned a different sub-account than the one authorised.");

  const values = {
    status: "connected" as const,
    authType: c.authType,
    externalAccountId: c.locationId,
    accountName: location?.name ?? null,
    accountTimezone: location?.timezone ?? null,
    companyId: c.companyId ?? location?.companyId ?? null,
    credentialsEncrypted: c.authType === "private_token" ? encrypt(c.accessToken, secret) : null,
    accessTokenEncrypted: c.authType === "oauth" ? encrypt(c.accessToken, secret) : null,
    refreshTokenEncrypted: c.refreshToken ? encrypt(c.refreshToken, secret) : null,
    tokenExpiresAt: c.expiresIn ? new Date(Date.now() + c.expiresIn * 1000) : null,
    scopes: c.scopes,
    webhookSecretEncrypted: existing?.webhookSecretEncrypted ?? encrypt(randomBytes(24).toString("base64url"), secret),
    settings: parseSettings(existing?.settings) as unknown as Record<string, unknown>,
    connectedByMembershipId: ctx.membershipId,
    connectedAt: new Date(),
    lastTestedAt: new Date(),
    lastError: null,
    rateLimitedUntil: null,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    if (existing) await tx.update(integrationConnections).set(values).where(eq(integrationConnections.id, existing.id));
    else await tx.insert(integrationConnections).values({ ...values, businessId: ctx.businessId, provider: GHL });
    await enqueue(tx, { businessId: ctx.businessId, direction: "outbound", eventType: "system.refresh_metadata", category: "system", entityType: "connection", entityId: null, payload: {} });
    await audit(tx, ctx, {
      action: "integration.connected",
      entityType: "business",
      entityId: ctx.businessId,
      summary: `Connected GoHighLevel sub-account ${location?.name ?? c.locationId} (${c.authType === "oauth" ? "OAuth" : "Private Integration token"})`,
    });
  });
  return { locationId: c.locationId, accountName: location?.name ?? null };
}

async function hasSyncData(businessId: string) {
  const [row] = await getDb().execute<{ n: number }>(sql`
    select (select count(*) from ghl_contacts where business_id = ${businessId})
         + (select count(*) from ghl_opportunities where business_id = ${businessId})
         + (select count(*) from ghl_product_links where business_id = ${businessId})
         + (select count(*) from appointments where business_id = ${businessId} and external_ghl_appointment_id is not null) as n`).then((r) => r.rows);
  return Number(row?.n ?? 0) > 0;
}

/**
 * Disconnects: deletes tokens immediately (nothing more is sent or accepted). With `forget`, also
 * removes GHL mirrors and mappings so a different sub-account can be connected; local leads, customers,
 * appointments and sales are never deleted.
 */
export async function disconnect(ctx: Ctx, opts: { forget?: boolean } = {}) {
  requirePermission(ctx, "integrations.manage");
  await getDb().transaction(async (tx) => {
    await tx
      .update(integrationConnections)
      .set({ status: "disabled", credentialsEncrypted: null, accessTokenEncrypted: null, refreshTokenEncrypted: null, tokenExpiresAt: null, lastError: null, updatedAt: new Date(), ...(opts.forget ? { externalAccountId: null, accountName: null, companyId: null } : {}) })
      .where(and(eq(integrationConnections.businessId, ctx.businessId), eq(integrationConnections.provider, GHL)));
    // Queued outbound work can't be delivered any more; keep history but stop retrying.
    await tx
      .update(integrationSyncEvents)
      .set({ status: "skipped", lastError: "Integration disconnected", processedAt: new Date() })
      .where(and(eq(integrationSyncEvents.businessId, ctx.businessId), eq(integrationSyncEvents.direction, "outbound"), sql`${integrationSyncEvents.status} in ('pending', 'retry_scheduled', 'processing')`));
    if (opts.forget) {
      for (const t of [ghlContacts, ghlOpportunities, ghlPipelines, ghlCalendars, ghlUsers, ghlProductLinks, integrationMismatches]) {
        await tx.delete(t).where(eq(t.businessId, ctx.businessId));
      }
    }
    await audit(tx, ctx, { action: "integration.disconnected", entityType: "business", entityId: ctx.businessId, summary: `Disconnected GoHighLevel${opts.forget ? " and forgot sync data" : ""}` });
  });
}

export async function updateSettings(ctx: Ctx, patch: Partial<GhlSettings>) {
  requirePermission(ctx, "integrations.manage");
  const row = await connectionRow(ctx.businessId);
  const merged = parseSettings({ ...parseSettings(row?.settings), ...patch, sync: { ...parseSettings(row?.settings).sync, ...(patch.sync ?? {}) }, stageMap: { ...parseSettings(row?.settings).stageMap, ...(patch.stageMap ?? {}) } });
  if (row) await getDb().update(integrationConnections).set({ settings: merged as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(integrationConnections.id, row.id));
  else await getDb().insert(integrationConnections).values({ businessId: ctx.businessId, provider: GHL, status: "not_configured", settings: merged as unknown as Record<string, unknown> });
  await audit(getDb(), ctx, { action: "integration.settings", entityType: "business", entityId: ctx.businessId, summary: "Updated GoHighLevel sync settings" });
  return merged;
}

/** Workflow-webhook secret (for GHL workflow "Webhook" actions), shown to integration managers only. */
export async function workflowWebhookSecret(ctx: Ctx) {
  requirePermission(ctx, "integrations.manage");
  const row = await connectionRow(ctx.businessId);
  return row?.webhookSecretEncrypted ? decrypt(row.webhookSecretEncrypted, env().APP_SECRET) : null;
}
