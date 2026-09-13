# Phase 2A API Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared, conservative request-validation layer to the four authenticated Supabase Edge Functions so malformed, oversized, ambiguous, or out-of-contract input is rejected before any business write occurs, without rewriting existing business data.

**Architecture:** Add one focused shared module, `supabase/functions/_shared/api-validation.ts`, containing body-size/JSON parsing and primitive validation utilities. Each Edge Function keeps its endpoint-specific contract next to its handler and reuses the shared primitives; authorization and business logic stay unchanged. Roll out dev-first, validate only safe negative HTTP paths, then promote the exact dev bundles to production with no database migration.

**Tech Stack:** Supabase Edge Functions / Deno, TypeScript-compatible shared modules, Node.js 22 test runner, GitHub Actions, Supabase dev + production.

**Spec:** `docs/superpowers/specs/2026-09-13-phase-2a-api-validation-design.md`

## Global Constraints

- Maximum authenticated JSON request body: exactly `64 * 1024` bytes (64 KiB).
- Normalize only unambiguous values; do not invent semantic aliases.
- Ignore unknown extra JSON fields in Phase 2A.
- Validation failures must use stable codes: `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, or `INVALID_INPUT`.
- `field` is returned only for safe request-field names.
- No database migration, backfill, destructive DDL, or rewrite of existing business rows.
- Do not change CORS behavior in Phase 2A.
- Do not modify `process-reminders` or `whatsapp-webhook` in Phase 2A.
- Do not send real WhatsApp messages or create payments/receipts solely to test validation.
- Existing authentication, academy authorization, tenant linkage, payment, receipt, retry, and WhatsApp business rules remain authoritative.
- No business write may run before the selected endpoint contract has been fully validated.
- Work in an isolated branch/worktree; do not develop directly on `main`.
- Keep repository pushes grouped; the implementation branch should be reviewed as one PR after the dev gate is green.

---

## File Structure

**Create**

- `supabase/functions/_shared/api-validation.ts` — raw-body size checks, JSON parsing, reusable primitive validators, structured validation errors.
- `app/js/tests/api-validation.test.mjs` — executable behavior tests for the shared validation module.
- `app/js/tests/api-endpoint-validation-contract.test.mjs` — source-contract tests proving all four handlers use the shared validation layer and preserve endpoint-specific requirements.

**Modify**

- `supabase/functions/payment-receipt/index.ts` — validate `receipt_id` before any business query/write.
- `supabase/functions/retry-automation-message/index.ts` — validate `source_message_id` and bounded `request_id`.
- `supabase/functions/send-whatsapp/index.ts` — validate identifiers, enum values, body parameters, receipt dependency, and idempotency key.
- `supabase/functions/payment-lifecycle/index.ts` — validate the normal payment contract and the repair-operation contract before business reads/writes.

**Do not modify**

- database migrations/schema,
- `supabase/functions/process-reminders/index.ts`,
- `supabase/functions/whatsapp-webhook/index.ts`,
- CORS origin policy,
- business tables/data.

---

### Task 1: Shared API Validation Primitives

**Files:**
- Create: `supabase/functions/_shared/api-validation.ts`
- Create: `app/js/tests/api-validation.test.mjs`

**Interfaces:**
- Consumes: Web-standard `Request`, `TextEncoder`, and plain JavaScript values.
- Produces:
  - `MAX_JSON_BYTES = 64 * 1024`
  - `class ApiInputError extends Error`
  - `isApiInputError(error): boolean`
  - `validationErrorPayload(error): { error: string; code: string; field?: string }`
  - `readJsonObject(req, maxBytes = MAX_JSON_BYTES): Promise<Record<string, unknown>>`
  - `requireUuid(value, field): string`
  - `optionalUuid(value, field): string | null`
  - `requireEnum(value, field, allowed): string`
  - `requireInteger(value, field, { min, max }): number`
  - `requireTrimmedString(value, field, { maxLength }): string`
  - `optionalTrimmedString(value, field, { maxLength }): string | null`
  - `optionalPrimitiveArray(value, field, { maxItems }): Array<string | number>`

- [ ] **Step 1: Write failing behavior tests for parsing and primitive normalization**

Create `app/js/tests/api-validation.test.mjs` and import the shared module:

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

function expectInputError(fn, code, field) {
  assert.throws(fn, error => {
    assert.ok(error instanceof ApiInputError);
    assert.equal(error.code, code);
    assert.equal(error.field ?? null, field ?? null);
    return true;
  });
}

test('uuid validator trims valid UUID and rejects malformed UUID', () => {
  assert.equal(requireUuid(`  ${UUID}  `, 'student_id'), UUID);
  expectInputError(() => requireUuid('not-a-uuid', 'student_id'), 'INVALID_INPUT', 'student_id');
  assert.equal(optionalUuid('', 'receipt_id'), null);
});

test('enum validator trims exact known values and rejects aliases', () => {
  assert.equal(requireEnum(' person1 ', 'person', ['person1', 'person2']), 'person1');
  expectInputError(() => requireEnum('pessoa1', 'person', ['person1', 'person2']), 'INVALID_INPUT', 'person');
});

test('integer validator accepts numeric strings but rejects decimals and range overflow', () => {
  assert.equal(requireInteger('2', 'installment', { min: 1, max: 3 }), 2);
  expectInputError(() => requireInteger('2.5', 'installment', { min: 1, max: 3 }), 'INVALID_INPUT', 'installment');
  expectInputError(() => requireInteger(4, 'installment', { min: 1, max: 3 }), 'INVALID_INPUT', 'installment');
});

test('bounded strings trim and reject overflow instead of truncating', () => {
  assert.equal(requireTrimmedString('  request-1  ', 'request_id', { maxLength: 160 }), 'request-1');
  assert.equal(optionalTrimmedString('', 'idempotency_key', { maxLength: 240 }), null);
  expectInputError(() => requireTrimmedString('x'.repeat(161), 'request_id', { maxLength: 160 }), 'INVALID_INPUT', 'request_id');
});

test('primitive arrays enforce item count and primitive types', () => {
  assert.deepEqual(optionalPrimitiveArray(['a', 2], 'body_parameters', { maxItems: 12 }), ['a', 2]);
  expectInputError(() => optionalPrimitiveArray(Array(13).fill('x'), 'body_parameters', { maxItems: 12 }), 'INVALID_INPUT', 'body_parameters');
  expectInputError(() => optionalPrimitiveArray([{ bad: true }], 'body_parameters', { maxItems: 12 }), 'INVALID_INPUT', 'body_parameters');
});
```

Add async tests for raw JSON parsing:

```js
test('readJsonObject classifies malformed JSON', async () => {
  await assert.rejects(
    () => readJsonObject(new Request('https://example.test', { method: 'POST', body: '{bad' })),
    error => error instanceof ApiInputError && error.code === 'INVALID_JSON' && error.status === 400,
  );
});

test('readJsonObject accepts exactly the configured boundary and rejects larger payloads', async () => {
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

test('validationErrorPayload exposes only stable public validation data', () => {
  const payload = validationErrorPayload(new ApiInputError('INVALID_INPUT', 400, 'person'));
  assert.deepEqual(payload, { error: 'Invalid request', code: 'INVALID_INPUT', field: 'person' });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
node --test app/js/tests/api-validation.test.mjs
```

Expected: FAIL because `supabase/functions/_shared/api-validation.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal shared validation module**

Create `supabase/functions/_shared/api-validation.ts` with behavior equivalent to:

```ts
export const MAX_JSON_BYTES = 64 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ApiInputError extends Error {
  constructor(code, status, field = null) {
    super(code);
    this.name = 'ApiInputError';
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

export function isApiInputError(error) {
  return error instanceof ApiInputError;
}

export function validationErrorPayload(error) {
  const body = {
    error: error.code === 'PAYLOAD_TOO_LARGE' ? 'Payload too large' : 'Invalid request',
    code: error.code,
  };
  if (error.field) body.field = error.field;
  return body;
}

function invalid(field) {
  throw new ApiInputError('INVALID_INPUT', 400, field);
}

export async function readJsonObject(req, maxBytes = MAX_JSON_BYTES) {
  const length = req.headers.get('content-length');
  if (length && Number.isFinite(Number(length)) && Number(length) > maxBytes) {
    throw new ApiInputError('PAYLOAD_TOO_LARGE', 413);
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new ApiInputError('PAYLOAD_TOO_LARGE', 413);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiInputError('INVALID_JSON', 400);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    invalid(null);
  }
  return parsed;
}

export function requireUuid(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!UUID_RE.test(normalized)) invalid(field);
  return normalized;
}

export function optionalUuid(value, field) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null;
  return requireUuid(value, field);
}

export function requireEnum(value, field, allowed) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!allowed.includes(normalized)) invalid(field);
  return normalized;
}

export function requireInteger(value, field, { min, max }) {
  const normalized = typeof value === 'string' && value.trim() !== '' ? Number(value.trim()) : value;
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) invalid(field);
  return normalized;
}

export function requireTrimmedString(value, field, { maxLength }) {
  if (typeof value !== 'string') invalid(field);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) invalid(field);
  return normalized;
}

export function optionalTrimmedString(value, field, { maxLength }) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null;
  return requireTrimmedString(value, field, { maxLength });
}

export function optionalPrimitiveArray(value, field, { maxItems }) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) invalid(field);
  if (value.some(item => typeof item !== 'string' && typeof item !== 'number')) invalid(field);
  return [...value];
}
```

Do not add Supabase imports, tenant logic, CORS logic, or endpoint-specific enum lists to this module.

- [ ] **Step 4: Run helper tests and verify GREEN**

Run:

```bash
node --test app/js/tests/api-validation.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Run the existing repository JavaScript suite**

Run:

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: PASS with no regressions.

- [ ] **Step 6: Commit Task 1 locally**

```bash
git add supabase/functions/_shared/api-validation.ts app/js/tests/api-validation.test.mjs
git commit -m "feat: add shared API validation primitives"
```

Do not push yet.

---

### Task 2: Harden `payment-receipt` First

**Files:**
- Modify: `supabase/functions/payment-receipt/index.ts`
- Create: `app/js/tests/api-endpoint-validation-contract.test.mjs`

**Interfaces:**
- Consumes: `readJsonObject`, `requireUuid`, `isApiInputError`, `validationErrorPayload` from Task 1.
- Produces: `payment-receipt` rejects malformed JSON, oversized bodies, and invalid `receipt_id` before querying `receipts`.

- [ ] **Step 1: Add a failing source-contract test for `payment-receipt`**

Create `app/js/tests/api-endpoint-validation-contract.test.mjs`:

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

- [ ] **Step 2: Run the contract test and verify RED**

```bash
node --test app/js/tests/api-endpoint-validation-contract.test.mjs
```

Expected: FAIL because `payment-receipt` still calls `req.json()` and only checks truthiness.

- [ ] **Step 3: Integrate the shared validation layer without moving business logic**

Add imports:

```ts
import {
  isApiInputError,
  readJsonObject,
  requireUuid,
  validationErrorPayload,
} from "../_shared/api-validation.ts";
```

Replace:

```ts
const body = await req.json().catch(() => ({}));
const receiptId = String(body?.receipt_id || "").trim();
if (!receiptId) return json({ error: "receipt_id is required" }, 400);
```

with:

```ts
const body = await readJsonObject(req);
const receiptId = requireUuid(body?.receipt_id, "receipt_id");
```

In the existing catch block, handle validation before the generic 500:

```ts
} catch (error) {
  if (isApiInputError(error)) {
    return json(validationErrorPayload(error), error.status);
  }
  console.error("payment-receipt error", error);
  return json({ error: "Could not generate receipt PDF" }, 500);
}
```

Do not change receipt queries, membership checks, storage paths, PDF generation, CORS, or response success shape.

- [ ] **Step 4: Run focused + full tests**

```bash
node --test app/js/tests/api-validation.test.mjs app/js/tests/api-endpoint-validation-contract.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2 locally**

```bash
git add supabase/functions/payment-receipt/index.ts app/js/tests/api-endpoint-validation-contract.test.mjs
git commit -m "feat: validate payment receipt requests"
```

Do not push yet.

---

### Task 3: Harden `retry-automation-message`

**Files:**
- Modify: `supabase/functions/retry-automation-message/index.ts`
- Modify: `app/js/tests/api-endpoint-validation-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 validation primitives.
- Produces: a validated `sourceMessageId` UUID and a non-empty `requestId` of at most 160 characters before any automation-message lookup/write.

- [ ] **Step 1: Add failing contract coverage**

Append:

```js
test('retry validates source UUID and rejects oversized request ids without truncation', () => {
  const code = source('supabase/functions/retry-automation-message/index.ts');
  assert.match(code, /readJsonObject/);
  assert.match(code, /requireUuid\(body\?\.source_message_id,\s*["']source_message_id["']\)/);
  assert.match(code, /requireTrimmedString\(body\?\.request_id,\s*["']request_id["']/);
  assert.doesNotMatch(code, /\.slice\(0,\s*160\)/);
  assert.ok(code.indexOf('requireUuid') < code.indexOf('.from("automation_messages")'));
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test app/js/tests/api-endpoint-validation-contract.test.mjs
```

Expected: FAIL on retry assertions.

- [ ] **Step 3: Replace manual coercion/truncation with explicit validation**

Import:

```ts
import {
  isApiInputError,
  readJsonObject,
  requireTrimmedString,
  requireUuid,
  validationErrorPayload,
} from "../_shared/api-validation.ts";
```

After successful JWT authentication, replace:

```ts
const body = await req.json().catch(() => ({}));
const sourceMessageId = String(body?.source_message_id || "").trim();
const requestId = String(body?.request_id || "").trim().slice(0, 160);
if (!sourceMessageId || !requestId) return json({ error: "Invalid request" }, 400);
```

with:

```ts
let body;
let sourceMessageId;
let requestId;
try {
  body = await readJsonObject(req);
  sourceMessageId = requireUuid(body?.source_message_id, "source_message_id");
  requestId = requireTrimmedString(body?.request_id, "request_id", { maxLength: 160 });
} catch (error) {
  if (isApiInputError(error)) return json(validationErrorPayload(error), error.status);
  throw error;
}
```

Keep authentication before semantic parsing so an unauthenticated caller still receives 401 instead of learning request-shape details.

- [ ] **Step 4: Run focused + full tests**

```bash
node --test app/js/tests/api-validation.test.mjs app/js/tests/api-endpoint-validation-contract.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3 locally**

```bash
git add supabase/functions/retry-automation-message/index.ts app/js/tests/api-endpoint-validation-contract.test.mjs
git commit -m "feat: validate retry automation requests"
```

Do not push yet.

---

### Task 4: Harden `send-whatsapp`

**Files:**
- Modify: `supabase/functions/send-whatsapp/index.ts`
- Modify: `app/js/tests/api-endpoint-validation-contract.test.mjs`

**Interfaces:**
- Consumes: shared JSON/UUID/enum/string/array validators.
- Produces validated values:
  - `studentId: UUID`
  - `person: person1 | person2`
  - `automationType` in the existing six-value enum
  - `receiptId: UUID | null`, mandatory for `receipt_document`
  - `bodyParameters: Array<string | number>` with max 12 items
  - `idempotencyKey: string | null` with max 240 characters

- [ ] **Step 1: Add failing contract coverage for strict enums and bounded fields**

Append:

```js
test('send-whatsapp validates consumed fields instead of defaulting or truncating', () => {
  const code = source('supabase/functions/send-whatsapp/index.ts');
  assert.match(code, /readJsonObject/);
  assert.match(code, /requireUuid\(body\?\.student_id,\s*["']student_id["']\)/);
  assert.match(code, /requireEnum\(body\?\.person/);
  assert.match(code, /requireEnum\(body\?\.automation_type/);
  assert.match(code, /optionalPrimitiveArray\(body\?\.body_parameters/);
  assert.match(code, /optionalTrimmedString\(body\?\.idempotency_key/);
  assert.doesNotMatch(code, /body\?\.person\s*===\s*["']person2["']\s*\?\s*["']person2["']\s*:\s*["']person1["']/);
  assert.doesNotMatch(code, /\.slice\(0,\s*12\)/);
  assert.doesNotMatch(code, /\.slice\(0,\s*240\)/);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test app/js/tests/api-endpoint-validation-contract.test.mjs
```

Expected: FAIL on send-whatsapp assertions.

- [ ] **Step 3: Add an endpoint-local parser before creating any automation log**

Import the shared helpers, then define near the handler:

```ts
const AUTOMATION_TYPES = [
  "reminder_before_due",
  "due_today",
  "overdue",
  "payment_confirmation",
  "receipt_document",
  "payment_voided",
];

function parseSendWhatsappRequest(body) {
  const studentId = requireUuid(body?.student_id, "student_id");
  const person = requireEnum(body?.person, "person", ["person1", "person2"]);
  const automationType = requireEnum(body?.automation_type, "automation_type", AUTOMATION_TYPES);
  const receiptId = optionalUuid(body?.receipt_id, "receipt_id");
  const bodyParameters = optionalPrimitiveArray(body?.body_parameters, "body_parameters", { maxItems: 12 });
  const idempotencyKey = optionalTrimmedString(body?.idempotency_key, "idempotency_key", { maxLength: 240 });
  if (automationType === "receipt_document" && !receiptId) {
    throw new ApiInputError("INVALID_INPUT", 400, "receipt_id");
  }
  return { studentId, person, automationType, receiptId, bodyParameters, idempotencyKey };
}
```

After successful JWT authentication:

```ts
let input;
try {
  input = parseSendWhatsappRequest(await readJsonObject(req));
} catch (error) {
  if (isApiInputError(error)) return json(validationErrorPayload(error), error.status);
  throw error;
}
const { studentId, person, automationType, receiptId, bodyParameters, idempotencyKey } = input;
```

Remove the current silent person default and `.slice()` truncation logic. Preserve `templateByType`, membership checks, receipt/student linkage, idempotency behavior, logging, signed URL generation, and Meta send behavior.

- [ ] **Step 4: Run focused + full tests**

```bash
node --test app/js/tests/api-validation.test.mjs app/js/tests/api-endpoint-validation-contract.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: PASS, including the existing tenant-contract tests.

- [ ] **Step 5: Commit Task 4 locally**

```bash
git add supabase/functions/send-whatsapp/index.ts app/js/tests/api-endpoint-validation-contract.test.mjs
git commit -m "feat: validate WhatsApp send requests"
```

Do not push yet.

---

### Task 5: Harden `payment-lifecycle` Last

**Files:**
- Modify: `supabase/functions/payment-lifecycle/index.ts`
- Modify: `app/js/tests/api-endpoint-validation-contract.test.mjs`

**Interfaces:**
- Consumes: shared validators proven in Tasks 1–4.
- Produces one of two validated request shapes:
  - `{ mode: 'repair', receiptId: UUID }`
  - `{ mode: 'payment', studentId: UUID, person: 'person1' | 'person2', kind: 'entry' | 'monthly', installment: 0 | 1 | 2 | 3 }`

- [ ] **Step 1: Add failing contract coverage for both request modes**

Append:

```js
test('payment-lifecycle explicitly validates operation and payment modes', () => {
  const code = source('supabase/functions/payment-lifecycle/index.ts');
  assert.match(code, /readJsonObject/);
  assert.match(code, /hasOwnProperty\.call\(body,\s*["']operation["']\)/);
  assert.match(code, /requireEnum\(body\?\.operation/);
  assert.match(code, /requireUuid\(body\?\.receipt_id/);
  assert.match(code, /requireUuid\(body\?\.student_id/);
  assert.match(code, /requireEnum\(body\?\.person/);
  assert.match(code, /requireEnum\(body\?\.kind/);
  assert.match(code, /requireInteger\(body\?\.installment/);
  assert.doesNotMatch(code, /body\?\.person\s*===\s*["']person2["']\s*\?\s*["']person2["']\s*:\s*["']person1["']/);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test app/js/tests/api-endpoint-validation-contract.test.mjs
```

Expected: FAIL on payment-lifecycle assertions.

- [ ] **Step 3: Define the two endpoint-local request contracts**

Add:

```ts
function parsePaymentLifecycleRequest(body) {
  if (Object.prototype.hasOwnProperty.call(body, "operation")) {
    const operation = requireEnum(body?.operation, "operation", ["repair_monthly_receipt"]);
    const receiptId = requireUuid(body?.receipt_id, "receipt_id");
    return { mode: "repair", operation, receiptId };
  }

  const studentId = requireUuid(body?.student_id, "student_id");
  const person = requireEnum(body?.person, "person", ["person1", "person2"]);
  const kind = requireEnum(body?.kind, "kind", ["entry", "monthly"]);
  const installment = kind === "entry"
    ? 0
    : requireInteger(body?.installment, "installment", { min: 1, max: 3 });
  return { mode: "payment", studentId, person, kind, installment };
}
```

This intentionally treats any present `operation` field as operation mode. Unsupported or blank operation values fail with `INVALID_INPUT`; normal frontend requests do not send `operation`.

- [ ] **Step 4: Parse before either business path and preserve existing behavior after parsing**

Immediately inside the existing `try`:

```ts
const body = await readJsonObject(req);
const input = parsePaymentLifecycleRequest(body);

if (input.mode === "repair") {
  const repairReceiptId = input.receiptId;
  // existing repair path unchanged from this point onward
}

const { studentId, person, kind, installment } = input;
// existing normal payment path unchanged from this point onward
```

Handle `ApiInputError` in the outer catch before the generic 500:

```ts
if (isApiInputError(error)) {
  return json(validationErrorPayload(error), error.status);
}
```

Do not change payment state calculation, receipt generation, idempotency keys, automation settings, tenant checks, Meta calls, or PDF handling.

- [ ] **Step 5: Run focused + full tests**

```bash
node --test app/js/tests/api-validation.test.mjs app/js/tests/api-endpoint-validation-contract.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5 locally**

```bash
git add supabase/functions/payment-lifecycle/index.ts app/js/tests/api-endpoint-validation-contract.test.mjs
git commit -m "feat: validate payment lifecycle requests"
```

Do not push yet.

---

### Task 6: Supabase Dev Gate — Compile and Test Only Safe Negative Paths

**Files:**
- No new source files unless compilation exposes a real source bug.
- Deploy exact working-tree bundles for:
  - `payment-receipt`
  - `retry-automation-message`
  - `send-whatsapp`
  - `payment-lifecycle`

**Interfaces:**
- Consumes: all code from Tasks 1–5.
- Produces: four ACTIVE dev Edge Functions with `verify_jwt=true`, validation responses proven on invalid requests, and unchanged business-data invariants.

- [ ] **Step 1: Record dev aggregate invariants before deployment**

Run read-only SQL in the dev project and record at least:

```sql
select
  (select count(*) from public.classes) as classes_total,
  (select count(*) from public.students) as students_total,
  (select count(*) from public.payment_events) as payment_events_total,
  (select count(*) from public.receipts) as receipts_total,
  (select count(*) from public.automation_messages) as automation_messages_total;
```

Also confirm zero academy-link mismatches using the existing Phase 1 audit queries. Do not inspect personal row contents.

- [ ] **Step 2: Deploy `payment-receipt` to dev and verify ACTIVE + `verify_jwt=true`**

Deploy the exact local bundle including `_shared/api-validation.ts` and its existing dependencies.

Expected: function status `ACTIVE`; `verify_jwt=true`.

- [ ] **Step 3: Deploy `retry-automation-message`, then `send-whatsapp`, then `payment-lifecycle` to dev**

After each deployment, verify status `ACTIVE` and `verify_jwt=true` before continuing. Stop on any compile/import failure.

- [ ] **Step 4: Run safe HTTP method/auth tests that cannot write business data**

Examples against dev:

```bash
curl -i -X GET "$DEV_FUNCTIONS_URL/payment-receipt"
curl -i -X POST "$DEV_FUNCTIONS_URL/payment-receipt" -H 'Content-Type: application/json' --data '{}'
```

Expected: 405 for wrong method and 401 for missing JWT.

- [ ] **Step 5: With a dedicated dev test JWT, run only invalid payload tests**

Use a short-lived dev-only JWT in `$DEV_TEST_JWT`; never commit it.

Malformed JSON:

```bash
curl -i -X POST "$DEV_FUNCTIONS_URL/payment-receipt" \
  -H "Authorization: Bearer $DEV_TEST_JWT" \
  -H 'Content-Type: application/json' \
  --data-binary '{bad'
```

Expected: 400 with `code: INVALID_JSON`.

Invalid UUID:

```bash
curl -i -X POST "$DEV_FUNCTIONS_URL/payment-receipt" \
  -H "Authorization: Bearer $DEV_TEST_JWT" \
  -H 'Content-Type: application/json' \
  --data '{"receipt_id":"not-a-uuid"}'
```

Expected: 400 with `code: INVALID_INPUT`, `field: receipt_id`.

Oversized body:

```bash
python - <<'PY' > /tmp/too-large.json
import json
print(json.dumps({"receipt_id":"11111111-1111-4111-8111-111111111111","padding":"x" * (65 * 1024)}))
PY
curl -i -X POST "$DEV_FUNCTIONS_URL/payment-receipt" \
  -H "Authorization: Bearer $DEV_TEST_JWT" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/too-large.json
```

Expected: 413 with `code: PAYLOAD_TOO_LARGE`.

Endpoint-specific invalid examples:

```bash
# payment-lifecycle: bad enum / installment
--data '{"student_id":"11111111-1111-4111-8111-111111111111","person":"person3","kind":"monthly","installment":4}'

# send-whatsapp: unsupported person / automation type
--data '{"student_id":"11111111-1111-4111-8111-111111111111","person":"person3","automation_type":"unknown"}'

# retry: malformed source id / oversized request id
--data '{"source_message_id":"bad","request_id":"x"}'
```

Expected: 400 validation responses before any business query/write path can create a payment, receipt, or automation log.

Do not execute a positive send, payment mutation, receipt generation, or retry solely to test validation.

- [ ] **Step 6: Re-run dev aggregate invariants**

Run the exact same aggregate/mismatch queries from Step 1.

Expected: business counts and mismatch counts are unchanged by the negative tests.

- [ ] **Step 7: Run full local regression suite again**

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit any dev-gate-only source correction only after reproducing it in a failing test**

If no source correction was needed, do not create an empty commit. If a real compile/runtime issue was found, follow RED -> fix -> GREEN and commit only that focused correction.

---

### Task 7: One Grouped PR, CI Gate, and Exact-Bundle Production Promotion

**Files:**
- Existing implementation files only.
- Include the approved spec and this plan in the same PR if they are not already on `main`.

**Interfaces:**
- Consumes: dev-validated bundles and green local tests.
- Produces: `main` as source of truth, one validated production promotion of the four Edge Functions, and post-deploy evidence that business data was not rewritten.

- [ ] **Step 1: Review the implementation diff against the approved scope**

Confirm the PR diff contains only:

```text
supabase/functions/_shared/api-validation.ts
supabase/functions/payment-receipt/index.ts
supabase/functions/retry-automation-message/index.ts
supabase/functions/send-whatsapp/index.ts
supabase/functions/payment-lifecycle/index.ts
app/js/tests/api-validation.test.mjs
app/js/tests/api-endpoint-validation-contract.test.mjs
docs/superpowers/specs/2026-09-13-phase-2a-api-validation-design.md
docs/superpowers/plans/2026-09-13-phase-2a-api-validation.md
```

If any migration, business schema, `process-reminders`, `whatsapp-webhook`, or CORS allowlist change appears, stop and remove it from Phase 2A.

- [ ] **Step 2: Run the full test suite immediately before publishing**

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: 0 failures.

- [ ] **Step 3: Push the implementation branch once and open one PR to `main`**

Use a branch such as:

```text
security/phase-2a-api-validation
```

Do not push a series of speculative fixes. The branch should already have passed the dev gate before the PR is opened.

- [ ] **Step 4: Verify GitHub Actions, not only Vercel status**

The existing workflow must complete both steps successfully:

```text
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

If CI fails, inspect the failing test/log and fix the cause; do not weaken runtime validation to satisfy stale tests unless the test is proven coupled to obsolete implementation detail.

- [ ] **Step 5: Merge only after CI is green and confirm `main` points to the merge commit**

Do not deploy production Edge Functions from an unmerged branch.

- [ ] **Step 6: Record production read-only aggregate invariants immediately before deployment**

Record counts for classes, students, payment events, receipts, and automation messages plus academy mismatch counts. No personal row contents.

There is no production SQL migration in this phase.

- [ ] **Step 7: Promote the exact dev-validated bundles in low-risk order**

Deploy and verify one function at a time:

1. `payment-receipt` — `verify_jwt=true`
2. `retry-automation-message` — `verify_jwt=true`
3. `send-whatsapp` — `verify_jwt=true`
4. `payment-lifecycle` — `verify_jwt=true`

After each deploy:

- function status must be `ACTIVE`,
- `verify_jwt` must remain `true`,
- production bundle hash must equal the validated dev bundle hash for that function.

Stop on the first mismatch or failed deployment.

- [ ] **Step 8: Re-run production aggregate and structural checks**

Expected:

- all pre-deploy business counts unchanged,
- academy-link mismatch counts unchanged at zero,
- no database migration added by Phase 2A,
- all four production bundle hashes equal their dev-validated hashes.

Do not invoke positive payment/WhatsApp actions merely to test production validation.

- [ ] **Step 9: Final completion gate**

Only declare Phase 2A complete after fresh evidence shows:

```text
shared validation tests: PASS
endpoint contract tests: PASS
full repository JS suite: PASS
GitHub Actions: PASS
4 dev functions: ACTIVE, verify_jwt=true
safe negative dev HTTP tests: expected 400/413/401/405
pre/post dev business invariants: unchanged
main merged: confirmed
4 production functions: ACTIVE, verify_jwt=true
production hashes == validated dev hashes
pre/post production business invariants: unchanged
no Phase 2A DB migration: confirmed
```

If any line is unproven, report that line as pending rather than calling the phase complete.
