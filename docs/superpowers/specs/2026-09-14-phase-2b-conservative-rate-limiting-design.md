# Phase 2B — Conservative Rate Limiting Design

Date: 2026-09-14
Status: proposed for implementation planning after user review
Scope: authenticated Supabase Edge Functions, isolated Postgres rate-limit state, and Phase 2A request-body hardening

## 1. Goal

Add conservative burst protection to the four authenticated API Edge Functions without changing normal business behavior or coupling the limiter to business data.

Phase 2B is intentionally designed to stop obvious loops and abusive bursts, not to meter ordinary use. A rate-limiter outage must not become an outage of payments, receipts, or WhatsApp operations.

This phase also closes the known Phase 2A request-size gap: when `Content-Length` is absent, the current helper reads the complete body before measuring it. Phase 2B will enforce the existing 64 KiB raw-body limit while reading the request stream so oversized bodies are rejected without first buffering the complete request.

## 2. Approved Principles

- Rate limiting is **fail-open**.
  - confirmed limit exceeded -> HTTP 429;
  - limiter unavailable, RPC error, timeout, or unexpected limiter failure -> request continues.
- The primary limiter identity is `authenticated user.id + endpoint`.
- IP address is not a blocking key in Phase 2B.
- Each endpoint has an independent counter.
- Use a fixed one-minute window.
- Store counters in the existing Supabase/Postgres project, not an external service.
- Keep limiter state isolated from business tables.
- Do not add foreign keys from limiter state to `auth.users` or business tables.
- Authenticated invalid payloads count toward the endpoint limit.
- `OPTIONS` and requests that fail authentication do not consume the per-user counter.
- No daily quota is introduced.
- Counter retention is 48 hours with periodic database-side cleanup.
- `anon` and `authenticated` clients must not be able to read, write, reset, or invoke the limiter directly.
- No real payment, receipt, or WhatsApp side effect is created solely to test rate limiting.
- DEV is validated before PROD.
- `whatsapp-webhook`, `process-reminders`, CORS allowlisting, and broad abuse observability remain outside Phase 2B.

## 3. Endpoints and Initial Limits

The fixed window is 60 seconds for all in-scope endpoints.

| Endpoint | Limit per authenticated user | Window |
| --- | ---: | ---: |
| `payment-lifecycle` | 60 requests | 60 seconds |
| `payment-receipt` | 30 requests | 60 seconds |
| `send-whatsapp` | 15 requests | 60 seconds |
| `retry-automation-message` | 10 requests | 60 seconds |

These values are deliberately permissive for human use. Phase 2D may adjust them later using observed traffic rather than assumptions.

## 4. Request Flow

For each in-scope Edge Function, the execution order is:

1. Handle `OPTIONS` using the existing CORS behavior.
2. Reject unsupported HTTP methods using existing method handling.
3. Require and validate the bearer token using the existing Supabase Auth flow.
4. Resolve the authenticated `user.id`.
5. Check the rate limit for `user.id + endpoint`.
6. If the limit is exceeded, return 429 before semantic payload validation or business work.
7. If the limiter fails unexpectedly, log a minimal technical failure and continue.
8. Run the Phase 2A request parser/validator.
9. Run tenant/resource authorization and existing business rules.
10. Execute the existing operation.

Consequences:

- invalid JSON or invalid contract fields from a valid authenticated user consume rate-limit capacity;
- unauthenticated requests still receive the normal authentication rejection and do not create per-user limiter state;
- a 429 response occurs before business reads/writes and external side effects;
- a limiter failure does not block legitimate business operations.

## 5. Database Architecture

### 5.1 Private state

Create a dedicated internal schema and table:

`private.rate_limit_counters`

The counter contains only technical limiter state. The logical fields are:

- `user_id uuid not null`
- `endpoint text not null`
- `window_start timestamptz not null`
- `request_count integer not null`

The unique/primary key is the tuple:

`(user_id, endpoint, window_start)`

There is deliberately no foreign key to `auth.users`, academies, students, receipts, payments, or automation messages. Limiter state therefore cannot block deletion or otherwise participate in business-data referential behavior.

The migration must not backfill, update, delete, or rewrite existing business rows.

### 5.2 Atomic increment

Expose one narrow RPC in the API-visible schema, conceptually:

`public.check_rate_limit(...)`

The function is `SECURITY DEFINER`, has an explicit safe `search_path`, validates its technical arguments, calculates the current fixed-minute boundary using database time, and atomically inserts or increments the matching counter row.

Concurrent requests for the same `(user_id, endpoint, window_start)` must serialize through the database conflict/update path so two simultaneous requests cannot both observe the same stale count and bypass the limit.

The RPC returns only the information required by the Edge Function, conceptually:

- `allowed boolean`
- `limit_value integer`
- `remaining integer`
- `retry_after_seconds integer`
- `reset_at timestamptz`

The database remains authoritative for `window_start`, reset time, and count. The caller does not provide its own window timestamp.

The function must reject nonsensical technical parameters such as non-positive limits or unsupported endpoint names rather than creating arbitrary counter namespaces.

### 5.3 Grants and access

Security requirements:

- revoke direct access to `private.rate_limit_counters` from `PUBLIC`, `anon`, and `authenticated`;
- do not expose client CRUD policies for the counter table;
- revoke execution of `public.check_rate_limit` from `PUBLIC`, `anon`, and `authenticated`;
- grant execution only to `service_role`;
- Edge Functions invoke the RPC through the server-side service-role client only after the request JWT has already been independently authenticated and `user.id` is known.

The RPC must not infer the target user from arbitrary client-supplied JWT claims. The trusted Edge Function supplies the already authenticated UUID while using `service_role`.

## 6. Fixed-Window Semantics

The window is aligned to the database clock's minute boundary. For example, requests from `16:20:00` through `16:20:59.999...` share one counter; the next minute uses a new row.

A request whose incremented count is less than or equal to the configured endpoint limit is allowed. The first request whose incremented count is greater than the limit is denied.

Denied requests continue to increment the technical counter for that window. This avoids a separate read/check race and provides an accurate signal of burst magnitude. The response's `remaining` value is clamped to zero.

`retry_after_seconds` is the positive number of whole seconds until the next fixed window, clamped to at least 1 second.

## 7. Edge Shared Helper

Create a small shared rate-limit helper under:

`supabase/functions/_shared/`

Its responsibilities are limited to:

1. hold the approved endpoint configuration;
2. call `check_rate_limit` with the authenticated user UUID and endpoint key;
3. normalize the RPC result;
4. distinguish `allowed`, `limited`, and `limiter failure` outcomes;
5. construct the standard rate-limit headers/429 response data;
6. emit minimal technical logging on fail-open events.

It must not:

- authenticate users;
- parse business payloads;
- query students, receipts, payments, academies, or automation messages;
- send WhatsApp messages;
- generate receipts;
- mutate business data.

Endpoint keys are a closed compile-time set matching the four in-scope functions. Limits are server-owned constants, not request input.

## 8. HTTP Contract

### 8.1 Limited response

When the limiter confirms the request is over quota, return:

- status: `429 Too Many Requests`
- JSON body:

```json
{
  "error": "Too many requests",
  "code": "RATE_LIMITED"
}
```

- `Retry-After: <seconds>`
- `X-RateLimit-Limit: <configured limit>`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset: <reset timestamp representation chosen consistently by the implementation>`

The implementation plan must choose and test one stable representation for `X-RateLimit-Reset`; Unix epoch seconds is preferred because it is unambiguous and compact.

### 8.2 Allowed response

For requests where the limiter succeeds and allows execution, preserve the endpoint's existing status/body and add:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

The shared response integration must preserve existing CORS and `Content-Type` behavior.

### 8.3 Fail-open response

If the limiter itself fails, do not return fabricated rate-limit headers. Continue through validation and business logic using the endpoint's existing response contract.

The failure must not be confused with a confirmed 429.

## 9. Fail-Open and Logging

The limiter is intentionally not a single point of failure.

Fail-open cases include RPC/database errors, malformed/unexpected RPC results, and other limiter-specific exceptions. In those cases:

1. log a structured technical event;
2. do not include request payloads, phone numbers, student names, receipt contents, payment details, bearer tokens, or service-role credentials;
3. continue the request.

The minimal log may contain:

- event type such as `rate_limit_fail_open`;
- endpoint key;
- authenticated `user.id`;
- non-sensitive error classification/message;
- timestamp supplied by the runtime/log platform.

No new persistent logging table is created in Phase 2B. Broader telemetry, dashboards, alerts, and abuse analytics remain Phase 2D work.

## 10. Counter Retention and Cleanup

Counter rows are retained for at most approximately 48 hours, subject to the periodic job cadence.

Use database-side scheduling (`pg_cron` / Supabase Cron) rather than Vercel or an Edge Function solely for cleanup. Before implementation, verify cron support in the DEV project. The migration may enable the supported extension if required and safe for the project.

Schedule a simple database cleanup that deletes only from `private.rate_limit_counters` where `window_start` is older than 48 hours. A reasonable cadence is hourly; exact minute-of-hour is operationally irrelevant and should avoid unnecessary coupling to application traffic.

The cleanup must never target business tables.

If cron cannot be safely enabled in DEV, implementation stops and the design is revisited rather than silently introducing request-path cleanup or an external scheduler.

## 11. Phase 2A Body-Size Hardening

Phase 2A established a 64 KiB raw JSON body limit, but when `Content-Length` is missing the current implementation calls `req.text()` before measuring the encoded byte length. That correctly returns 413 after the fact but does not strictly bound buffering.

Phase 2B will update the shared request reader so:

1. a declared `Content-Length` greater than 64 KiB can still be rejected immediately;
2. when a request body stream exists, read it incrementally;
3. track raw bytes while reading;
4. cancel/stop reading as soon as the total exceeds 64 KiB;
5. return the existing `PAYLOAD_TOO_LARGE` / HTTP 413 contract;
6. decode and parse JSON only after the bounded body has been fully read;
7. preserve the existing `INVALID_JSON` and `INVALID_INPUT` behavior for in-range requests.

This change must be tested independently from the database limiter. It does not change the 64 KiB limit or endpoint business contracts approved in Phase 2A.

## 12. Testing Strategy

### 12.1 Pure/local tests

Use TDD for the shared helper and request-stream hardening.

Required rate-limit helper cases include:

- endpoint configuration maps to exactly `60/30/15/10`;
- allowed RPC result is normalized correctly;
- confirmed limited result maps to `RATE_LIMITED` / 429 data;
- `Retry-After`, limit, remaining, and reset headers are correct;
- limiter exception produces a fail-open outcome;
- malformed RPC result produces a fail-open outcome;
- no sensitive request payload is required by the helper.

Required request-reader cases include:

- exactly 64 KiB is accepted when otherwise valid for the parser contract;
- 64 KiB + 1 byte is rejected with 413;
- oversized declared `Content-Length` is rejected before body parsing;
- oversized chunked/no-`Content-Length` body stops at the boundary rather than reading the entire stream;
- malformed in-range JSON remains `INVALID_JSON`;
- valid in-range JSON behavior remains compatible with Phase 2A.

### 12.2 Database tests

In an isolated/DEV-safe context, verify:

- first request creates one counter;
- requests through the configured limit are allowed;
- first request over the limit is denied;
- different users have independent counters;
- different endpoints for the same user have independent counters;
- new minute uses a new window;
- concurrent increments cannot exceed the allowed count through a race;
- `remaining` never becomes negative in the API result;
- `retry_after_seconds` is positive;
- `anon` cannot execute the RPC;
- `authenticated` cannot execute the RPC;
- direct client access to the private counter table is unavailable;
- `service_role` can execute the RPC;
- cleanup removes only expired counter rows.

Synthetic UUIDs may be used because the limiter has no FK to `auth.users`.

### 12.3 Endpoint contract/order tests

For each in-scope function, prove the order:

- missing/invalid JWT -> existing 401 behavior without per-user counter;
- valid JWT -> limiter runs before Phase 2A semantic validation;
- confirmed limit exceeded -> 429 before business logic;
- limiter failure -> validation/business path remains reachable;
- invalid authenticated payload consumes limiter capacity;
- `OPTIONS` does not consume limiter capacity.

Tests must mock/stub side-effecting dependencies where needed. Do not send real WhatsApp messages, create real payments, or generate persistent receipts solely to prove limiter behavior.

## 13. DEV Rollout

1. Work on an isolated security branch.
2. Run local tests before any remote database change.
3. Capture a fresh DEV structural/business-data baseline.
4. Verify `pg_cron`/Supabase Cron capability in DEV.
5. Apply the isolated limiter migration to DEV only.
6. Verify schema, table, RPC definition, grants, and cleanup schedule.
7. Verify no business-table counts/invariants changed because of the migration.
8. Deploy the four in-scope Edge Functions to DEV.
9. Run controlled limiter tests using synthetic limiter state and mocked/non-side-effecting endpoint paths where possible.
10. Run repository CI and review the complete diff.

DEV business-data invariants should include the same structural checks used in prior security rollout work: core row counts as a snapshot, non-null academy ownership where required, and tenant relationship mismatch checks. Natural business activity can change absolute counts, so a changed historical count alone is not corruption; use a fresh preflight immediately before rollout and evaluate structural invariants.

## 14. Git and Vercel Discipline

Use one grouped Phase 2B branch/PR after the design and implementation plan are approved.

The repository intentionally disables automatic Vercel deployment for non-`main` branches. Preserve that configuration. Phase 2B must not modify Vercel deployment settings merely to test Supabase Edge Functions.

Before merge:

- all relevant local tests pass;
- CI is green on the exact reviewed head SHA;
- diff contains no unrelated refactor or business-rule change;
- DEV validation is complete.

## 15. PROD Rollout

Production promotion is sequential and conservative:

1. Capture a fresh PROD preflight immediately before rollout.
2. Confirm current function versions/hashes and migration state.
3. Apply only the reviewed Phase 2B database migration.
4. Verify limiter schema/RPC/grants/cron before touching Edge Functions.
5. Confirm business-data structural invariants remain unchanged.
6. Promote the exact DEV-validated Edge Function bundle one function at a time.
7. After each function, verify ACTIVE status and expected bundle/hash where the platform exposes it.
8. After all four functions, run a fresh PROD postflight.
9. Compare preflight/postflight structural invariants and investigate any unexpected divergence before declaring completion.

No production test should intentionally trigger real WhatsApp sends, payments, or receipt creation merely to exercise the limiter.

## 16. Stop Conditions

Stop rollout and investigate rather than continuing if any of the following occurs:

- limiter migration unexpectedly touches a business table;
- grants allow `anon` or `authenticated` to invoke/reset/read limiter state;
- concurrency testing shows a bypass race;
- fail-open behavior instead blocks requests on limiter failure;
- cleanup cannot be isolated to the private counter table;
- DEV cron support cannot be safely established;
- Phase 2A request-body behavior regresses for valid requests;
- tenant/business structural invariants unexpectedly fail;
- CI is not green on the exact candidate revision;
- deployed function contents do not match the DEV-validated candidate.

## 17. Success Criteria

Phase 2B is complete only when:

- all four authenticated APIs enforce their approved independent per-user burst limits;
- fixed-window counters are atomic under concurrency;
- confirmed excess returns stable HTTP 429 / `RATE_LIMITED` with `Retry-After`;
- normal allowed responses expose consistent rate-limit metadata when the limiter succeeds;
- limiter failures are genuinely fail-open;
- client roles cannot inspect or manipulate limiter state;
- counter cleanup is automatic and isolated with approximately 48-hour retention;
- the 64 KiB body limit is enforced during streaming even without `Content-Length`;
- no existing business data is rewritten or lost;
- DEV is validated before PROD;
- CI is green;
- PROD postflight preserves business-data structural integrity.

## 18. Non-Goals / Later Phases

Phase 2B does not implement:

- IP-based blocking or unauthenticated request rate limiting;
- daily quotas;
- Redis/Upstash or another external limiter service;
- CORS allowlisting;
- `whatsapp-webhook` hardening;
- `process-reminders` hardening;
- broad abuse dashboards, persistent security telemetry, or alerting;
- automatic tuning of limits;
- unrelated business-schema cleanup;
- changes to Supabase Auth leaked-password settings.

CORS, webhook, and cron-request hardening remain Phase 2C. Broader abuse testing and observability remain Phase 2D.