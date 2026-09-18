export type RateLimitEndpoint =
  | "payment-lifecycle"
  | "payment-receipt"
  | "send-whatsapp"
  | "retry-automation-message";

export const RATE_LIMITS: Readonly<Record<RateLimitEndpoint, number>> = Object.freeze({
  "payment-lifecycle": 60,
  "payment-receipt": 30,
  "send-whatsapp": 15,
  "retry-automation-message": 10,
});

export type RateLimitOutcome =
  | { kind: "allowed"; headers: Record<string, string> }
  | { kind: "limited"; status: 429; body: { error: "Too many requests"; code: "RATE_LIMITED" }; headers: Record<string, string> }
  | { kind: "fail-open"; headers: Record<string, never> };

function failOpen(endpoint: RateLimitEndpoint, userId: string, classification: string): RateLimitOutcome {
  console.warn({
    event: "rate_limit_fail_open",
    endpoint,
    user_id: userId,
    error: classification,
  });
  return { kind: "fail-open", headers: {} };
}

export async function checkRateLimit(
  admin: { rpc: Function },
  userId: string,
  endpoint: RateLimitEndpoint,
): Promise<RateLimitOutcome> {
  const configuredLimit = RATE_LIMITS[endpoint];

  try {
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_user_id: userId,
      p_endpoint: endpoint,
      p_limit: configuredLimit,
    });

    if (error) return failOpen(endpoint, userId, "rpc_error");
    if (!Array.isArray(data) || data.length !== 1) {
      return failOpen(endpoint, userId, "invalid_row_count");
    }

    const row = data[0] as Record<string, unknown>;
    const allowed = row.allowed;
    const limitValue = row.limit_value;
    const remaining = row.remaining;
    const retryAfter = row.retry_after_seconds;
    const resetAt = row.reset_at;

    if (
      typeof allowed !== "boolean" ||
      !Number.isInteger(limitValue) ||
      limitValue !== configuredLimit ||
      !Number.isInteger(remaining) ||
      (remaining as number) < 0 ||
      (remaining as number) > configuredLimit ||
      !Number.isInteger(retryAfter) ||
      (retryAfter as number) < 1 ||
      typeof resetAt !== "string"
    ) {
      return failOpen(endpoint, userId, "invalid_rpc_row");
    }

    const resetEpoch = Date.parse(resetAt) / 1000;
    if (!Number.isInteger(resetEpoch) || resetEpoch <= 0) {
      return failOpen(endpoint, userId, "invalid_reset_at");
    }

    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(limitValue),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(resetEpoch),
    };

    if (allowed) return { kind: "allowed", headers };

    return {
      kind: "limited",
      status: 429,
      body: { error: "Too many requests", code: "RATE_LIMITED" },
      headers: {
        ...headers,
        "Retry-After": String(retryAfter),
        "X-RateLimit-Remaining": "0",
      },
    };
  } catch {
    return failOpen(endpoint, userId, "rpc_exception");
  }
}
