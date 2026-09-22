const requestIds = new WeakMap<Request, string>();

export type SafeLogFields = {
  status?: number | string | null;
  code?: string | number | null;
  outcome?: string | null;
  duration_ms?: number | null;
  count?: number | null;
  method?: string | null;
};

function cleanPrimitive(value: unknown, maxLength = 96): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function cleanStatus(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return cleanPrimitive(value, 32);
}

function cleanNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export function requestIdFor(req: Request): string {
  const cached = requestIds.get(req);
  if (cached) return cached;

  const requestId = crypto.randomUUID();
  requestIds.set(req, requestId);
  return requestId;
}

export function traceHeaders(req: Request): Record<string, string> {
  return { "X-Request-ID": requestIdFor(req) };
}

export function logSafeEvent(
  req: Request,
  endpoint: string,
  event: string,
  fields: SafeLogFields = {},
  level: "info" | "warn" | "error" = "info",
) {
  const status = fields.status !== undefined ? cleanStatus(fields.status) : undefined;
  const durationMs = cleanNonNegativeInteger(fields.duration_ms);
  const count = cleanNonNegativeInteger(fields.count);

  const entry = {
    ts: new Date().toISOString(),
    request_id: requestIdFor(req),
    endpoint: cleanPrimitive(endpoint, 64),
    event: cleanPrimitive(event, 96),
    ...(status !== undefined ? { status } : {}),
    ...(fields.code !== undefined ? { code: cleanPrimitive(fields.code, 64) } : {}),
    ...(fields.outcome !== undefined ? { outcome: cleanPrimitive(fields.outcome, 64) } : {}),
    ...(durationMs !== null ? { duration_ms: durationMs } : {}),
    ...(count !== null ? { count } : {}),
    ...(fields.method !== undefined ? { method: cleanPrimitive(fields.method, 16) } : {}),
  };

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
