/**
 * Typed GoHighLevel API failures. The sync engine maps each class to a retry decision:
 *   RateLimit / Server / Network → retry with back-off
 *   Auth (after a refresh attempt) → pause the connection (re-authorisation required)
 *   Permission (missing scope) → needs review
 *   NotFound / Request (4xx) → handler decides; otherwise failed (retrying won't help)
 */
export class GhlError extends Error {
  constructor(
    message: string,
    public status?: number,
    public detail?: string,
  ) {
    super(message);
    this.name = "GhlError";
  }
}

export class GhlRateLimitError extends GhlError {
  constructor(public retryAfterMs: number) {
    super(`GoHighLevel rate limit reached; retry in ${Math.ceil(retryAfterMs / 1000)}s`, 429);
    this.name = "GhlRateLimitError";
  }
}

export class GhlAuthError extends GhlError {
  constructor(message = "GoHighLevel rejected the access token. Reconnect the integration.") {
    super(message, 401);
    this.name = "GhlAuthError";
  }
}

export class GhlPermissionError extends GhlError {
  constructor(detail: string) {
    super(`GoHighLevel denied access (${detail}). Check that the app has the required scopes.`, 403, detail);
    this.name = "GhlPermissionError";
  }
}

export class GhlNotFoundError extends GhlError {
  constructor(what: string) {
    super(`${what} was not found in GoHighLevel.`, 404);
    this.name = "GhlNotFoundError";
  }
}

export class GhlRequestError extends GhlError {
  constructor(status: number, detail: string) {
    super(`GoHighLevel rejected the request (HTTP ${status}): ${detail}`, status, detail);
    this.name = "GhlRequestError";
  }
}

export class GhlServerError extends GhlError {
  constructor(status: number, detail: string) {
    super(`GoHighLevel is having problems (HTTP ${status}): ${detail}`, status, detail);
    this.name = "GhlServerError";
  }
}

export class GhlNetworkError extends GhlError {
  constructor(message: string) {
    super(message);
    this.name = "GhlNetworkError";
  }
}

/** The connection is unusable until an owner reconnects (refresh token revoked/expired, app uninstalled). */
export class GhlReauthRequiredError extends GhlError {
  constructor(message = "GoHighLevel needs to be reconnected.") {
    super(message, 401);
    this.name = "GhlReauthRequiredError";
  }
}

export function isRetryable(error: unknown) {
  return error instanceof GhlRateLimitError || error instanceof GhlServerError || error instanceof GhlNetworkError;
}
