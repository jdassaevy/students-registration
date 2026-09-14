# Phase 2A API Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conservative request validation to the four authenticated Supabase Edge Functions so malformed, oversized, ambiguous, or out-of-contract input is rejected before any business write, without rewriting existing business data.

**Architecture:** Add one shared module, `supabase/functions/_shared/api-validation.ts`, for bounded JSON parsing and primitive validators. Each Edge Function keeps its own endpoint-specific request contract near the handler, reusing those primitives while leaving authentication, tenant authorization, and business rules unchanged. Deploy dev-first; test only safe negative HTTP paths; then promote the exact validated dev bundles to production with no database migration.

**Tech Stack:** Supabase Edge Functions / Deno, TypeScript, Node.js 22 test runner, GitHub Actions, Supabase dev + production.

**Spec:** `docs/superpowers/specs/2026-09-13-phase-2a-api-validation-design.md`

## Global Constraints

- Authenticated JSON body limit: exactly `64 * 1024` bytes.
- Normalize only unambiguous values.
- Unknown extra JSON fields are ignored in Phase 2A.
- Validation codes: `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `INVALID_INPUT`.
- Validation `field` names are safe public request-field names only.
- No schema migration, backfill, destructive DDL, or rewrite of existing business rows.
- CORS remains unchanged in Phase 2A.
- `process-reminders` and `whatsapp-webhook` remain untouched.
- No real WhatsApp send, payment mutation, retry, or receipt creation is performed solely to test validation.
- Existing authentication, tenant isolation, receipt/payment logic, and automation behavior remain authoritative.
- No business write may run until the selected request contract has been fully validated.
- Work on an isolated implementation branch/worktree, never directly on `main`.
- Keep remote pushes grouped; open one implementation PR after the dev gate is green.

---

## File Map

**Create**

- `supabase/functions/_shared/api-validation.ts` — bounded JSON parsing + primitive validators.
- `app/js/tests/api-validation.test.mjs` — executable behavior tests for shared validators.
- `app/js/tests/api-endpoint-validation-contract.test.mjs` — contract tests proving all four handlers use the shared layer correctly.

**Modify**

- `supabase/functions/payment-receipt/index.ts`
- `supabase/functions/retry-automation-message/index.ts`
- `supabase/functions/send-whatsapp/index.ts`
- `supabase/functions/payment-lifecycle/index.ts`

**Explicitly out of scope**

- database migrations/schema,
- `process-reminders`,
- `whatsapp-webhook`,
- CORS allowlisting,
- rate limiting,
- business-data rewrites.

---

### Task 1: Build the Shared Validation Module with TDD

**Files:**
- Create: `supabase/functions/_shared/api-validation.ts`
- Create: `app/js/tests/api-validation.test.mjs`

**Interfaces:**

```ts
export const MAX_JSON_BYTES: number;
export type ValidationCode = "INVALID_JSON" | "PAYLOAD_TOO_LARGE" | "INVALID_INPUT";
export class ApiInputError extends Error {
  readonly code: ValidationCode;
  readonly status: 400 | 413;
  readonly field: string | null;
}
export function isApiInputError(error: unknown): error is ApiInputError;
export function validationErrorPayload(error: ApiInputError): {
  error: string;
  code: ValidationCode;
  field?: string;
};
export function readJsonObject(req: Request, maxBytes?: number): Promise<Record<string, unknown>>;
export function requireUuid(value: unknown, field: string): string;
export function optionalUuid(value: unknown, field: string): string | null;
export function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T;
export function requireInteger(value: unknown, field: string, bounds: { min: number; max: number }): number;
export function requireTrimmedString(value: unknown, field: string, options: { maxLength: number }): string;
export function optionalTrimmedString(value: unknown, field: string, options: { maxLength: number }): string | null;
export function optionalPrimitiveArray(value: unknown, field: string, options: { maxItems: number }): Array<string | number>;
```

- [ ] **Step 1: Write the failing helper tests**

Create `app/js/tests/api-validation.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_JSON_BYTES,
  ApiInputError,
  readJsonObject,
  requireUuid,
  optionalUuid,
  requireEnum,
  requireInteger,
  requireTrimmedString,
  optionalTrimmedString,
  optionalPrimitiveArray,
  validationErrorPayload,
} from '../../../supabase/functions/_shared/api-validation.ts';

const UUID = '11111111-1111-4111-8111-111111111111';

function expectInputError(fn, code, field = null) {
  assert.throws(fn, error => {
    assert.ok(error instanceof ApiInputError);
    assert.equal(error.code, code);
    assert.equal(error.field, field);
    return true;
  });
}

test('UUIDs are trimmed, validated, and optional blank UUIDs become null', () => {
  assert.equal(requireUuid(`  ${UUID}  `, 'student_id'), UUID);
  assert.equal(optionalUuid('   ', 'receipt_id'), null);
  expectInputError(() => requireUuid('bad', 'student_id'), 'INVALID_INPUT', 'student_id');
});

test('enum validation trims exact values but rejects aliases', () => {
  assert.equal(requireEnum(' person1 ', 'person', ['person1', 'person2']), 'person1');
  expectInputError(() => requireEnum('pessoa1', 'person', ['person1', 'person2']), 'INVALID_INPUT', 'person');
});

test('integer validation accepts numeric strings and rejects decimals/range overflow', () => {
  assert.equal(requireInteger('2', 'installment', { min: 1, max: 3 }), 2);
  expectInputError(() => requireInteger('2.5', 'installment', { min: 1, max: 3 }), 'INVALID_INPUT', 'installment');
  expectInputError(() => requireInteger(4, 'installment', { min: 1, max: 3 }), 'INVALID_INPUT', 'installment');
});

test('bounded strings reject overflow rather than truncate it', () => {
  assert.equal(requireTrimmedString(' request-1 ', 'request_id', { maxLength: 160 }), 'request-1');
  assert.equal(optionalTrimmedString('', 'idempotency_key', { maxLength: 240 }), null);
  expectInputError(() => requireTrimmedString('x'.repeat(161), 'request_id', { maxLength: 160 }), 'INVALID_INPUT', 'request_id');
});

test('primitive arrays enforce count and primitive item types', () => {
  assert.deepEqual(optionalPrimitiveArray(['a', 2], 'body_parameters', { maxItems: 12 }), ['a', 2]);
  expectInputError(() => optionalPrimitiveArray(Array(13).fill('x'), 'body_parameters', { maxItems: 12 }), 'INVALID_INPUT', 'body_parameters');
  expectInputError(() => optionalPrimitiveArray([{ bad: true }], 'body_parameters', { maxItems: 12 }), 'INVALID_INPUT', 'body_parameters');
});

test('malformed JSON is classified as INVALID_JSON', async () => {
  await assert.rejects(
    () => readJsonObject(new Request('https://example.test', { method: 'POST', body: '{bad' })),
    error => error instanceof ApiInputError && error.code === 'INVALID_JSON' && error.status === 400,
  );
});

test('raw-byte limit accepts the boundary and rejects boundary + 1', async () => {
  const raw = JSON.stringify({ value: 'x'.repeat(128) });
  const bytes = new TextEncoder().encode(raw).byteLength;
  assert.deepEqual(
    await readJsonObject(new Request('https://example.test', { method: 'POST', body: raw }), bytes),
    JSON.parse(raw),
  );
  await assert.rejects(
    () => readJsonObject(new Request('https://example.test', { method: 'POST', body: raw }), bytes - 1),
    error => error instanceof ApiInputError && error.code === 'PAYLOAD_TOO_LARGE' && error.status === 413,
  );
  assert.equal(MAX_JSON_BYTES, 64 * 1024);
});

test('public error payload contains stable code and optional safe field', () => {
  assert.deepEqual(
    validationErrorPayload(new ApiInputError('INVALID_INPUT', 400, 'person')),
    { error: 'Invalid request', code: 'INVALID_INPUT', field: 'person' },
  );
});
```

- [ ] **Step 2: Run RED**

```bash
node --test app/js/tests/api-validation.test.mjs
```

Expected: FAIL because `api-validation.ts` does not exist.

- [ ] **Step 3: Implement the minimal typed helper**

Create `supabase/functions/_shared/api-validation.ts`:

```ts
export const MAX_JSON_BYTES = 64 * 1024;

export type ValidationCode = "INVALID_JSON" | "PAYLOAD_TOO_LARGE" | "INVALID_INPUT";
type Primitive = string | number;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ApiInputError extends Error {
  readonly code: ValidationCode;
  readonly status: 400 | 413;
  readonly field: string | null;

  constructor(code: ValidationCode, status: 400 | 413, field: string | null = null) {
    super(code);
    this.name = "ApiInputError";
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

export function isApiInputError(error: unknown): error is ApiInputError {
  return error instanceof ApiInputError;
}

export function validationErrorPayload(error: ApiInputError): {
  error: string;
  code: ValidationCode;
  field?: string;
} {
  const body: { error: string; code: ValidationCode; field?: string } = {
    error: error.code === "PAYLOAD_TOO_LARGE" ? "Payload too large" : "Invalid request",
    code: error.code,
  };
  if (error.field) body.field = error.field;
  return body;
}

function invalid(field: string | null): never {
  throw new ApiInputError("INVALID_INPUT", 400, field);
}

export async function readJsonObject(req: Request, maxBytes = MAX_JSON_BYTES): Promise<Record<string, unknown>> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > maxBytes) {
    throw new ApiInputError("PAYLOAD_TOO_LARGE", 413);
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new ApiInputError("PAYLOAD_TOO_LARGE", 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiInputError("INVALID_JSON", 400);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid(null);
  return parsed as Record<string, unknown>;
}

export function requireUuid(value: unknown, field: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID_RE.test(normalized)) invalid(field);
  return normalized;
}

export function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return null;
  return requireUuid(value, field);
}

export function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!allowed.includes(normalized as T)) invalid(field);
  return normalized as T;
}

export function requireInteger(value: unknown, field: string, { min, max }: { min: number; max: number }): number {
  const normalized = typeof value === "string" && value.trim() !== "" ? Number(value.trim()) : value;
  if (typeof normalized !== "number" || !Number.isInteger(normalized) || normalized < min || normalized > max) invalid(field);
  return normalized;
}

export function requireTrimmedString(value: unknown, field: string, { maxLength }: { maxLength: number }): string {
  if (typeof value !== "string") invalid(field);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) invalid(field);
  return normalized;
}

export function optionalTrimmedString(value: unknown, field: string, options: { maxLength: number }): string | null {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return null;
  return requireTrimmedString(value, field, options);
}

export function optionalPrimitiveArray(value: unknown, field: string, { maxItems }: { maxItems: number }): Primitive[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) invalid(field);
  if (value.some(item => typeof item !== "string" && (typeof item !== "number" || !Number.isFinite(item)))) invalid(field);
  return [...value] as Primitive[];
}
```

- [ ] **Step 4: Run GREEN + full regression**

```bash
node --test app/js/tests/api-validation.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit locally**

```bash
git add supabase/functions/_shared/api-validation.ts app/js/tests/api-validation.test.mjs
git commit -m "feat: add shared API validation primitives"
```

Do not push.

---

### Task 2: Integrate `payment-receipt`

**Files:**
- Modify: `supabase/functions/payment-receipt/index.ts`
- Create: `app/js/tests/api-endpoint-validation-contract.test.mjs`

**Produces:** invalid/malformed `receipt_id` requests fail before `.from("receipts")`.

- [ ] **Step 1: Write RED source-contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function source(relative) {
  return fs.readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');
}

test('payment-receipt validates bounded JSON and receipt UUID before receipt query', () => {
  const code = source('supabase/functions/payment-receipt/index.ts');
  assert.match(code, /readJsonObject/);
  assert.match(code, /requireUuid\(body\?\.receipt_id,\s*["']receipt_id["']\)/);
  assert.match(code, /isApiInputError/);
  assert.ok(code.indexOf('requireUuid') < code.indexOf('.from("receipts")'));
});
```

Run:

```bash
node --test app/js/tests/api-endpoint-validation-contract.test.mjs
```

Expected: FAIL.

- [ ] **Step 2: Replace truthiness parsing with shared validation**

Import:

```ts
import { isApiInputError, readJsonObject, requireUuid, validationErrorPayload } from "../_shared/api-validation.ts";
```

After successful JWT auth:

```ts
const body = await readJsonObject(req);
const receiptId = requireUuid(body?.receipt_id, "receipt_id");
```

In the existing outer catch, before generic 500:

```ts
if (isApiInputError(error)) {
  return json(validationErrorPayload(error), error.status);
}
```

Do not move or change receipt membership, tenant, PDF, storage, or success logic.

- [ ] **Step 3: Run focused/full tests and commit locally**

```bash
node --test app/js/tests/api-validation.test.mjs app/js/tests/api-endpoint-validation-contract.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
git add supabase/functions/payment-receipt/index.ts app/js/tests/api-endpoint-validation-contract.test.mjs
git commit -m "feat: validate payment receipt requests"
```

Do not push.

---

### Task 3: Integrate `retry-automation-message`

**Files:**
- Modify: `supabase/functions/retry-automation-message/index.ts`
- Modify: `app/js/tests/api-endpoint-validation-contract.test.mjs`

**Produces:** `source_message_id` is a UUID; `request_id` is trimmed, non-empty, max 160; overflow is rejected rather than truncated.

- [ ] **Step 1: Add RED contract test**

```js
test('retry validates source UUID and bounded request id without truncation', () => {
  const code = source('supabase/functions/retry-automation-message/index.ts');
  assert.match(code, /readJsonObject/);
  assert.match(code, /requireUuid\(body\?\.source_message_id/);
  assert.match(code, /requireTrimmedString\(body\?\.request_id/);
  assert.doesNotMatch(code, /\.slice\(0,\s*160\)/);
  assert.ok(code.indexOf('requireUuid') < code.indexOf('.from("automation_messages")'));
});
```

Run and expect FAIL:

```bash
node --test app/js/tests/api-endpoint-validation-contract.test.mjs
```

- [ ] **Step 2: Parse after JWT auth but before any automation lookup**

```ts
let sourceMessageId: string;
let requestId: string;
try {
  const body = await readJsonObject(req);
  sourceMessageId = requireUuid(body?.source_message_id, "source_message_id");
  requestId = requireTrimmedString(body?.request_id, "request_id", { maxLength: 160 });
} catch (error) {
  if (isApiInputError(error)) return json(validationErrorPayload(error), error.status);
  console.error("retry request validation failed", error);
  return json({ error: "Could not validate request" }, 500);
}
```

Keep retry policy, tenant checks, idempotency, and Meta behavior unchanged.

- [ ] **Step 3: Run tests and commit locally**

```bash
node --test app/js/tests/api-validation.test.mjs app/js/tests/api-endpoint-validation-contract.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
git add supabase/functions/retry-automation-message/index.ts app/js/tests/api-endpoint-validation-contract.test.mjs
git commit -m "feat: validate retry automation requests"
```

Do not push.

---

### Task 4: Integrate `send-whatsapp`

**Files:**
- Modify: `supabase/functions/send-whatsapp/index.ts`
- Modify: `app/js/tests/api-endpoint-validation-contract.test.mjs`

**Produces:** validated `studentId`, `person`, `automationType`, `receiptId`, `bodyParameters`, `idempotencyKey` before any automation log insert.

- [ ] **Step 1: Add RED contract test**

```js
test('send-whatsapp validates enums/limits instead of defaulting or truncating', () => {
  const code = source('supabase/functions/send-whatsapp/index.ts');
  assert.match(code, /readJsonObject/);
  assert.match(code, /requireUuid\(body\?\.student_id/);
  assert.match(code, /requireEnum\(body\?\.person/);
  assert.match(code, /requireEnum\(body\?\.automation_type/);
  assert.match(code, /optionalPrimitiveArray\(body\?\.body_parameters/);
  assert.match(code, /optionalTrimmedString\(body\?\.idempotency_key/);
  assert.doesNotMatch(code, /\.slice\(0,\s*12\)/);
  assert.doesNotMatch(code, /\.slice\(0,\s*240\)/);
});
```

Run and expect FAIL.

- [ ] **Step 2: Add the endpoint-local contract**

```ts
const AUTOMATION_TYPES = [
  "reminder_before_due",
  "due_today",
  "overdue",
  "payment_confirmation",
  "receipt_document",
  "payment_voided",
] as const;

function parseSendWhatsappRequest(body: Record<string, unknown>) {
  const studentId = requireUuid(body.student_id, "student_id");
  const person = requireEnum(body.person, "person", ["person1", "person2"] as const);
  const automationType = requireEnum(body.automation_type, "automation_type", AUTOMATION_TYPES);
  const receiptId = optionalUuid(body.receipt_id, "receipt_id");
  const bodyParameters = optionalPrimitiveArray(body.body_parameters, "body_parameters", { maxItems: 12 });
  const idempotencyKey = optionalTrimmedString(body.idempotency_key, "idempotency_key", { maxLength: 240 });
  if (automationType === "receipt_document" && !receiptId) {
    throw new ApiInputError("INVALID_INPUT", 400, "receipt_id");
  }
  return { studentId, person, automationType, receiptId, bodyParameters, idempotencyKey };
}
```

After JWT auth:

```ts
let input: ReturnType<typeof parseSendWhatsappRequest>;
try {
  input = parseSendWhatsappRequest(await readJsonObject(req));
} catch (error) {
  if (isApiInputError(error)) return json(validationErrorPayload(error), error.status);
  console.error("send-whatsapp request validation failed", error);
  return json({ error: "Could not validate request" }, 500);
}
const { studentId, person, automationType, receiptId, bodyParameters, idempotencyKey } = input;
```

Remove silent `person1` fallback and `.slice()` truncation. Preserve membership, exact receipt/student linkage, log semantics, signed URLs, and Meta sends.

- [ ] **Step 3: Run tests and commit locally**

```bash
node --test app/js/tests/api-validation.test.mjs app/js/tests/api-endpoint-validation-contract.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
git add supabase/functions/send-whatsapp/index.ts app/js/tests/api-endpoint-validation-contract.test.mjs
git commit -m "feat: validate WhatsApp send requests"
```

Do not push.

---

### Task 5: Integrate `payment-lifecycle` Last

**Files:**
- Modify: `supabase/functions/payment-lifecycle/index.ts`
- Modify: `app/js/tests/api-endpoint-validation-contract.test.mjs`

**Produces:** discriminated request union:

```ts
type PaymentLifecycleInput =
  | { mode: "repair"; operation: "repair_monthly_receipt"; receiptId: string }
  | { mode: "payment"; studentId: string; person: "person1" | "person2"; kind: "entry" | "monthly"; installment: number };
```

- [ ] **Step 1: Add RED contract test**

```js
test('payment-lifecycle validates operation and payment modes explicitly', () => {
  const code = source('supabase/functions/payment-lifecycle/index.ts');
  assert.match(code, /readJsonObject/);
  assert.match(code, /hasOwnProperty\.call\(body,\s*["']operation["']\)/);
  assert.match(code, /requireEnum\(body\.operation/);
  assert.match(code, /requireUuid\(body\.receipt_id/);
  assert.match(code, /requireUuid\(body\.student_id/);
  assert.match(code, /requireEnum\(body\.person/);
  assert.match(code, /requireEnum\(body\.kind/);
  assert.match(code, /requireInteger\(body\.installment/);
});
```

Run and expect FAIL.

- [ ] **Step 2: Define typed endpoint parser near the handler**

```ts
type PaymentLifecycleInput =
  | { mode: "repair"; operation: "repair_monthly_receipt"; receiptId: string }
  | { mode: "payment"; studentId: string; person: "person1" | "person2"; kind: "entry" | "monthly"; installment: number };

function parsePaymentLifecycleRequest(body: Record<string, unknown>): PaymentLifecycleInput {
  if (Object.prototype.hasOwnProperty.call(body, "operation")) {
    const operation = requireEnum(body.operation, "operation", ["repair_monthly_receipt"] as const);
    const receiptId = requireUuid(body.receipt_id, "receipt_id");
    return { mode: "repair", operation, receiptId };
  }

  const studentId = requireUuid(body.student_id, "student_id");
  const person = requireEnum(body.person, "person", ["person1", "person2"] as const);
  const kind = requireEnum(body.kind, "kind", ["entry", "monthly"] as const);
  const installment = kind === "entry"
    ? 0
    : requireInteger(body.installment, "installment", { min: 1, max: 3 });
  return { mode: "payment", studentId, person, kind, installment };
}
```

- [ ] **Step 3: Parse once before either business path**

Inside the current outer `try`:

```ts
const input = parsePaymentLifecycleRequest(await readJsonObject(req));

if (input.mode === "repair") {
  const repairReceiptId = input.receiptId;
  // continue existing repair logic unchanged and return from that path
}

const { studentId, person, kind, installment } = input;
// continue existing normal payment logic unchanged
```

Before generic catch handling:

```ts
if (isApiInputError(error)) {
  return json(validationErrorPayload(error), error.status);
}
```

Any present `operation` field selects operation mode; unsupported/blank operation is `INVALID_INPUT`. Entry payments normalize installment to 0; monthly payments require integer 1..3.

- [ ] **Step 4: Run tests and commit locally**

```bash
node --test app/js/tests/api-validation.test.mjs app/js/tests/api-endpoint-validation-contract.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
git add supabase/functions/payment-lifecycle/index.ts app/js/tests/api-endpoint-validation-contract.test.mjs
git commit -m "feat: validate payment lifecycle requests"
```

Do not push.

---

### Task 6: Supabase Dev Gate — Safe Negative Tests Only

**Files:** no additional planned source files.

- [ ] **Step 1: Record dev read-only invariants before deploy**

Run aggregate-only SQL:

```sql
select
  (select count(*) from public.classes) as classes_total,
  (select count(*) from public.students) as students_total,
  (select count(*) from public.payment_events) as payment_events_total,
  (select count(*) from public.receipts) as receipts_total,
  (select count(*) from public.automation_messages) as automation_messages_total;
```

Also run the existing Phase 1 academy-link mismatch checks. Do not inspect personal row contents.

- [ ] **Step 2: Deploy to dev in low-risk order**

1. `payment-receipt` (`verify_jwt=true`)
2. `retry-automation-message` (`verify_jwt=true`)
3. `send-whatsapp` (`verify_jwt=true`)
4. `payment-lifecycle` (`verify_jwt=true`)

After each deployment: require `ACTIVE`, correct `verify_jwt`, and successful bundle compilation before continuing.

- [ ] **Step 3: Run no-auth/method checks**

```bash
curl -i -X GET "$DEV_FUNCTIONS_URL/payment-receipt"
curl -i -X POST "$DEV_FUNCTIONS_URL/payment-receipt" -H 'Content-Type: application/json' --data '{}'
```

Expected: 405 wrong method, 401 missing JWT.

- [ ] **Step 4: With a short-lived dev-only JWT, run invalid requests only**

Malformed JSON:

```bash
curl -i -X POST "$DEV_FUNCTIONS_URL/payment-receipt" \
  -H "Authorization: Bearer $DEV_TEST_JWT" \
  -H "apikey: $DEV_ANON_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary '{bad'
```

Expected: 400 / `INVALID_JSON`.

Invalid UUID:

```bash
curl -i -X POST "$DEV_FUNCTIONS_URL/payment-receipt" \
  -H "Authorization: Bearer $DEV_TEST_JWT" \
  -H "apikey: $DEV_ANON_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"receipt_id":"not-a-uuid"}'
```

Expected: 400 / `INVALID_INPUT` / `field=receipt_id`.

Oversized body:

```bash
python - <<'PY' > /tmp/too-large.json
import json
print(json.dumps({"receipt_id":"11111111-1111-4111-8111-111111111111","padding":"x" * (65 * 1024)}))
PY
curl -i -X POST "$DEV_FUNCTIONS_URL/payment-receipt" \
  -H "Authorization: Bearer $DEV_TEST_JWT" \
  -H "apikey: $DEV_ANON_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/too-large.json
```

Expected: 413 / `PAYLOAD_TOO_LARGE`.

Also test invalid enums/ranges on the other functions, using identifiers that are syntactically valid UUIDs so validation reaches the intended field, but never a fully valid business payload that could write data.

- [ ] **Step 5: Re-run dev invariants**

Expected: all business counts and tenant-mismatch counts identical to Step 1.

- [ ] **Step 6: Run full local suite again**

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: 0 failures.

If any dev compile/runtime problem requires source changes, reproduce it with a failing test before changing code, then re-run this gate from the affected function onward.

---

### Task 7: One Grouped PR and Exact-Bundle Production Rollout

**Files expected in final implementation diff:**

```text
supabase/functions/_shared/api-validation.ts
supabase/functions/payment-receipt/index.ts
supabase/functions/retry-automation-message/index.ts
supabase/functions/send-whatsapp/index.ts
supabase/functions/payment-lifecycle/index.ts
app/js/tests/api-validation.test.mjs
app/js/tests/api-endpoint-validation-contract.test.mjs
docs/superpowers/specs/2026-09-13-phase-2a-api-validation-design.md
docs/superpowers/plans/2026-09-13-phase-2a-api-validation-implementation.md
```

No migration, webhook, cron, rate-limit, or CORS file belongs in this PR.

- [ ] **Step 1: Final local verification before remote push**

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: 0 failures.

- [ ] **Step 2: Push one implementation branch and open one PR to `main`**

Recommended branch:

```text
security/phase-2a-api-validation
```

The dev gate must already be green before the PR is opened.

- [ ] **Step 3: Require GitHub Actions success**

Confirm both existing CI commands ran and passed:

```text
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

If CI fails, inspect the exact failing test/log. Do not weaken runtime validation merely to satisfy a stale implementation-coupled test.

- [ ] **Step 4: Merge and confirm `main` points to the merge commit**

Do not promote production from an unmerged implementation branch.

- [ ] **Step 5: Record production aggregate invariants immediately before deployment**

Use the same business-count and academy-mismatch checks as the dev gate. No personal row contents. Confirm no Phase 2A database migration exists.

- [ ] **Step 6: Promote exact dev bundles one at a time**

1. `payment-receipt`
2. `retry-automation-message`
3. `send-whatsapp`
4. `payment-lifecycle`

For every function require:

- status `ACTIVE`,
- `verify_jwt=true`,
- production bundle hash exactly equal to the dev-validated hash.

Stop on first failure/mismatch.

- [ ] **Step 7: Re-run production invariants**

Expected:

- business counts unchanged,
- academy-link mismatches remain zero,
- no Phase 2A DB migration,
- all four production hashes equal dev.

Do not invoke positive payment/receipt/WhatsApp actions merely to test production validation.

- [ ] **Step 8: Completion evidence checklist**

Do not declare Phase 2A complete unless fresh evidence proves all of:

```text
shared validation tests: PASS
endpoint contract tests: PASS
full repository JS suite: PASS
GitHub Actions: PASS
4 dev functions: ACTIVE + verify_jwt=true
safe negative dev HTTP tests: expected 400/413/401/405
pre/post dev business invariants: unchanged
main merge: confirmed
4 production functions: ACTIVE + verify_jwt=true
production hashes == validated dev hashes
pre/post production business invariants: unchanged
Phase 2A DB migrations: none
```
