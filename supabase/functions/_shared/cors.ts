export const ALLOWED_BROWSER_ORIGINS = new Set([
  "https://alunos.dassaevylabs.com.br",
  "https://students-registration-multi-academy.vercel.app",
  "https://students-registration-git-e6e85e-jdassaevy12345-6044s-projects.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

const ALLOWED_REQUEST_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-retry-count",
  "traceparent",
  "tracestate",
  "baggage",
].join(", ");

export function isAllowedCorsRequest(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !origin || ALLOWED_BROWSER_ORIGINS.has(origin);
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_REQUEST_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-ID",
    "Vary": "Origin",
  };

  if (origin && ALLOWED_BROWSER_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}
