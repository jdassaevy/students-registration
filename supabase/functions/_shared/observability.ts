const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const requestIds = new WeakMap<Request, string>();

export type SafeLogFields = {
  status?: number | string | null;
  code?: string | number | null;
  outcome?: string | null;
  duration_ms?: number | null;
  count?: number | null;
  method?: string | null;
};

function cleanString(value: unknown, maxLength = 96): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

export function requestIdFor(req: Request): string {
  const cached = requestIds.get(req);
  if (cached) return cached;

  const incoming = String(req.headers.get("x-request-id") || "").trim();
  const requestId = REQUEST_ID_PATTERN.test(incoming)
    ? incoming
    : crypto.randomUUID();

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
  const entry = {
    ts: new Date().toISOString(),
    request_id: requestIdFor(req),
    endpoint: cleanString(endpoint, 64),
    event: cleanString(event, 96),
    ...(fields.status !== undefined ? { status: fields.status } : {}),
    ...(fields.code !== undefined ? { code: cleanString(fields.code, 64) } : {}),
    ...(fields.outcome !== undefined ? { outcome: cleanString(fields.outcome, 64) } : {}),
    ...(Number.isFinite(Number(fields.duration_ms))
      ? { duration_ms: Math.max(0, Math.round(Number(fields.duration_ms))) }
      : {}),
    ...(Number.isFinite(Number(fields.count))
      ? { count: Math.max(0, Math.round(Number(fields.count))) }
      : {}),
    ...(fields.method !== undefined ? { method: cleanString(fields.method, 16) } : {}),
  };

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
