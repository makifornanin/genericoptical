import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** 32+ chars. Encrypts stored integration credentials and signs reset links. */
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Enables the demo banner, demo credentials on the login page and the demo reset tool. */
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Directory for uploaded expense attachments (local disk adapter). */
  UPLOAD_DIR: z.string().default(".data/uploads"),
  /** GoHighLevel marketplace app (OAuth). Optional: without them only the Private Integration option is offered. */
  GHL_CLIENT_ID: z.string().optional(),
  GHL_CLIENT_SECRET: z.string().optional(),
  /** Defaults to <APP_URL>/api/integrations/ghl/oauth/callback; must match the app's redirect URI exactly. */
  GHL_REDIRECT_URI: z.string().url().optional(),
  /** White-label agencies: https://marketplace.leadconnectorhq.com */
  GHL_MARKETPLACE_URL: z.string().url().optional(),
  /** Override the published webhook verification keys if HighLevel rotates them. */
  GHL_WEBHOOK_ED25519_PUBLIC_KEY: z.string().optional(),
  GHL_WEBHOOK_RSA_PUBLIC_KEY: z.string().optional(),
  /** Number of trusted reverse proxies in front of the app (for client IPs from X-Forwarded-For). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export const isDemoMode = () => env().DEMO_MODE;
