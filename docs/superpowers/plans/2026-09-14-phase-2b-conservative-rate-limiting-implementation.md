# Phase 2B Conservative Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conservative per-user/per-endpoint burst protection to the four authenticated Supabase Edge Functions, keep the limiter fail-open and isolated from business data, and make the existing 64 KiB JSON body cap a true streaming bound.

**Architecture:** Add an isolated `private.rate_limit_counters` table plus a service-role-only atomic `public.check_rate_limit` RPC and hourly Postgres cleanup. A focused Edge helper owns the four approved limits and converts RPC results into allowed/limited/fail-open outcomes; each handler calls it after JWT authentication and before Phase 2A parsing. Separately, `readJsonObject` is hardened to stop reading once the existing 64 KiB boundary is exceeded.

**Tech Stack:** Supabase Edge Functions / Deno, TypeScript, Supabase/Postgres, PL/pgSQL, `pg_cron` / Supabase Cron, Node.js 22 test runner, GitHub Actions, Supabase DEV + PROD.

**Spec:** `docs/superpowers/specs/2026-09-14-phase-2b-conservative-rate-limiting-design.md`

## Global Constraints

- Fixed window: exactly 60 seconds, aligned to the database minute boundary.
- Limits per authenticated user: `payment-lifecycle=60`, `payment-receipt=30`, `send-whatsapp=15`, `retry-automation-message=10` per minute.
- Identity: authenticated `user.id + endpoint`; IP is not a blocking key.
- Confirmed excess returns HTTP `429` with code `RATE_LIMITED`.
- Limiter failures are fail-open and must not block the business operation.
- Authenticated invalid payloads consume capacity; `OPTIONS` and authentication failures do not.
- No daily quota.
- Counter threshold retention: exactly 48 hours; cleanup runs hourly, so physical deletion may occur roughly 48–49 hours after the row window.
- Counter value is capped at `limit + 1`.
- `X-RateLimit-Reset` is Unix epoch seconds.
- `anon` and `authenticated` cannot read/write limiter state or execute the limiter RPC; execution is granted only to `service_role`.
- No FK from limiter state to `auth.users` or any business table.
- Existing JSON body limit remains exactly `64 * 1024` raw bytes.
- No real WhatsApp send, payment mutation, retry, or receipt creation solely to test the limiter.
- `whatsapp-webhook`, `process-reminders`, CORS allowlisting, broad abuse observability, and leaked-password settings are out of scope.
- Preserve `vercel.json`; non-`main` deploys stay disabled.
- DEV first, PROD last; use fresh pre/post structural integrity snapshots around database/function rollout.
- Stop rather than improvise if DEV cannot safely support `pg_cron`/Supabase Cron.

---

## File Map

**Create**

- `supabase/migrations/20260914_phase2b_rate_limiting.sql` — private counter schema/table, atomic RPC, grants, and hourly cleanup schedule.
- `supabase/functions/_shared/rate-limit.ts` — endpoint configuration, RPC normalization, fail-open behavior, headers, and 429 payload.
- `app/js/tests/api-rate-limit.test.mjs` — executable helper behavior tests.
- `app/js/tests/api-rate-limit-migration.test.mjs` — static security/DDL contract for the migration.
- `app/js/tests/api-endpoint-rate-limit-contract.test.mjs` — source-contract tests proving auth → limiter → parser ordering in all four handlers.

**Modify**

- `supabase/functions/_shared/api-validation.ts` — replace full-body `req.text()` buffering with bounded stream reading.
- `app/js/tests/api-validation.test.mjs` — add no-`Content-Length` streaming boundary/cancel tests.
- `supabase/functions/payment-receipt/index.ts`
- `supabase/functions/retry-automation-message/index.ts`
- `supabase/functions/send-whatsapp/index.ts`
- `supabase/functions/payment-lifecycle/index.ts`

**Do not modify**

- business tables/migrations unrelated to limiter state,
- `supabase/functions/whatsapp-webhook/`,
- `supabase/functions/process-reminders/`,
- `vercel.json`,
- frontend business behavior.

---

### Task 1: Harden the 64 KiB Request Reader with TDD

**Files:**
- Modify: `supabase/functions/_shared/api-validation.ts`
- Modify: `app/js/tests/api-validation.test.mjs`

**Interfaces:**
- Consumes: existing `MAX_JSON_BYTES`, `ApiInputError`, and `readJsonObject(req, maxBytes?)` API from Phase 2A.
- Produces: the same public `readJsonObject` signature and error contract, but no-`Content-Length` requests stop reading at `maxBytes + 1` rather than buffering the entire body.

- [ ] **Step 1: Add failing streaming tests**

Extend `app/js/tests/api-validation.test.mjs` with a custom `ReadableStream` that records pulls/cancellation. Cover two exact cases:

```js
test('readJsonObject rejects no-content-length stream at max + 1 without draining it', async () => {
  let pulls = 0;
  let cancelled = false;
  const chunk = new TextEncoder().encode('x'.repeat(1024));
  const stream = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(chunk);
      if (pulls >= 100) controller.close();
    },
    cancel() { cancelled = true; },
  });
  const req = new Request('https://example.test', { method: 'POST', body: stream, duplex: 'half' });
  await assert.rejects(
    () => readJsonObject(req, 2048),
    error => error instanceof ApiInputError && error.code === 'PAYLOAD_TOO_LARGE' && error.status === 413,
  );
  assert.equal(cancelled, true);
  assert.ok(pulls < 100);
});

test('readJsonObject still accepts an in-range streamed JSON object', async () => {
  const raw = JSON.stringify({ ok: true });
  const req = new Request('https://example.test', { method: 'POST', body: raw });
  assert.deepEqual(await readJsonObject(req), { ok: true });
});
```

If Node's `Request` requires the `duplex` property only at runtime and TypeScript is not involved in this `.mjs` test, keep it exactly there; do not change production request types for Node compatibility.

- [ ] **Step 2: Run RED**

```bash
node --test app/js/tests/api-validation.test.mjs
```

Expected: the no-`Content-Length` test fails because the current implementation calls `req.text()` and drains the body.

- [ ] **Step 3: Implement bounded stream reading**

Replace only the body-reading portion of `readJsonObject` in `supabase/functions/_shared/api-validation.ts`. Keep the declared `Content-Length` early rejection. Use `req.body?.getReader()`, accumulate `Uint8Array` chunks only while cumulative bytes are `<= maxBytes`, call `reader.cancel()` before throwing at `maxBytes + 1`, concatenate accepted chunks, decode once with `TextDecoder`, then run the existing JSON/object validation.

Required production shape:

```ts
async function readBoundedBody(req: Request, maxBytes: number): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiInputError("PAYLOAD_TOO_LARGE", 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
```

`readJsonObject` must call `readBoundedBody(req, maxBytes)` instead of `req.text()`. Do not change `INVALID_JSON`, `INVALID_INPUT`, or the 64 KiB constant.

- [ ] **Step 4: Run GREEN and Phase 2A regression**

```bash
node --test app/js/tests/api-validation.test.mjs app/js/tests/api-endpoint-validation-contract.test.mjs app/js/tests/payment-lifecycle-monthly-receipt.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit locally**

```bash
git add supabase/functions/_shared/api-validation.ts app/js/tests/api-validation.test.mjs
git commit -m "security: bound streamed API request bodies"
```

Do not push yet.

---

### Task 2: Add the Isolated Atomic Postgres Limiter

**Files:**
- Create: `supabase/migrations/20260914_phase2b_rate_limiting.sql`
- Create: `app/js/tests/api-rate-limit-migration.test.mjs`

**Interfaces:**
- Produces: `public.check_rate_limit(p_user_id uuid, p_endpoint text, p_limit integer)` returning `allowed`, `limit_value`, `remaining`, `retry_after_seconds`, `reset_at`.
- Produces: `private.rate_limit_counters(user_id, endpoint, window_start, request_count)` with PK `(user_id, endpoint, window_start)`.
- Produces: hourly cron cleanup of rows older than the exact 48-hour threshold.

- [ ] **Step 1: Write a failing migration security-contract test**

Create `app/js/tests/api-rate-limit-migration.test.mjs` that reads the migration as text and asserts all critical invariants:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL('../../../supabase/migrations/20260914_phase2b_rate_limiting.sql', import.meta.url),
  'utf8',
);

test('Phase 2B migration isolates limiter state and exposes only service-role RPC', () => {
  assert.match(sql, /create schema if not exists private/i);
  assert.match(sql, /private\.rate_limit_counters/i);
  assert.match(sql, /primary key\s*\(user_id,\s*endpoint,\s*window_start\)/i);
  assert.doesNotMatch(sql, /references\s+(auth\.|public\.)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path\s*=\s*pg_catalog,\s*private/i);
  assert.match(sql, /revoke execute on function public\.check_rate_limit.*from public, anon, authenticated/is);
  assert.match(sql, /grant execute on function public\.check_rate_limit.*to service_role/is);
  assert.match(sql, /least\([^;]*p_limit[^;]*\+\s*1/is);
});

test('Phase 2B cleanup targets only expired private limiter rows', () => {
  assert.match(sql, /cron\.schedule/i);
  assert.match(sql, /17 \* \* \* \*/);
  assert.match(sql, /delete from private\.rate_limit_counters/i);
  assert.match(sql, /interval '48 hours'/i);
  assert.doesNotMatch(sql, /delete from public\.(students|classes|receipts|payment_events|automation_messages)/i);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test app/js/tests/api-rate-limit-migration.test.mjs
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the migration**

Implement `supabase/migrations/20260914_phase2b_rate_limiting.sql` with these exact properties:

```sql
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table private.rate_limit_counters (
  user_id uuid not null,
  endpoint text not null check (endpoint in (
    'payment-lifecycle',
    'payment-receipt',
    'send-whatsapp',
    'retry-automation-message'
  )),
  window_start timestamptz not null,
  request_count bigint not null check (request_count >= 1),
  primary key (user_id, endpoint, window_start)
);

revoke all on private.rate_limit_counters from public, anon, authenticated;

create or replace function public.check_rate_limit(
  p_user_id uuid,
  p_endpoint text,
  p_limit integer
)
returns table (
  allowed boolean,
  limit_value integer,
  remaining integer,
  retry_after_seconds integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz := date_trunc('minute', v_now);
  v_reset_at timestamptz := date_trunc('minute', v_now) + interval '1 minute';
  v_count bigint;
begin
  if p_user_id is null then raise exception 'invalid user'; end if;
  if p_endpoint not in ('payment-lifecycle','payment-receipt','send-whatsapp','retry-automation-message') then
    raise exception 'invalid endpoint';
  end if;
  if p_limit is null or p_limit <= 0 then raise exception 'invalid limit'; end if;

  insert into private.rate_limit_counters(user_id, endpoint, window_start, request_count)
  values (p_user_id, p_endpoint, v_window_start, 1)
  on conflict (user_id, endpoint, window_start)
  do update set request_count = least(
    private.rate_limit_counters.request_count + 1,
    p_limit::bigint + 1
  )
  returning request_count into v_count;

  return query select
    v_count <= p_limit,
    p_limit,
    greatest(p_limit::bigint - v_count, 0)::integer,
    greatest(ceil(extract(epoch from (v_reset_at - clock_timestamp())))::integer, 1),
    v_reset_at;
end;
$$;

revoke execute on function public.check_rate_limit(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, integer) to service_role;
```

For cleanup, first verify DEV supports Supabase Cron/`pg_cron` before this migration is applied. If supported, include the reviewed extension/schedule statements and schedule the SQL delete at minute 17 each hour (`17 * * * *`). The scheduled command must be exactly scoped to:

```sql
delete from private.rate_limit_counters
where window_start < now() - interval '48 hours';
```

If `pg_cron` is unavailable or cannot be enabled safely, STOP; do not replace it with request-path cleanup or Vercel scheduling.

- [ ] **Step 4: Run GREEN**

```bash
node --test app/js/tests/api-rate-limit-migration.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit locally**

```bash
git add supabase/migrations/20260914_phase2b_rate_limiting.sql app/js/tests/api-rate-limit-migration.test.mjs
git commit -m "security: add isolated API rate limit storage"
```

Do not apply to PROD and do not push yet.

---

### Task 3: Build the Shared Edge Rate-Limit Helper with TDD

**Files:**
- Create: `supabase/functions/_shared/rate-limit.ts`
- Create: `app/js/tests/api-rate-limit.test.mjs`

**Interfaces:**

```ts
export type RateLimitEndpoint =
  | "payment-lifecycle"
  | "payment-receipt"
  | "send-whatsapp"
  | "retry-automation-message";

export const RATE_LIMITS: Readonly<Record<RateLimitEndpoint, number>>;

export type RateLimitOutcome =
  | { kind: "allowed"; headers: Record<string, string> }
  | { kind: "limited"; status: 429; body: { error: "Too many requests"; code: "RATE_LIMITED" }; headers: Record<string, string> }
  | { kind: "fail-open"; headers: Record<string, never> };

export async function checkRateLimit(
  admin: { rpc: Function },
  userId: string,
  endpoint: RateLimitEndpoint,
): Promise<RateLimitOutcome>;
```

- [ ] **Step 1: Write failing helper tests**

Use the same `stripTypeScriptTypes` loading pattern already used by `api-validation.test.mjs`. Stub `admin.rpc` and assert:

```js
assert.deepEqual(RATE_LIMITS, {
  'payment-lifecycle': 60,
  'payment-receipt': 30,
  'send-whatsapp': 15,
  'retry-automation-message': 10,
});
```

For an allowed RPC row `{ allowed:true, limit_value:15, remaining:14, retry_after_seconds:40, reset_at:'2026-09-14T20:01:00Z' }`, assert `kind === 'allowed'`, `X-RateLimit-Limit === '15'`, `X-RateLimit-Remaining === '14'`, and `X-RateLimit-Reset === String(Date.parse(reset_at) / 1000)`.

For a denied row, assert `kind === 'limited'`, status `429`, exact body `{ error:'Too many requests', code:'RATE_LIMITED' }`, `Retry-After`, and remaining `0`.

For `{ error: new Error('db unavailable') }`, thrown RPC, empty data, multiple rows, non-boolean `allowed`, invalid/negative numeric fields, or invalid `reset_at`, assert `kind === 'fail-open'` and no rate-limit headers.

- [ ] **Step 2: Run RED**

```bash
node --test app/js/tests/api-rate-limit.test.mjs
```

Expected: FAIL because `_shared/rate-limit.ts` does not exist.

- [ ] **Step 3: Implement the minimal helper**

`checkRateLimit` must call:

```ts
admin.rpc("check_rate_limit", {
  p_user_id: userId,
  p_endpoint: endpoint,
  p_limit: RATE_LIMITS[endpoint],
});
```

Validate the returned single row before trusting it. Convert `reset_at` to Unix epoch seconds. On any RPC error, exception, or malformed row, emit one minimal `console.warn` structured object containing only `event: "rate_limit_fail_open"`, `endpoint`, `user_id`, and a non-sensitive error classification, then return `{ kind: "fail-open", headers: {} }`.

Do not accept limits from request input. Do not log payloads, tokens, phones, names, receipt/payment details, or service credentials.

- [ ] **Step 4: Run GREEN**

```bash
node --test app/js/tests/api-rate-limit.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit locally**

```bash
git add supabase/functions/_shared/rate-limit.ts app/js/tests/api-rate-limit.test.mjs
git commit -m "security: add shared Edge rate limiter"
```

---

### Task 4: Integrate Rate Limiting into the Four Authenticated Endpoints

**Files:**
- Create: `app/js/tests/api-endpoint-rate-limit-contract.test.mjs`
- Modify: `supabase/functions/payment-receipt/index.ts`
- Modify: `supabase/functions/retry-automation-message/index.ts`
- Modify: `supabase/functions/send-whatsapp/index.ts`
- Modify: `supabase/functions/payment-lifecycle/index.ts`

**Interfaces:**
- Consumes: `checkRateLimit(admin, user.id, endpoint)` from Task 3.
- Produces: auth → limiter → Phase 2A parser ordering; 429 before business work; successful limiter metadata attached to all subsequent JSON responses; fail-open leaves existing response contract untouched.

- [ ] **Step 1: Write failing source-contract tests**

Create `app/js/tests/api-endpoint-rate-limit-contract.test.mjs`. For each endpoint source, assert:

1. it imports `checkRateLimit`;
2. `auth.getUser()` and successful `user` resolution occur before `checkRateLimit`;
3. `checkRateLimit` occurs before `readJsonObject`;
4. the exact endpoint key is passed;
5. `limited` returns before the first business-table `.from(...)` call;
6. `OPTIONS` occurs before `checkRateLimit`;
7. the JSON response helper accepts optional extra headers and merges them after CORS/Content-Type defaults.

Example ordering assertion:

```js
assert.ok(code.indexOf('auth.getUser()') < code.indexOf('checkRateLimit('));
assert.ok(code.indexOf('checkRateLimit(') < code.indexOf('readJsonObject('));
```

Also assert neither `whatsapp-webhook` nor `process-reminders` imports the helper.

- [ ] **Step 2: Run RED**

```bash
node --test app/js/tests/api-endpoint-rate-limit-contract.test.mjs
```

Expected: FAIL because handlers do not yet invoke the limiter.

- [ ] **Step 3: Integrate one consistent handler pattern**

In each handler, after successful JWT resolution and before `readJsonObject`, create/reuse the service-role `admin` client and run:

```ts
const rateLimit = await checkRateLimit(admin, user.id, "<exact-endpoint-key>");
if (rateLimit.kind === "limited") {
  return json(rateLimit.body, rateLimit.status, rateLimit.headers);
}
const rateHeaders = rateLimit.kind === "allowed" ? rateLimit.headers : {};
```

Update each local JSON helper to:

```ts
function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}
```

All responses after a successful limiter check must receive `rateHeaders`, including validation errors and business errors/successes. Do not attach rate headers to `OPTIONS`, 405, 401, or fail-open requests. A small per-handler wrapper such as `const respond = (body, status=200) => json(body, status, rateHeaders)` is preferred to editing dozens of response sites manually; keep it local and behavior-preserving.

For `payment-lifecycle`, keep the existing service-role client but move limiter execution before `parsePaymentLifecycleRequest(await readJsonObject(req))`.

For `payment-receipt`, instantiate `admin` immediately after successful user auth so it can call the limiter, then keep receipt lookup after parsing.

For `send-whatsapp` and `retry-automation-message`, instantiate `admin` immediately after successful user auth, before their current validation blocks.

Do not change tenant checks, payment state transitions, receipt generation, idempotency, WhatsApp payloads, or provider calls.

- [ ] **Step 4: Run focused tests**

```bash
node --test \
  app/js/tests/api-rate-limit.test.mjs \
  app/js/tests/api-endpoint-rate-limit-contract.test.mjs \
  app/js/tests/api-endpoint-validation-contract.test.mjs \
  app/js/tests/payment-lifecycle-monthly-receipt.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit locally**

```bash
git add app/js/tests/api-endpoint-rate-limit-contract.test.mjs \
  supabase/functions/payment-receipt/index.ts \
  supabase/functions/retry-automation-message/index.ts \
  supabase/functions/send-whatsapp/index.ts \
  supabase/functions/payment-lifecycle/index.ts
git commit -m "security: rate limit authenticated API endpoints"
```

---

### Task 5: Run the Complete Local Regression Gate

**Files:** none unless a test exposes a Phase 2B regression.

**Interfaces:** verifies Tasks 1–4 as one candidate before any DEV database mutation.

- [ ] **Step 1: Run every `.mjs` test under Node 22**

```bash
node --test app/js/tests/*.test.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run the monetary regression test used by CI**

```bash
node app/js/tests/money-input.test.js
```

Expected: PASS.

- [ ] **Step 3: Inspect the candidate diff**

```bash
git diff main...HEAD -- \
  supabase/migrations \
  supabase/functions \
  app/js/tests \
  vercel.json
```

Expected: only Phase 2B files/edits; `vercel.json`, `whatsapp-webhook`, and `process-reminders` have no changes.

- [ ] **Step 4: Confirm no uncommitted implementation drift**

```bash
git status --short
```

Expected: clean, except intentionally uncommitted operational notes if any; do not include unrelated files in Phase 2B.

---

### Task 6: Validate the Database Limiter in Supabase DEV Before Edge Deployment

**Files:** no new application files; use the reviewed migration from Task 2.

**Interfaces:** consumes the migration; produces a DEV-validated schema/RPC/cron state without business-data mutation.

- [ ] **Step 1: Capture a fresh DEV preflight**

Record immediately before migration:

```sql
select 'classes' as table_name, count(*) from public.classes
union all select 'students', count(*) from public.students
union all select 'payment_events', count(*) from public.payment_events
union all select 'receipts', count(*) from public.receipts
union all select 'automation_messages', count(*) from public.automation_messages;
```

Also run the established academy-null and tenant-link mismatch checks from the Phase 1/2A rollout. Save the fresh values for postflight comparison; do not compare only to historical counts.

- [ ] **Step 2: Verify DEV cron capability before applying the migration**

Check whether `pg_cron`/Supabase Cron is supported and whether enabling the extension is safe in the DEV project. If not safely available, STOP and return to design review.

- [ ] **Step 3: Apply only `20260914_phase2b_rate_limiting.sql` to DEV**

Do not apply unrelated pending migrations. Confirm the migration appears exactly once in DEV migration history.

- [ ] **Step 4: Verify grants and object isolation**

Use catalog queries to prove:

```sql
select has_function_privilege('anon', 'public.check_rate_limit(uuid,text,integer)', 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', 'public.check_rate_limit(uuid,text,integer)', 'EXECUTE') as authenticated_exec,
       has_function_privilege('service_role', 'public.check_rate_limit(uuid,text,integer)', 'EXECUTE') as service_exec;
```

Expected: `false, false, true`.

Verify `private.rate_limit_counters` has no FK constraints and no grants for `anon`/`authenticated`.

- [ ] **Step 5: Exercise atomic behavior with synthetic UUIDs only**

Use a synthetic UUID and call the service-role-only RPC repeatedly in a rollback-safe/DEV context. Verify requests `1..limit` are allowed, `limit+1` is denied, subsequent denied calls remain capped at `limit+1`, different user UUIDs and endpoint keys have independent counters, `remaining >= 0`, and `retry_after_seconds >= 1`.

For concurrency, issue parallel RPC calls against the same synthetic key/window and verify the number of allowed results cannot exceed the configured limit. Do not use a real student's UUID or trigger an Edge business endpoint.

- [ ] **Step 6: Verify cleanup isolation**

Insert only synthetic expired/current counter rows in DEV, run the cleanup SQL/function manually once, and verify only the expired private row is removed. Confirm the hourly cron job exists with the reviewed schedule and command.

- [ ] **Step 7: Run DEV business-data postflight**

Repeat the fresh preflight counts and structural tenant invariants. Expected: no migration-caused business-data change; only synthetic/private limiter rows may differ.

---

### Task 7: Deploy and Validate the Four Edge Functions in DEV

**Files:** no new files.

**Interfaces:** consumes the exact locally tested branch candidate; produces four DEV bundles validated against the DEV limiter.

- [ ] **Step 1: Record current DEV function versions/hashes**

Capture `payment-receipt`, `retry-automation-message`, `send-whatsapp`, and `payment-lifecycle` before deployment. Also record `whatsapp-webhook` and `process-reminders` to prove they remain untouched.

- [ ] **Step 2: Deploy the four in-scope functions to DEV one at a time**

Order: `payment-receipt` → `retry-automation-message` → `send-whatsapp` → `payment-lifecycle`. Preserve `verify_jwt=true` for all four. After each deployment, verify ACTIVE status before continuing.

- [ ] **Step 3: Run safe DEV behavior checks**

Use authenticated, non-side-effecting/mocked paths where available. Verify the order contract and 429 behavior without creating payments, receipts, retries, or WhatsApp sends solely for testing. If direct authenticated HTTP testing is unavailable, do not claim it passed; rely on executable local contracts plus direct DEV RPC/database verification and record the limitation explicitly.

- [ ] **Step 4: Verify fail-open without damaging DEV**

Use a controlled helper-level/integration stub or a temporary isolated test harness, not a production handler mutation, to prove RPC failure returns the fail-open outcome and omits rate-limit headers. Do not break the DEV database or revoke real service-role access as a test technique.

- [ ] **Step 5: Run a final DEV structural snapshot**

Repeat the business invariants. Expected: no unexpected business-data changes attributable to Phase 2B testing/deployment.

---

### Task 8: Push One Candidate, Open PR, and Require Exact-SHA CI

**Files:** existing Phase 2B branch only.

**Interfaces:** produces one reviewable implementation PR; no PROD rollout yet.

- [ ] **Step 1: Push the grouped implementation branch once after DEV is green**

```bash
git push -u origin security/phase-2b-rate-limiting
```

Because `vercel.json` disables deployment for non-`main`, this must not create a Vercel branch deployment.

- [ ] **Step 2: Open one PR to `main`**

Title:

```text
Security Phase 2B: conservative rate limiting
```

PR body must summarize the private Postgres limiter, fail-open behavior, `60/30/15/10` limits, streaming 64 KiB hardening, DEV verification, and explicit out-of-scope items.

- [ ] **Step 3: Wait for `Validar Dashboard 2.0` on the exact head SHA**

CI must execute the repository's Node 22 commands:

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: green on the exact reviewed candidate SHA.

- [ ] **Step 4: Review the complete PR diff before merge**

Reject unrelated refactors, business-rule changes, Vercel config changes, webhook/cron-function changes, or broad logging additions. If CI requires a correction, make the smallest correction, rerun DEV-relevant tests, and require green CI on the new exact head SHA.

---

### Task 9: Merge and Promote the Exact DEV-Validated Candidate to PROD

**Files:** no new code unless a stop condition forces a new reviewed PR.

**Interfaces:** consumes exact green PR head; produces Phase 2B in PROD with unchanged business-data invariants.

- [ ] **Step 1: Merge only the exact reviewed green SHA**

Do not merge if the PR head changed after the last green CI/review. Record the resulting `main` merge SHA.

- [ ] **Step 2: Capture fresh PROD preflight immediately before rollout**

Record current migration history, function versions/hashes, business table counts, academy-null checks, and tenant mismatch checks. Treat natural business activity since previous historical snapshots as expected; this fresh snapshot is the rollout baseline.

- [ ] **Step 3: Apply only the reviewed Phase 2B migration to PROD**

Verify `private.rate_limit_counters`, RPC definition, grants, and hourly cleanup before deploying any Edge Function. Confirm `anon=false`, `authenticated=false`, `service_role=true` for RPC execution.

- [ ] **Step 4: Run immediate PROD structural integrity check**

Compare business invariants to the fresh preflight. Any unexpected migration-caused divergence is a STOP condition.

- [ ] **Step 5: Promote exact DEV-validated function bundles one at a time**

Order: `payment-receipt` → `retry-automation-message` → `send-whatsapp` → `payment-lifecycle`. After each deployment verify ACTIVE status and exact expected hash/bundle identity where exposed. Do not deploy `whatsapp-webhook` or `process-reminders`.

- [ ] **Step 6: Run final PROD postflight**

Repeat business counts and structural tenant checks. Expected: no unexpected business-data change attributable to rollout. Verify the limiter objects and cron job remain healthy.

- [ ] **Step 7: Record Phase 2B completion evidence**

Record: merge SHA, migration identity, four final PROD function versions/hashes, DEV/PROD grant checks, cron schedule, local/CI test results, and pre/post structural invariants. Explicitly note any HTTP test that could not be executed rather than inferring success.

---

## Stop Conditions

Stop implementation or rollout and investigate if any of these occurs:

- the migration touches a business table;
- `anon` or `authenticated` can execute/reset/read limiter state;
- `service_role` cannot execute the RPC;
- concurrency allows more successful calls than the configured window limit;
- limiter failure blocks the request instead of failing open;
- the streaming reader drains an oversized no-`Content-Length` body;
- valid Phase 2A parsing regresses;
- cleanup cannot be isolated to `private.rate_limit_counters`;
- DEV cannot safely support `pg_cron`/Supabase Cron;
- any in-scope handler rate-limits before successful JWT authentication or after payload parsing;
- `whatsapp-webhook`, `process-reminders`, or `vercel.json` changes unexpectedly;
- DEV/PROD structural tenant invariants fail;
- CI is not green on the exact candidate SHA;
- PROD function contents do not match the DEV-validated candidate.

## Completion Definition

Phase 2B is complete only when all four authenticated endpoints enforce the approved per-user fixed-window limits, confirmed excess returns 429 with the approved headers/body, limiter failures are demonstrably fail-open, the private database state is inaccessible to frontend roles, atomic/concurrent behavior is verified in DEV, 48-hour cleanup is scheduled in Postgres, the 64 KiB reader is truly bounded without `Content-Length`, all repository tests/CI are green, and PROD promotion finishes with unchanged business-data structural invariants.