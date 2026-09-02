# Monthly Receipt Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate monthly receipt PDF generation from `payment-lifecycle` into the existing `payment-receipt` Edge Function while preserving authoritative payment state, WhatsApp confirmation behavior, tenant isolation, and registration-payment behavior.

**Architecture:** `payment-lifecycle` remains the only owner of payment state, `payment_events`, receipt-row creation/voiding, and WhatsApp orchestration. For monthly receipts only, it delegates PDF generation to a modernized `payment-receipt` function using the original user JWT; the delegated function validates academy membership independently, generates/reuses the PDF, and updates `storage_path` on the existing receipt. Registration (`kind = 'entry'`) stays on the current in-function PDF path.

**Tech Stack:** Vanilla JavaScript, Supabase Auth/Postgres/Storage/Edge Functions, Deno, `pdf-lib`, Node `node:test`, Vercel preview.

**Spec:** `docs/superpowers/specs/2026-09-02-monthly-receipt-separation-design.md`

## Global Constraints

- Branch: `feat/separate-payment-receipts`, based on `main`.
- Scope is monthly payments only: installments 1, 2 and 3.
- Registration/enrollment payment (`kind = 'entry'`) behavior must remain unchanged.
- `payment-lifecycle` remains authoritative for `payment_events`, receipt creation/reuse/voiding, payment confirmation WhatsApp, payment-void WhatsApp, and automation idempotency.
- `payment-receipt` becomes the sole generator/uploader of monthly receipt PDFs.
- A monthly PDF failure must never undo or misreport a valid payment.
- A receipt row may remain active with `storage_path = null`; this is a recoverable pending-PDF state.
- Payment confirmation WhatsApp is independent from PDF generation.
- Receipt-document WhatsApp may be sent only when a valid PDF/storage path exists.
- Explicit repair must not change payment state, create another receipt, create another payment event, or resend payment confirmation.
- Both Edge Functions require authenticated requests; `payment-receipt` authorizes through active `academy_members`, not `receipt.user_id`.
- `academy_profiles` must not be queried by the modern monthly receipt path.
- Cross-academy receipt generation/repair must fail closed.
- Existing receipt PDFs are preserved after void; Storage deletion is out of scope.
- No schema migration is expected for this feature.
- UI changes must follow `docs/ui-motion-standard.md`: async repair buttons expose real loading/disabled state, prevent duplicate submits, and add no decorative motion.
- All implementation uses TDD: RED first, minimal GREEN, regression after each task.
- Use Supabase DEV project `lulvvkrrysfmiqtefwnf` for Edge Function/integration validation.
- Do not deploy these new function versions to production and do not merge to `main` until DEV validation, full regression, final diff review, and explicit user approval.

---

## Execution Preflight

Before Task 1, create/use an isolated worktree for `feat/separate-payment-receipts` and verify the branch starts clean.

Run:

```bash
node --test app/js/tests/*.test.js app/js/tests/*.test.mjs
```

Expected baseline at plan creation: **76 tests pass, 0 fail**. If the baseline differs because `main` moved, record the new clean baseline before implementation; do not attribute pre-existing failures to this feature.

---

## File Structure

- `supabase/functions/payment-receipt/index.ts` — modern monthly-only PDF worker: authentication, tenant authorization, identity lookup, PDF generation, Storage upload, idempotent reuse.
- `supabase/functions/_shared/monthly-receipt-delegation.mjs` — small server-to-server client used by `payment-lifecycle` to invoke `payment-receipt` with the original user JWT.
- `supabase/functions/payment-lifecycle/index.ts` — retains financial state/WhatsApp ownership, delegates only monthly PDF work, exposes partial-success and explicit repair outcomes.
- `app/js/features/payment-automation.js` — maps lifecycle outcomes to accurate user-facing toast messages and exposes explicit repair invocation.
- `app/js/features/receipts.js` — identifies repairable active monthly receipts and renders/handles `Gerar PDF` with duplicate-submit protection.
- `app/js/tests/payment-receipt-monthly.test.mjs` — static contract for tenant authorization, monthly-only behavior, academy identity, active-state restriction, and PDF reuse.
- `app/js/tests/monthly-receipt-delegation.test.mjs` — executable unit test for server-to-server request headers/body and failure handling.
- `app/js/tests/payment-lifecycle-monthly-receipt.test.mjs` — static lifecycle contract for delegation, entry regression, partial failure, WhatsApp ordering/idempotency, and repair operation.
- `app/js/tests/payment-automation-trigger.test.js` — extend existing frontend orchestration tests with lifecycle message/repair payload behavior.
- `app/js/tests/receipts.test.js` — extend receipt pure-function tests with repair eligibility.
- `app/js/tests/receipts-repair-ui.test.mjs` — static UI contract for `Gerar PDF`, loading/disabled state, reload, and no repair action for entry/voided receipts.
- `docs/validation/2026-09-02-monthly-receipt-separation-validation.md` — DEV deployment versions, automated results, manual flow, repair proof, tenant/idempotency checks, and final merge gate.

---

### Task 1: Modernize `payment-receipt` for monthly tenant-owned receipts

**Files:**
- Modify: `supabase/functions/payment-receipt/index.ts`
- Create: `app/js/tests/payment-receipt-monthly.test.mjs`

**Interfaces:**
- Consumes: request `{ receipt_id: string }` plus `Authorization: Bearer <user JWT>`.
- Produces: HTTP `200` with `{ receipt }` where `receipt.storage_path` is non-null or already existed.
- Authorization: active row in `academy_members` for `(receipt.academy_id, user.id, is_active=true)`.
- Rejects: non-monthly receipt, non-active receipt, missing academy, cross-tenant user.

- [ ] **Step 1: Write the failing source-contract tests**

Create `app/js/tests/payment-receipt-monthly.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
    new URL('../../../supabase/functions/payment-receipt/index.ts', import.meta.url),
    'utf8'
);

test('payment-receipt accepts only active monthly receipts', () => {
    assert.match(source, /receipt\.kind\s*!==\s*["']monthly["']/);
    assert.match(source, /receipt\.status\s*!==\s*["']active["']/);
});

test('payment-receipt authorizes through active academy membership', () => {
    assert.match(source, /from\(["']academy_members["']\)/);
    assert.match(source, /eq\(["']academy_id["'],\s*receipt\.academy_id\)/);
    assert.match(source, /eq\(["']user_id["'],\s*user\.id\)/);
    assert.match(source, /eq\(["']is_active["'],\s*true\)/);
    assert.doesNotMatch(source, /receipt\.user_id\s*!==\s*user\.id/);
});

test('payment-receipt uses tenant academy identity', () => {
    assert.match(source, /from\(["']academies["']\)/);
    assert.match(source, /select\(["']name,display_name,responsible_name,support_phone["']\)/);
    assert.match(source, /eq\(["']id["'],\s*receipt\.academy_id\)/);
    assert.doesNotMatch(source, /from\(["']academy_profiles["']\)/);
    assert.match(source, /academyName:\s*academy\.name/);
});

test('payment-receipt reuses an existing PDF before generating another one', () => {
    assert.match(source, /if\s*\(receipt\.storage_path\)\s*return json\(\{\s*receipt\s*\}\)/);
    assert.match(source, /upload\(storagePath,\s*pdfBytes,[\s\S]*?upsert:\s*true/);
    assert.match(source, /eq\(["']academy_id["'],\s*receipt\.academy_id\)/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test app/js/tests/payment-receipt-monthly.test.mjs
```

Expected: failures showing the current function still uses `receipt.user_id`/`academy_profiles` and lacks monthly/active guards.

- [ ] **Step 3: Implement the minimal tenant-aware monthly worker**

In `supabase/functions/payment-receipt/index.ts`, after loading the receipt, use this control shape:

```ts
if (receipt.kind !== "monthly") {
  return json({ error: "Monthly receipt required" }, 400);
}
if (receipt.status !== "active") {
  return json({ error: "Active receipt required" }, 400);
}
if (!receipt.academy_id) {
  return json({ error: "Academy not resolved" }, 409);
}

const { data: membership, error: membershipError } = await admin
  .from("academy_members")
  .select("academy_id,is_active")
  .eq("academy_id", receipt.academy_id)
  .eq("user_id", user.id)
  .eq("is_active", true)
  .maybeSingle();

if (membershipError) throw membershipError;
if (!membership) return json({ error: "Forbidden" }, 403);

if (receipt.storage_path) return json({ receipt });
```

Replace `academy_profiles` with:

```ts
const [{ data: student, error: studentError }, { data: academy, error: academyError }] = await Promise.all([
  admin.from("students").select("id,person1,person2").eq("id", receipt.student_id).single(),
  admin.from("academies")
    .select("name,display_name,responsible_name,support_phone")
    .eq("id", receipt.academy_id)
    .single(),
]);
```

Build the PDF with official identity:

```ts
const pdfBytes = await generateReceiptPdf({
  receiptNumber: receipt.receipt_number,
  academyName: academy.name,
  displayName: academy.display_name,
  responsibleName: academy.responsible_name,
  supportPhone: academy.support_phone,
  studentName,
  className,
  paymentLabel: `${Number(receipt.installment || 0)}ª Mensalidade`,
  amount: Number(receipt.amount || 0),
  paidAt: receipt.paid_at,
  status: "active",
});
```

Keep a stable receipt-owned path and tenant-filter the update:

```ts
const storagePath = `${receipt.user_id || user.id}/${receipt.id}.pdf`;

const { data: updated, error: updateError } = await admin
  .from("receipts")
  .update({ storage_path: storagePath })
  .eq("id", receipt.id)
  .eq("academy_id", receipt.academy_id)
  .select("*")
  .single();
```

Do not create, void, or otherwise modify payment state in this function.

- [ ] **Step 4: Run focused and neighboring receipt tests**

Run:

```bash
node --test \
  app/js/tests/payment-receipt-monthly.test.mjs \
  app/js/tests/receipts.test.js \
  app/js/tests/payment-lifecycle-academy-identity.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add supabase/functions/payment-receipt/index.ts app/js/tests/payment-receipt-monthly.test.mjs
git commit -m "feat: make payment receipt monthly and tenant aware"
```

---

### Task 2: Add a testable server-to-server monthly receipt delegate

**Files:**
- Create: `supabase/functions/_shared/monthly-receipt-delegation.mjs`
- Create: `app/js/tests/monthly-receipt-delegation.test.mjs`

**Interfaces:**
- Produces: `requestMonthlyReceiptPdf({ supabaseUrl, anonKey, authHeader, receiptId, fetchImpl? }) -> Promise<receipt>`.
- Forwards: original `Authorization` header and Supabase publishable/anon key as `apikey`.
- Throws: on non-2xx response or missing `payload.receipt`.

- [ ] **Step 1: Write the failing executable unit tests**

Create `app/js/tests/monthly-receipt-delegation.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestMonthlyReceiptPdf } from '../../../supabase/functions/_shared/monthly-receipt-delegation.mjs';

test('delegation forwards the original JWT and receipt id', async () => {
    let captured;
    const receipt = await requestMonthlyReceiptPdf({
        supabaseUrl: 'https://example.supabase.co',
        anonKey: 'anon-key',
        authHeader: 'Bearer user-jwt',
        receiptId: 'receipt-123',
        fetchImpl: async (url, options) => {
            captured = {url, options};
            return {
                ok: true,
                status: 200,
                json: async () => ({receipt: {id: 'receipt-123', storage_path: 'u/r.pdf'}})
            };
        }
    });

    assert.equal(captured.url, 'https://example.supabase.co/functions/v1/payment-receipt');
    assert.equal(captured.options.headers.Authorization, 'Bearer user-jwt');
    assert.equal(captured.options.headers.apikey, 'anon-key');
    assert.deepEqual(JSON.parse(captured.options.body), {receipt_id: 'receipt-123'});
    assert.equal(receipt.storage_path, 'u/r.pdf');
});

test('delegation rejects a failed PDF response without hiding the status', async () => {
    await assert.rejects(
        requestMonthlyReceiptPdf({
            supabaseUrl: 'https://example.supabase.co',
            anonKey: 'anon-key',
            authHeader: 'Bearer user-jwt',
            receiptId: 'receipt-123',
            fetchImpl: async () => ({
                ok: false,
                status: 500,
                json: async () => ({error: 'Could not generate receipt PDF'})
            })
        }),
        error => error.message === 'Could not generate receipt PDF' && error.status === 500
    );
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test app/js/tests/monthly-receipt-delegation.test.mjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the minimal delegate**

Create `supabase/functions/_shared/monthly-receipt-delegation.mjs`:

```js
export async function requestMonthlyReceiptPdf({
    supabaseUrl,
    anonKey,
    authHeader,
    receiptId,
    fetchImpl = fetch
}) {
    const response = await fetchImpl(`${supabaseUrl}/functions/v1/payment-receipt`, {
        method: 'POST',
        headers: {
            Authorization: authHeader,
            apikey: anonKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({receipt_id: receiptId})
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.receipt) {
        const error = new Error(payload?.error || 'Could not generate receipt PDF');
        error.status = response.status;
        throw error;
    }
    return payload.receipt;
}
```

Do not log `authHeader` or include the token in errors.

- [ ] **Step 4: Run the delegate test**

```bash
node --test app/js/tests/monthly-receipt-delegation.test.mjs
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add supabase/functions/_shared/monthly-receipt-delegation.mjs app/js/tests/monthly-receipt-delegation.test.mjs
git commit -m "feat: add monthly receipt delegation client"
```

---

### Task 3: Delegate monthly PDF work from `payment-lifecycle` and preserve partial success

**Files:**
- Modify: `supabase/functions/payment-lifecycle/index.ts`
- Create: `app/js/tests/payment-lifecycle-monthly-receipt.test.mjs`
- Regression: `app/js/tests/payment-lifecycle-academy-context.test.mjs`
- Regression: `app/js/tests/payment-lifecycle-academy-identity.test.mjs`

**Interfaces:**
- Normal payment request remains `{ student_id, person, kind, installment }`.
- Repair request adds `{ operation: 'repair_monthly_receipt', receipt_id }`.
- Normal/repair responses expose `pdf_status: 'ready' | 'pending' | 'not_applicable'`.
- Repair responses use `action: 'repair'` on success and `action: 'repair_pending'` when PDF generation still fails.

- [ ] **Step 1: Write lifecycle source-contract tests**

Create `app/js/tests/payment-lifecycle-monthly-receipt.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
    new URL('../../../supabase/functions/payment-lifecycle/index.ts', import.meta.url),
    'utf8'
);

test('monthly PDF generation is delegated with original auth context', () => {
    assert.match(source, /monthly-receipt-delegation\.mjs/);
    assert.match(source, /requestMonthlyReceiptPdf\(\{[\s\S]*?authHeader[\s\S]*?receiptId:\s*receipt\.id/);
});

test('registration keeps direct PDF generation while monthly does not', () => {
    assert.match(source, /kind\s*===\s*["']entry["'][\s\S]*?generateReceiptPdf/);
    assert.match(source, /kind\s*===\s*["']monthly["'][\s\S]*?requestMonthlyReceiptPdf/);
});

test('monthly PDF failure becomes partial success instead of payment failure', () => {
    assert.match(source, /pdfStatus\s*=\s*["']pending["']/);
    assert.match(source, /catch\s*\([^)]*\)\s*\{[\s\S]*?pdfStatus\s*=\s*["']pending["']/);
    assert.match(source, /pdf_status:\s*pdfStatus/);
});

test('payment confirmation is not repeated during repair', () => {
    assert.match(source, /operation\s*===\s*["']repair_monthly_receipt["']/);
    assert.match(source, /action\s*===\s*["']create["'][\s\S]*?payment_confirmation/);
    assert.doesNotMatch(source, /repair_monthly_receipt[\s\S]*?payment_confirmation[\s\S]*?sendLogged/);
});

test('receipt document requires a generated storage path', () => {
    assert.match(source, /receipt\.storage_path[\s\S]*?receipt_document/);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
node --test \
  app/js/tests/payment-lifecycle-monthly-receipt.test.mjs \
  app/js/tests/monthly-receipt-delegation.test.mjs
```

Expected: lifecycle contract fails because delegation/repair/pdf status do not yet exist.

- [ ] **Step 3: Import the delegate and parse repair requests before normal payment validation**

At the imports:

```ts
import { requestMonthlyReceiptPdf } from "../_shared/monthly-receipt-delegation.mjs";
```

After parsing the body:

```ts
const operation = String(body?.operation || "");
const repairReceiptId = operation === "repair_monthly_receipt"
  ? String(body?.receipt_id || "").trim()
  : "";
```

When `operation === "repair_monthly_receipt"`, branch before requiring `student_id`. Load the receipt, require `kind === "monthly"`, `status === "active"`, non-null `academy_id`, validate active membership for that academy, load the linked student/academy/settings, and do **not** write `payment_events` or receipt status.

Use the same `requestMonthlyReceiptPdf()` call as the normal monthly flow. On success, send only `receipt_document` if eligible/configured. Return:

```ts
return json({
  paid: true,
  action: "repair",
  receipt: repairedReceipt,
  pdf_status: "ready",
  whatsapp,
  settings,
});
```

On delegated PDF failure, return a non-destructive repair result rather than throwing:

```ts
return json({
  paid: true,
  action: "repair_pending",
  receipt,
  pdf_status: "pending",
  whatsapp,
  settings,
});
```

- [ ] **Step 4: Reorder the normal monthly flow so confirmation happens before PDF work**

After the receipt row exists and WhatsApp helpers/settings are available:

```ts
if (
  action === "create" &&
  eligible &&
  metaReady &&
  settings.payment_confirmation_enabled
) {
  const confirmation = buildTemplatePayload({
    to: normalizeRecipientPhone(phone)!,
    templateName: TEMPLATE_NAMES.paymentConfirmation,
    languageCode: "pt_BR",
    bodyParameters: [
      studentName,
      academyMessageName,
      label,
      money(paymentNotificationAmount(action, receipt, amount)),
      receipt.receipt_number,
      academy.responsible_name || "responsável da academia",
      academy.support_phone || "contato da academia",
    ],
  });
  whatsapp.payment_confirmation = await sendLogged(
    "payment_confirmation",
    confirmation,
    `payment:${receipt.id}:confirmation`,
  );
}
```

This block must not run for `keep`, `repair`, or `repair_pending`.

- [ ] **Step 5: Split entry vs monthly PDF behavior**

Keep the current direct PDF generation only under the entry branch:

```ts
if (paid && kind === "entry" && receiptNeedsPdf(receipt)) {
  // existing generateReceiptPdf + Storage upload path stays here unchanged
}
```

For monthly:

```ts
let pdfStatus: "ready" | "pending" | "not_applicable" = "not_applicable";

if (paid && kind === "monthly" && receipt) {
  if (receipt.storage_path) {
    pdfStatus = "ready";
  } else {
    try {
      receipt = await requestMonthlyReceiptPdf({
        supabaseUrl,
        anonKey,
        authHeader,
        receiptId: receipt.id,
      });
      pdfStatus = receipt?.storage_path ? "ready" : "pending";
    } catch (error) {
      console.error("monthly receipt PDF pending", error instanceof Error ? error.message : "unknown error");
      pdfStatus = "pending";
    }
  }
}
```

Never delete the payment event or active receipt from this catch path.

- [ ] **Step 6: Gate receipt-document delivery on `storage_path`**

The document block must require:

```ts
if (
  eligible &&
  metaReady &&
  receipt &&
  receipt.storage_path &&
  settings.receipt_delivery_enabled
) {
  // create signed URL and sendLogged('receipt_document', ...)
}
```

Preserve the existing idempotency key:

```ts
`payment:${receipt.id}:document`
```

- [ ] **Step 7: Return explicit PDF state without changing void behavior**

Normal response:

```ts
return json({
  paid,
  action,
  receipt,
  whatsapp,
  settings,
  pdf_status: pdfStatus,
});
```

For `kind === 'entry'`, keep its existing success/error semantics; `pdf_status` may be `ready` when `receipt.storage_path` exists, otherwise `not_applicable`. Do not convert entry-PDF exceptions into the new monthly partial-success behavior.

- [ ] **Step 8: Run focused lifecycle regression**

```bash
node --test \
  app/js/tests/monthly-receipt-delegation.test.mjs \
  app/js/tests/payment-lifecycle-monthly-receipt.test.mjs \
  app/js/tests/payment-lifecycle-academy-context.test.mjs \
  app/js/tests/payment-lifecycle-academy-identity.test.mjs \
  app/js/tests/payment-automation-trigger.test.js \
  app/js/tests/receipts.test.js
```

Expected: all pass; existing academy scoping remains intact.

- [ ] **Step 9: Commit Task 3**

```bash
git add \
  supabase/functions/payment-lifecycle/index.ts \
  app/js/tests/payment-lifecycle-monthly-receipt.test.mjs
git commit -m "feat: delegate monthly receipt pdf lifecycle"
```

---

### Task 4: Add accurate frontend feedback and explicit `Gerar PDF` repair UI

**Files:**
- Modify: `app/js/features/payment-automation.js`
- Modify: `app/js/features/receipts.js`
- Modify: `app/js/tests/payment-automation-trigger.test.js`
- Modify: `app/js/tests/receipts.test.js`
- Create: `app/js/tests/receipts-repair-ui.test.mjs`

**Interfaces:**
- `paymentLifecycleMessage(data) -> string | null` becomes the pure toast mapper.
- `repairMonthlyReceipt(receiptId) -> Promise<object|null>` invokes lifecycle with `{ operation: 'repair_monthly_receipt', receipt_id }`.
- `canRepairReceipt(receipt) -> boolean` is true only for active monthly receipts with no `storage_path`.

- [ ] **Step 1: Extend the payment automation tests first**

In `app/js/tests/payment-automation-trigger.test.js`, import the new pure helper:

```js
const {
    collectPaymentChanges,
    processSavedStudent,
    paymentLifecycleMessage
} = require('../features/payment-automation.js');
```

Add assertions:

```js
assert.equal(
    paymentLifecycleMessage({
        action: 'create',
        pdf_status: 'pending',
        whatsapp: {payment_confirmation: 'sent'}
    }),
    'Pagamento registrado e confirmação enviada. O PDF do recibo ficou pendente e poderá ser gerado novamente.'
);

assert.equal(
    paymentLifecycleMessage({
        action: 'create',
        pdf_status: 'pending',
        whatsapp: {payment_confirmation: 'skipped'}
    }),
    'Pagamento registrado. O PDF do recibo ficou pendente e poderá ser gerado novamente.'
);

assert.equal(
    paymentLifecycleMessage({action: 'repair', pdf_status: 'ready'}),
    'Recibo gerado com sucesso.'
);

assert.equal(
    paymentLifecycleMessage({action: 'repair_pending', pdf_status: 'pending'}),
    'O pagamento continua registrado, mas o PDF ainda não pôde ser gerado.'
);
```

- [ ] **Step 2: Extend receipt pure-function tests first**

In `app/js/tests/receipts.test.js`, import `canRepairReceipt` and add:

```js
assert.equal(
    canRepairReceipt({kind: 'monthly', status: 'active', storage_path: null}),
    true
);
assert.equal(
    canRepairReceipt({kind: 'entry', status: 'active', storage_path: null}),
    false
);
assert.equal(
    canRepairReceipt({kind: 'monthly', status: 'voided', storage_path: null}),
    false
);
assert.equal(
    canRepairReceipt({kind: 'monthly', status: 'active', storage_path: 'u/r.pdf'}),
    false
);
```

- [ ] **Step 3: Add a static UI contract test**

Create `app/js/tests/receipts-repair-ui.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
    new URL('../features/receipts.js', import.meta.url),
    'utf8'
);

test('receipt history exposes repair only for repairable receipts', () => {
    assert.match(source, /data-repair-receipt/);
    assert.match(source, />Gerar PDF</);
    assert.match(source, /canRepairReceipt\(item\)/);
});

test('repair disables the button while lifecycle request is pending', () => {
    assert.match(source, /button\.disabled\s*=\s*true/);
    assert.match(source, /button\.disabled\s*=\s*false/);
});

test('repair delegates to payment lifecycle and reloads receipts', () => {
    assert.match(source, /repairMonthlyReceipt/);
    assert.match(source, /operation:\s*["']repair_monthly_receipt["']/);
    assert.match(source, /receipt_id:/);
    assert.match(source, /api\.load\(\)/);
});
```

- [ ] **Step 4: Run frontend tests and confirm RED**

```bash
node --test \
  app/js/tests/payment-automation-trigger.test.js \
  app/js/tests/receipts.test.js \
  app/js/tests/receipts-repair-ui.test.mjs
```

Expected: new helper/UI assertions fail.

- [ ] **Step 5: Implement `paymentLifecycleMessage` and repair invocation**

In `app/js/features/payment-automation.js` add:

```js
function paymentLifecycleMessage(data) {
    if (!data) return null;

    if (data.action === 'repair') return 'Recibo gerado com sucesso.';
    if (data.action === 'repair_pending') {
        return 'O pagamento continua registrado, mas o PDF ainda não pôde ser gerado.';
    }

    if (data.pdf_status === 'pending') {
        const confirmation = data.whatsapp?.payment_confirmation;
        const sent = ['sent', 'delivered', 'read'].includes(confirmation);
        return sent
            ? 'Pagamento registrado e confirmação enviada. O PDF do recibo ficou pendente e poderá ser gerado novamente.'
            : 'Pagamento registrado. O PDF do recibo ficou pendente e poderá ser gerado novamente.';
    }

    if (data.action === 'create') {
        const summary = paymentAutomationSummary(data.whatsapp);
        return summary === 'processed'
            ? 'Pagamento salvo, recibo gerado e automação processada.'
            : 'Pagamento salvo e recibo PDF gerado.';
    }
    if (data.action === 'void') return 'Pagamento desmarcado e recibo estornado.';
    return null;
}
```

Use it inside `processLifecycle` instead of hard-coded branches:

```js
const message = paymentLifecycleMessage(data);
if (message) toast(message);
```

Add:

```js
async function repairMonthlyReceipt(receiptId) {
    try {
        const {data, error} = await db.functions.invoke('payment-lifecycle', {
            body: {operation: 'repair_monthly_receipt', receipt_id: receiptId}
        });
        if (error) throw error;
        if (window.Receipts?.load) await window.Receipts.load();
        const message = paymentLifecycleMessage(data);
        if (message) toast(message);
        window.dispatchEvent(new CustomEvent('payment:lifecycle', {detail: data || {}}));
        return data || {};
    } catch (error) {
        console.error('monthly receipt repair failed', error);
        toast('O pagamento continua registrado, mas o PDF ainda não pôde ser gerado.');
        return null;
    }
}
```

Expose it on `window.PaymentAutomation`, and export `paymentLifecycleMessage` under CommonJS for tests.

- [ ] **Step 6: Implement repair eligibility and UI**

In `app/js/features/receipts.js`:

```js
function canRepairReceipt(receipt) {
    return Boolean(
        receipt &&
        receipt.kind === 'monthly' &&
        receipt.status === 'active' &&
        !receipt.storage_path
    );
}
```

Add to `api` and CommonJS exports.

Render PDF cell as:

```js
const pdfAction = item.storage_path
    ? `<button type="button" class="btn btn-light" data-open-receipt="${item.id}">Visualizar</button>`
    : canRepairReceipt(item)
        ? `<button type="button" class="btn btn-light" data-repair-receipt="${item.id}">Gerar PDF</button>`
        : '<span style="color:var(--muted);font-size:11px">PDF pendente</span>';
```

Extend the panel click handler:

```js
const repairButton = event.target.closest('[data-repair-receipt]');
if (repairButton) {
    const receipt = api.items.find(item => item.id === repairButton.dataset.repairReceipt);
    if (!receipt || !canRepairReceipt(receipt)) return;
    repairButton.disabled = true;
    repairButton.setAttribute('aria-busy', 'true');
    try {
        await root.PaymentAutomation?.repairMonthlyReceipt(receipt.id);
        await api.load();
    } finally {
        repairButton.disabled = false;
        repairButton.removeAttribute('aria-busy');
    }
    return;
}
```

No decorative animation is required; the disabled/loading state is the feedback.

- [ ] **Step 7: Run frontend tests**

```bash
node --test \
  app/js/tests/payment-automation-trigger.test.js \
  app/js/tests/receipts.test.js \
  app/js/tests/receipts-repair-ui.test.mjs
```

Expected: all pass.

- [ ] **Step 8: Commit Task 4**

```bash
git add \
  app/js/features/payment-automation.js \
  app/js/features/receipts.js \
  app/js/tests/payment-automation-trigger.test.js \
  app/js/tests/receipts.test.js \
  app/js/tests/receipts-repair-ui.test.mjs
git commit -m "feat: add monthly receipt pdf repair flow"
```

---

### Task 5: Full automated regression and DEV integration

**Files:**
- Create: `docs/validation/2026-09-02-monthly-receipt-separation-validation.md`
- Temporary only if needed: `.github/workflows/monthly-receipt-separation-validation.yml` — remove before final branch review.
- Preview-only branch: `test/monthly-receipt-separation-preview` — never merge its DEV config override.

**Interfaces:**
- DEV Supabase project: `lulvvkrrysfmiqtefwnf`.
- DEV URL: `https://lulvvkrrysfmiqtefwnf.supabase.co`.
- DEV publishable key: `sb_publishable_ePxmJIkapB3AFctwbvrs2A_fe2DwoOk`.
- Both DEV Edge Functions keep `verify_jwt=true`.

- [ ] **Step 1: Run the full Node regression suite on the exact feature head**

```bash
node --test app/js/tests/*.test.js app/js/tests/*.test.mjs
```

If local execution is unavailable, add a temporary GitHub Actions workflow that runs exactly that command on Node 22, capture the run result, then delete the workflow before final diff review.

Expected: 0 failures.

- [ ] **Step 2: Create the validation record before deployment**

Create `docs/validation/2026-09-02-monthly-receipt-separation-validation.md` with these headings and update checkboxes during execution:

```md
# Monthly Receipt Separation Validation

Date: 2026-09-02
Branch: `feat/separate-payment-receipts`
Environment: Supabase DEV `lulvvkrrysfmiqtefwnf`

## Automated gates
- [ ] payment-receipt monthly/tenant tests
- [ ] delegation client tests
- [ ] lifecycle partial-success/repair tests
- [ ] frontend repair tests
- [ ] full Node suite

## DEV Edge Functions
- [ ] payment-receipt deployed with verify_jwt=true
- [ ] payment-lifecycle deployed with verify_jwt=true

## Manual DEV flow
- [ ] monthly payment records payment_event
- [ ] active monthly receipt uses same academy_id
- [ ] PDF is generated through payment-receipt
- [ ] payment confirmation behavior remains correct
- [ ] receipt document is sent only when PDF exists
- [ ] registration flow remains unchanged

## Repair flow
- [ ] active monthly receipt with null storage_path shows Gerar PDF
- [ ] repair preserves receipt id
- [ ] repair preserves payment_event
- [ ] repair restores storage_path
- [ ] repair does not duplicate payment confirmation
- [ ] repair does not duplicate receipt document

## Final gate
- [ ] preview manually approved
- [ ] branch diff reviewed
- [ ] explicit merge approval received
```

- [ ] **Step 3: Deploy DEV functions in dependency order**

Deploy `payment-receipt` first using exact branch files:

- `supabase/functions/payment-receipt/index.ts`
- `supabase/functions/_shared/receipt.ts`

Then deploy `payment-lifecycle` using exact branch files:

- `supabase/functions/payment-lifecycle/index.ts`
- `supabase/functions/_shared/payment-lifecycle.ts`
- `supabase/functions/_shared/automation-settings.ts`
- `supabase/functions/_shared/whatsapp.ts`
- `supabase/functions/_shared/receipt.ts`
- `supabase/functions/_shared/monthly-receipt-delegation.mjs`

For both deployments, set `verify_jwt=true`.

After each deploy, list DEV Edge Functions and record version, status, and JWT setting in the validation document.

- [ ] **Step 4: Publish an isolated DEV preview without contaminating the feature branch**

Create/update `test/monthly-receipt-separation-preview` from the feature head. On that preview branch only, replace production Supabase config in `app/js/core/supabase-config.js` with:

```js
const SUPABASE_CONFIG = {
    url: 'https://lulvvkrrysfmiqtefwnf.supabase.co',
    publishableKey: 'sb_publishable_ePxmJIkapB3AFctwbvrs2A_fe2DwoOk'
};
```

Do not merge or cherry-pick this config commit back into `feat/separate-payment-receipts`.

Wait for Vercel preview state `READY` and use that deployment for manual validation.

- [ ] **Step 5: Validate one complete monthly flow in the preview**

Using a DEV academy account:

1. mark a previously unpaid monthly installment paid;
2. confirm the UI reports successful payment;
3. confirm the receipt history shows `Visualizar`, not `PDF pendente`;
4. open the PDF and verify academy name/responsible/contact;
5. confirm the payment confirmation/receipt-document WhatsApp states match consent/settings.

Then query DEV:

```sql
select id, academy_id, student_id, person, kind, installment, amount, created_at
from public.payment_events
where kind = 'monthly'
order by created_at desc
limit 5;

select id, academy_id, student_id, person, kind, installment, status, storage_path, created_at
from public.receipts
where kind = 'monthly'
order by created_at desc
limit 5;
```

Record the newest payment-event ID and receipt ID in the validation doc and confirm their `academy_id` values match.

- [ ] **Step 6: Exercise the explicit repair path safely in DEV**

For the single receipt created in Step 5, set only its `storage_path` to null in DEV. Do not delete the receipt, payment event, or Storage object:

```sql
with target as (
  select id
  from public.receipts
  where kind = 'monthly' and status = 'active'
  order by created_at desc
  limit 1
)
update public.receipts r
set storage_path = null
from target
where r.id = target.id
returning r.id, r.student_id, r.academy_id, r.storage_path;
```

Refresh the preview. Expected: that row shows **Gerar PDF**.

Click **Gerar PDF** once. Expected:

- button disables while pending;
- same receipt row becomes `Visualizar`;
- same receipt ID remains;
- same payment event remains;
- `storage_path` is restored;
- no new active receipt is created.

Verify with:

```sql
select student_id, person, installment, count(*) as active_receipts
from public.receipts
where kind = 'monthly' and status = 'active'
group by student_id, person, installment
having count(*) > 1;
```

Expected: zero rows.

Check automation duplicates for the repaired receipt:

```sql
select receipt_id, automation_type, idempotency_key, count(*) as copies
from public.automation_messages
where receipt_id is not null
  and automation_type in ('payment_confirmation', 'receipt_document')
group by receipt_id, automation_type, idempotency_key
having count(*) > 1;
```

Expected: zero rows.

- [ ] **Step 7: Run registration regression manually**

Mark/unmark an enrollment/registration payment in DEV and confirm its behavior remains exactly as before this branch: payment state, receipt PDF creation, receipt history, and existing WhatsApp behavior.

No registration request should depend on the monthly-only `payment-receipt` worker.

- [ ] **Step 8: Commit validation evidence only after results are known**

Update the validation document with actual versions, test counts, deployment IDs/URLs, observed row IDs, and pass/fail state. Do not mark checks that were not actually performed.

```bash
git add docs/validation/2026-09-02-monthly-receipt-separation-validation.md
git commit -m "docs: record monthly receipt separation validation"
```

---

### Task 6: Final branch gate and production handoff

**Files:**
- Review only: all branch changes against `main`.
- No production mutation before explicit approval.

**Interfaces:**
- Final feature branch must contain production Supabase config, not DEV preview config.
- Temporary GitHub Actions workflows must be absent.
- `test/monthly-receipt-separation-preview` is never merged.

- [ ] **Step 1: Run one final full suite on the exact final feature head**

```bash
node --test app/js/tests/*.test.js app/js/tests/*.test.mjs
```

Record exact pass/fail count and commit SHA in the validation document if the document changed after Task 5.

- [ ] **Step 2: Review the final diff against `main`**

Expected feature scope only:

- modernized monthly-only `payment-receipt`;
- monthly delegation helper;
- `payment-lifecycle` monthly delegation/repair/partial-success changes;
- payment feedback and receipt repair UI;
- tests;
- spec/plan/validation docs.

Reject/remove:

- DEV Supabase config;
- temporary CI workflow;
- unrelated refactors;
- schema changes;
- registration behavior changes.

- [ ] **Step 3: Stop and request explicit user approval to merge**

Do **not** merge automatically. Report:

- final test count;
- DEV function versions/status;
- preview result;
- monthly normal-flow result;
- repair result;
- registration regression result;
- final diff scope.

Wait for explicit approval.

- [ ] **Step 4: After approval, merge to `main` through a PR with expected head SHA**

Create PR from `feat/separate-payment-receipts` to `main`. Re-check mergeability/head SHA immediately before merge. Merge only the reviewed head.

- [ ] **Step 5: Verify the `main` Vercel deployment before production Edge Function rollout**

Wait until the deployment tied to the merge commit is `READY`.

- [ ] **Step 6: Deploy production Edge Functions in safe order**

Production Supabase project: `gswcruzlvkcoclbcrjvp`.

1. Deploy `payment-receipt` with `verify_jwt=true` using exact merged-main files.
2. Confirm it is `ACTIVE` and record version/hash.
3. Deploy `payment-lifecycle` with `verify_jwt=true` using exact merged-main files and all shared dependencies.
4. Confirm it is `ACTIVE` and record version/hash.

Do not modify any other Edge Function.

- [ ] **Step 7: Perform post-deploy smoke verification**

Confirm:

- frontend production deployment still responds;
- both functions are `ACTIVE` with JWT verification enabled;
- production payment/receipt row counts do not unexpectedly change merely from deploy;
- no automated data migration occurred;
- one real monthly payment can be tested only when the user is ready to perform that production action.

If a live production payment test is not performed, state that explicitly rather than claiming end-to-end production verification.
