# Phase 2B — Conservative Rate Limiting Design

Date: 2026-09-14
Status: proposed for implementation planning after user review
Scope: authenticated Supabase Edge Functions, isolated Postgres rate-limit state, and Phase 2A request-body hardening

## 1. Goal

Add conservative burst protection to the four authenticated API Edge Functions without changing normal business behavior or coupling the limiter to business data.

Phase 2B is designed to stop obvious loops and abusive bursts, not to meter ordinary use. A rate-limiter outage must not become an outage of payments, receipts, or WhatsApp operations.

This phase also closes the known Phase 2A request-size gap: when `Content-Length` is absent, the current helper reads the complete body before measuring it. Phase 2B will enforce the existing 64 KiB raw-body limit while reading the request stream so oversized bodies are rejected without first buffering the complete request.

## 2. Approved Principles

- Rate limiting is **fail-open**: confirmed excess -> HTTP 429; limiter failure -> request continues.
- Primary identity: `authenticated user.id + endpoint`.
- IP is not a blocking key in Phase 2B.
- Each endpoint has an independent fixed one-minute counter.
- Counters live in the existing Supabase/Postgres project, not an external service.
- Limiter state is isolated from business tables and has no FK to `auth.users` or business data.
- Authenticated invalid payloads count toward the limit.
- `OPTIONS` and authentication failures do not consume the per-user counter.
- No daily quota is introduced.
- Counter retention uses a 48-hour expiry threshold with hourly database-side cleanup.
- `anon` and `authenticated` clients cannot read, write, reset, or invoke the limiter.
- No real payment, receipt, or WhatsApp side effect is created solely to test rate limiting.
- DEV is validated before PROD.
- `whatsapp-webhook`, `process-reminders`, CORS allowlisting, and broad abuse observability remain outside Phase 2B.

## 3. Endpoints and Initial Limits

| Endpoint | Limit per authenticated user | Window |
| --- | ---: | ---: |
| `payment-lifecycle` | 60 requests | 60 seconds |
| `payment-receipt` | 30 requests | 60 seconds |
| `send-whatsapp` | 15 requests | 60 seconds |
| `retry-automation-message` | 10 requests | 60 seconds |

These values are deliberately permissive for human use. Phase 2D may adjust them later using observed traffic rather than assumptions.

## 4. Request Flow

For each in-scope Edge Function:

1. Handle `OPTIONS` with existing CORS behavior.
2. Reject unsupported methods with existing method handling.
3. Require and validate the bearer token using the existing Supabase Auth flow.
4. Resolve authenticated `user.id`.
5. Check rate limit for `user.id + endpoint`.
6. Confirmed excess -> return 429 before semantic validation or business work.
7. Limiter failure -> log minimally and continue.
8. Run Phase 2A request parsing/validation.
9. Run tenant/resource authorization and existing business rules.
10. Execute the existing operation.

Therefore invalid JSON/contract fields from a valid authenticated user consume capacity; unauthenticated requests do not create per-user limiter state; 429 occurs before business reads/writes or external side effects; and limiter failure does not block legitimate operations.

## 5. Database Architecture

### 5.1 Private state

Create `private.rate_limit_counters` containing only technical state:

- `user_id uuid not null`
- `endpoint text not null`
- `window_start timestamptz not null`
- `request_count bigint not null`

Primary/unique key: `(user_id, endpoint, window_start)`.

There is no FK to `auth.users`, academies, students, receipts, payments, or automation messages. The migration must not backfill, update, delete, or rewrite existing business rows.

### 5.2 Atomic increment

Expose one narrow API-visible RPC: `public.check_rate_limit(...)`.

It is `SECURITY DEFINER`, uses an explicit safe `search_path`, validates technical arguments, calculates the current fixed-minute boundary from database time, and atomically inserts or updates the matching counter. Concurrent requests for the same key must serialize through the database conflict/update path; no read-then-write race is acceptable.

The RPC returns only:

- `allowed boolean`
- `limit_value integer`
- `remaining integer`
- `retry_after_seconds integer`
- `reset_at timestamptz`

Database time is authoritative. The caller does not provide a window timestamp. The function rejects non-positive limits and endpoint names outside the four approved keys.

The counter is capped at `limit + 1`. The first request that moves the counter to `limit + 1` is denied; later denied requests remain denied without unbounded numeric growth. `remaining` is clamped to zero.

### 5.3 Grants and access

- Revoke direct access to `private.rate_limit_counters` from `PUBLIC`, `anon`, and `authenticated`.
- Do not expose client CRUD policies for the counter table.
- Revoke execution of `public.check_rate_limit` from `PUBLIC`, `anon`, and `authenticated`.
- Grant execution only to `service_role`.
- Edge Functions call the RPC through the server-side service-role client only after independently authenticating the request and resolving `user.id`.

The trusted Edge Function supplies the authenticated UUID. The RPC does not trust arbitrary client JWT claims to select the target user.

## 6. Fixed-Window Semantics

Windows align to the database clock's minute boundary. Requests from `16:20:00` through `16:20:59.999...` share one row; the next minute uses a new row.

Counts `1..limit` are allowed. `limit + 1` and later requests in that window are denied. `retry_after_seconds` is the whole-second wait until the next window, clamped to at least 1 second.

## 7. Edge Shared Helper

Create a focused helper under `supabase/functions/_shared/` that:

1. owns the approved endpoint configuration;
2. calls `check_rate_limit` with authenticated user UUID and endpoint key;
3. validates/normalizes the RPC result;
4. distinguishes `allowed`, `limited`, and `fail-open` outcomes;
5. constructs standard rate-limit response metadata;
6. emits minimal technical logging on fail-open events.

It does not authenticate, parse business payloads, query business tables, send WhatsApp, generate receipts, or mutate business data. Endpoint keys are a closed compile-time set and limits are server-owned constants, never request input.

## 8. HTTP Contract

### 8.1 Limited response

Confirmed excess returns HTTP 429 with:

```json
{
  "error": "Too many requests",
  "code": "RATE_LIMITED"
}
```

Headers:

- `Retry-After: <seconds>`
- `X-RateLimit-Limit: <configured limit>`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset: <Unix epoch seconds>`

### 8.2 Allowed response

When the limiter succeeds and allows execution, preserve the endpoint's existing status/body and add:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset` as Unix epoch seconds

Existing CORS and `Content-Type` behavior must be preserved.

### 8.3 Fail-open response

If the limiter fails, do not fabricate rate-limit headers. Continue through validation/business logic using the endpoint's existing response contract.

## 9. Fail-Open and Logging

Fail-open covers RPC/database errors, malformed/unexpected RPC results, and limiter-specific exceptions.

Log only a structured technical event containing the event type (for example `rate_limit_fail_open`), endpoint key, authenticated `user.id`, and a non-sensitive error classification/message. Do not log request payloads, phone numbers, student names, receipt contents, payment details, bearer tokens, or service-role credentials.

No persistent logging table is added in Phase 2B. Broader telemetry, dashboards, alerts, and abuse analytics remain Phase 2D.

## 10. Counter Retention and Cleanup

Use database-side scheduling (`pg_cron` / Supabase Cron), not Vercel or an Edge Function solely for cleanup.

Before migration, verify cron support in DEV. If the supported extension is available but not enabled, the reviewed migration may enable it. Schedule an hourly SQL/database-function job that deletes only `private.rate_limit_counters` rows where `window_start < now() - interval '48 hours'`.

Because cleanup is hourly, physical deletion can occur between 48 and roughly 49 hours after a row's window; the expiry threshold itself is exactly 48 hours.

If cron cannot be safely enabled in DEV, stop and revisit the design rather than silently adding request-path cleanup or an external scheduler.

## 11. Phase 2A Body-Size Hardening

Update the shared request reader so:

1. declared `Content-Length > 64 KiB` is rejected immediately;
2. otherwise, read `req.body` incrementally;
3. track raw bytes while reading;
4. cancel/stop reading as soon as total bytes exceed 64 KiB;
5. return the existing HTTP 413 / `PAYLOAD_TOO_LARGE` contract;
6. decode and parse JSON only after the bounded body is fully read;
7. preserve existing `INVALID_JSON` and `INVALID_INPUT` behavior for in-range requests.

This does not change the 64 KiB limit or Phase 2A endpoint contracts.

## 12. Testing Strategy

### 12.1 Pure/local tests

Use TDD. Required cases include:

- endpoint limits are exactly `60/30/15/10`;
- allowed, limited, malformed-RPC, and exception/fail-open outcomes;
- correct `Retry-After`, limit, remaining, and Unix-epoch reset headers;
- exactly 64 KiB accepted when otherwise valid;
- 64 KiB + 1 rejected with 413;
- oversized declared `Content-Length` rejected before parsing;
- oversized no-`Content-Length` stream stops at the boundary instead of reading the complete stream;
- malformed in-range JSON remains `INVALID_JSON`;
- valid in-range Phase 2A behavior remains compatible.

### 12.2 Database tests

In an isolated/DEV-safe context verify:

- first request creates one counter;
- requests through the limit are allowed and first excess is denied;
- different users and endpoints have independent counters;
- a new minute uses a new window;
- concurrent increments cannot bypass the limit;
- counter caps at `limit + 1`;
- `remaining` is never negative and `retry_after_seconds` is positive;
- `anon` and `authenticated` cannot execute the RPC;
- direct client access to the private table is unavailable;
- `service_role` can execute the RPC;
- cleanup removes only expired limiter rows.

Synthetic UUIDs are allowed because there is no FK to `auth.users`.

### 12.3 Endpoint order tests

For each in-scope function prove:

- missing/invalid JWT -> existing 401 behavior without per-user counter;
- valid JWT -> limiter before Phase 2A semantic validation;
- confirmed excess -> 429 before business logic;
- limiter failure -> validation/business path remains reachable;
- invalid authenticated payload consumes capacity;
- `OPTIONS` does not consume capacity.

Mock/stub side-effecting dependencies. Do not send real WhatsApp messages, create real payments, or generate persistent receipts solely to prove limiter behavior.

## 13. DEV Rollout

1. Work on the isolated Phase 2B security branch.
2. Run local tests before remote database changes.
3. Capture a fresh DEV structural/business-data baseline.
4. Verify `pg_cron`/Supabase Cron capability.
5. Apply the isolated limiter migration to DEV only.
6. Verify schema, table, RPC, grants, and cleanup schedule.
7. Confirm business-table structural invariants remain clean.
8. Deploy the four in-scope Edge Functions to DEV.
9. Run controlled non-side-effecting limiter tests.
10. Run repository CI and review the complete diff.

Use fresh preflight snapshots. Natural business activity can change absolute historical row counts, so structural invariants and immediate before/after comparison are authoritative rather than old counts alone.

## 14. Git and Vercel Discipline

Use one grouped Phase 2B branch/PR after the design and implementation plan are approved. Preserve the repository's configuration that disables automatic Vercel deployment for non-`main` branches; Phase 2B must not change Vercel deployment settings merely to test Supabase Edge Functions.

Before merge, all relevant tests and CI must be green on the exact reviewed head SHA, DEV validation must be complete, and the diff must contain no unrelated refactor or business-rule change.

## 15. PROD Rollout

1. Capture a fresh PROD preflight immediately before rollout.
2. Confirm current function versions/hashes and migration state.
3. Apply only the reviewed Phase 2B database migration.
4. Verify limiter schema/RPC/grants/cron before Edge Function promotion.
5. Confirm business-data structural invariants remain clean.
6. Promote the exact DEV-validated Edge Function bundle one function at a time.
7. After each function, verify ACTIVE status and expected hash/bundle identity where exposed.
8. Run fresh PROD postflight after all four.
9. Investigate unexpected divergence before declaring completion.

No production test intentionally triggers real WhatsApp sends, payments, or receipt creation merely to exercise the limiter.

## 16. Stop Conditions

Stop and investigate if:

- migration unexpectedly touches a business table;
- grants let `anon` or `authenticated` invoke/reset/read limiter state;
- concurrency testing shows a bypass race;
- limiter failure blocks requests instead of failing open;
- cleanup cannot be isolated to the private counter table;
- DEV cron support cannot be safely established;
- Phase 2A request-body behavior regresses;
- tenant/business structural invariants unexpectedly fail;
- CI is not green on the exact candidate revision;
- deployed function contents do not match the DEV-validated candidate.

## 17. Success Criteria

Phase 2B is complete only when:

- all four authenticated APIs enforce approved independent per-user burst limits;
- fixed-window counters are atomic under concurrency;
- confirmed excess returns stable HTTP 429 / `RATE_LIMITED` with `Retry-After`;
- allowed responses expose consistent rate-limit metadata when the limiter succeeds;
- limiter failures are genuinely fail-open;
- client roles cannot inspect or manipulate limiter state;
- cleanup is automatic with an exact 48-hour expiry threshold;
- the 64 KiB body limit is enforced while streaming even without `Content-Length`;
- no existing business data is rewritten or lost;
- DEV is validated before PROD;
- CI is green;
- PROD postflight preserves business-data structural integrity.

## 18. Non-Goals / Later Phases

Phase 2B does not implement IP-based blocking, unauthenticated rate limiting, daily quotas, Redis/Upstash, CORS allowlisting, `whatsapp-webhook` hardening, `process-reminders` hardening, persistent security telemetry/alerts, automatic limit tuning, unrelated business-schema cleanup, or Supabase Auth leaked-password-setting changes.

CORS, webhook, and cron-request hardening remain Phase 2C. Broader abuse testing and observability remain Phase 2D.