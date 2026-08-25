# Automation Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pre-Meta automation control center with per-academy toggles, friendly delivery history, safe manual resend, and readiness checks while preserving existing financial and receipt behavior.

**Architecture:** Keep Supabase as the source of truth for automation policy and delivery history. The browser only renders academy-visible controls and status; all enable/disable enforcement and resend authorization live in Edge Functions. Existing `automation_messages`, receipt lifecycle, WhatsApp helpers, and reminder engine are reused rather than duplicated.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Supabase Postgres + RLS, Supabase Edge Functions (Deno/TypeScript), existing WhatsApp Cloud API helpers, existing receipt PDF/storage flow.

**Spec:** `docs/superpowers/specs/2026-08-25-automation-control-center-design.md`

## Global Constraints

- D-3 / D0 / D+3 timing remains fixed by Dassaevy Labs and is not academy-customizable.
- Student WhatsApp phone remains optional.
- Student WhatsApp consent remains required for outbound WhatsApp eligibility.
- Disabling an automation must never affect payment registration, receipt generation, receipt history, or financial totals.
- The frontend must never read, render, or infer Meta secrets.
- Existing `automation_messages` remains the delivery-history source of truth.
- Existing receipt audit semantics remain unchanged.
- All backend ownership checks must use the authenticated academy user.
- All new behavior is implemented on `feature/automation-whatsapp`, not `main`.

---

### Task 1: Per-academy automation settings

**Files:**
- Create: `supabase/migrations/20260825123000_automation_settings.sql`
- Create: `supabase/functions/_shared/automation-settings.ts`
- Create: `supabase/functions/_shared/automation-settings.test.ts`

**Interfaces:**
- Consumes: authenticated academy `user_id`.
- Produces: `AutomationSettings`, `DEFAULT_AUTOMATION_SETTINGS`, `normalizeAutomationSettings(row)`, and `isAutomationEnabled(settings, category)`.

- [ ] **Step 1: Write failing policy tests**

```ts
import { assertEquals } from "jsr:@std/assert";
import { DEFAULT_AUTOMATION_SETTINGS, normalizeAutomationSettings, isAutomationEnabled } from "./automation-settings.ts";

Deno.test("defaults all academy automations to enabled", () => {
  assertEquals(DEFAULT_AUTOMATION_SETTINGS, {
    reminders_enabled: true,
    payment_confirmation_enabled: true,
    receipt_delivery_enabled: true,
    void_notification_enabled: true,
  });
});

Deno.test("normalizes a partial settings row", () => {
  assertEquals(normalizeAutomationSettings({ reminders_enabled: false }), {
    reminders_enabled: false,
    payment_confirmation_enabled: true,
    receipt_delivery_enabled: true,
    void_notification_enabled: true,
  });
});

Deno.test("maps categories to the correct toggle", () => {
  const settings = normalizeAutomationSettings({ receipt_delivery_enabled: false });
  assertEquals(isAutomationEnabled(settings, "receipt_document"), false);
  assertEquals(isAutomationEnabled(settings, "payment_confirmation"), true);
});
```

- [ ] **Step 2: Run test and verify RED**

Run:
```bash
deno test supabase/functions/_shared/automation-settings.test.ts
```
Expected: FAIL because `automation-settings.ts` does not exist.

- [ ] **Step 3: Implement the shared policy helper**

```ts
export type AutomationSettings = {
  reminders_enabled: boolean;
  payment_confirmation_enabled: boolean;
  receipt_delivery_enabled: boolean;
  void_notification_enabled: boolean;
};

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  reminders_enabled: true,
  payment_confirmation_enabled: true,
  receipt_delivery_enabled: true,
  void_notification_enabled: true,
};

export function normalizeAutomationSettings(row: Partial<AutomationSettings> | null | undefined): AutomationSettings {
  return {
    reminders_enabled: row?.reminders_enabled ?? true,
    payment_confirmation_enabled: row?.payment_confirmation_enabled ?? true,
    receipt_delivery_enabled: row?.receipt_delivery_enabled ?? true,
    void_notification_enabled: row?.void_notification_enabled ?? true,
  };
}

export function isAutomationEnabled(settings: AutomationSettings, category: string): boolean {
  if (["reminder_before_due", "due_today", "overdue"].includes(category)) return settings.reminders_enabled;
  if (category === "payment_confirmation") return settings.payment_confirmation_enabled;
  if (category === "receipt_document") return settings.receipt_delivery_enabled;
  if (category === "payment_voided") return settings.void_notification_enabled;
  return false;
}
```

- [ ] **Step 4: Add the database migration**

```sql
create table if not exists public.automation_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminders_enabled boolean not null default true,
  payment_confirmation_enabled boolean not null default true,
  receipt_delivery_enabled boolean not null default true,
  void_notification_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.automation_settings enable row level security;

drop policy if exists "Users manage own automation settings" on public.automation_settings;
create policy "Users manage own automation settings" on public.automation_settings
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.automation_settings to authenticated;

create or replace function public.touch_automation_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_automation_settings_updated_at on public.automation_settings;
create trigger touch_automation_settings_updated_at
before update on public.automation_settings
for each row execute function public.touch_automation_settings_updated_at();
```

- [ ] **Step 5: Run tests and apply migration**

Run:
```bash
deno test supabase/functions/_shared/automation-settings.test.ts
```
Expected: PASS.

Apply migration to the connected Supabase project and verify the table exists with RLS enabled.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260825123000_automation_settings.sql supabase/functions/_shared/automation-settings.ts supabase/functions/_shared/automation-settings.test.ts
git commit -m "feat: add academy automation settings"
```

---

### Task 2: Enforce settings in reminder and payment backends

**Files:**
- Modify: `supabase/functions/process-reminders/index.ts`
- Modify: `supabase/functions/payment-lifecycle/index.ts`
- Test: `supabase/functions/_shared/automation-settings.test.ts`

**Interfaces:**
- Consumes: `normalizeAutomationSettings`, `isAutomationEnabled` from Task 1.
- Produces: backend enforcement that cannot be bypassed by UI manipulation.

- [ ] **Step 1: Extend failing tests for independent categories**

```ts
Deno.test("receipt delivery can be disabled without disabling payment confirmation", () => {
  const settings = normalizeAutomationSettings({ receipt_delivery_enabled: false });
  assertEquals(isAutomationEnabled(settings, "payment_confirmation"), true);
  assertEquals(isAutomationEnabled(settings, "receipt_document"), false);
});

Deno.test("void notification can be disabled independently", () => {
  const settings = normalizeAutomationSettings({ void_notification_enabled: false });
  assertEquals(isAutomationEnabled(settings, "payment_voided"), false);
  assertEquals(isAutomationEnabled(settings, "payment_confirmation"), true);
});
```

- [ ] **Step 2: Run tests and verify expected result**

Run:
```bash
deno test supabase/functions/_shared/automation-settings.test.ts
```
Expected: PASS only if mapping is complete; otherwise update helper minimally.

- [ ] **Step 3: Enforce `reminders_enabled` in `process-reminders`**

Load `automation_settings` alongside classes/students/academy profiles, normalize missing rows to defaults, and skip candidate generation for an academy when `reminders_enabled === false`.

Required behavior:
```ts
const settings = normalizeAutomationSettings(settingsByUser.get(student.user_id));
if (!settings.reminders_enabled) continue;
```

- [ ] **Step 4: Enforce transactional categories in `payment-lifecycle`**

Always keep financial synchronization, receipt creation, storage upload, and voiding unchanged.

Condition only outbound calls:
```ts
if (action === "create" && eligible && metaReady) {
  if (settings.payment_confirmation_enabled) { /* send confirmation */ }
  if (settings.receipt_delivery_enabled) { /* send PDF */ }
}

if (action === "void" && eligible && metaReady && settings.void_notification_enabled) {
  /* send void template */
}
```

- [ ] **Step 5: Deploy both Edge Functions**

Deploy `process-reminders` and `payment-lifecycle` with their current authentication mode preserved.

- [ ] **Step 6: Verify receipt behavior with automation disabled**

Manual verification:
1. Disable payment confirmation and receipt delivery in DB for the test academy.
2. Mark one pending payment as paid.
3. Verify `payment_events` exists.
4. Verify an active `receipts` row exists and PDF `storage_path` is populated.
5. Verify no new outbound provider log is created for the disabled categories.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/process-reminders/index.ts supabase/functions/payment-lifecycle/index.ts
git commit -m "feat: enforce academy automation preferences"
```

---

### Task 3: Manual resend policy and endpoint

**Files:**
- Create: `supabase/functions/_shared/retry-policy.ts`
- Create: `supabase/functions/_shared/retry-policy.test.ts`
- Create: `supabase/functions/retry-automation-message/index.ts`

**Interfaces:**
- Consumes: `automation_messages`, student phone/consent, receipt data, WhatsApp shared payload helpers.
- Produces: `canRetryAutomationType(type)`, `buildRetryIdempotencyKey(sourceMessageId, requestId)`, JWT-protected `retry-automation-message` endpoint.

- [ ] **Step 1: Write failing retry policy tests**

```ts
import { assertEquals } from "jsr:@std/assert";
import { canRetryAutomationType, buildRetryIdempotencyKey } from "./retry-policy.ts";

Deno.test("only transactional message types are retryable", () => {
  assertEquals(canRetryAutomationType("payment_confirmation"), true);
  assertEquals(canRetryAutomationType("receipt_document"), true);
  assertEquals(canRetryAutomationType("payment_voided"), true);
  assertEquals(canRetryAutomationType("overdue"), false);
});

Deno.test("retry identity changes by request id", () => {
  assertEquals(
    buildRetryIdempotencyKey("msg-1", "req-1"),
    "retry:msg-1:req-1",
  );
});
```

- [ ] **Step 2: Run test and verify RED**

Run:
```bash
deno test supabase/functions/_shared/retry-policy.test.ts
```
Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement retry policy helper**

```ts
const RETRYABLE = new Set(["payment_confirmation", "receipt_document", "payment_voided"]);

export function canRetryAutomationType(type: string): boolean {
  return RETRYABLE.has(type);
}

export function buildRetryIdempotencyKey(sourceMessageId: string, requestId: string): string {
  return `retry:${sourceMessageId}:${requestId}`;
}
```

- [ ] **Step 4: Implement authenticated resend endpoint**

Endpoint contract:
```json
{
  "source_message_id": "uuid",
  "request_id": "uuid-or-random-client-id"
}
```

Validation order:
1. authenticate JWT;
2. load source `automation_messages` row;
3. verify `source.user_id === auth.uid()`;
4. verify source type is retryable;
5. load student and verify ownership;
6. verify current phone + consent;
7. when `receipt_document`, require related receipt + storage path;
8. build a fresh payload from current data;
9. insert a new log row with `idempotency_key = retry:<source>:<request>`;
10. send through existing Meta helper when credentials exist;
11. update only the new log row;
12. never mutate the source row.

- [ ] **Step 5: Add authorization/eligibility tests around pure policy**

Add helper functions if necessary for deterministic tests, including:
```ts
export function retryEligibility({ ownerMatches, hasPhone, hasConsent, type, hasRequiredReceipt }) {
  if (!ownerMatches) return "forbidden";
  if (!canRetryAutomationType(type)) return "unsupported";
  if (!hasPhone) return "missing_phone";
  if (!hasConsent) return "missing_consent";
  if (type === "receipt_document" && !hasRequiredReceipt) return "missing_receipt";
  return "eligible";
}
```

Test each branch.

- [ ] **Step 6: Run tests and deploy**

Run:
```bash
deno test supabase/functions/_shared/retry-policy.test.ts
```
Expected: PASS.

Deploy `retry-automation-message` with `verify_jwt=true`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/retry-policy.ts supabase/functions/_shared/retry-policy.test.ts supabase/functions/retry-automation-message/index.ts
git commit -m "feat: add safe automation message retry"
```

---

### Task 4: Automation control center UI

**Files:**
- Modify: `app/index.html`
- Modify: `app/js/core/supabase-config.js`
- Create: `app/js/features/automation-center.js`

**Interfaces:**
- Consumes: `db`, authenticated user session, `automation_settings`, `automation_messages`, `academy_profiles`, `students`, `receipts`.
- Produces: `Automações` tab, toggles, summary counters, activity list, readiness checklist, retry button.

- [ ] **Step 1: Add deterministic UI mapping helpers first**

At the top of `automation-center.js`, define pure maps:
```js
const AUTOMATION_STATUS_LABELS = {
  pending: 'Aguardando envio',
  sent: 'Enviado',
  delivered: 'Entregue',
  read: 'Lido',
  failed: 'Falhou',
  skipped: 'Não enviado'
};

const AUTOMATION_TYPE_LABELS = {
  reminder_before_due: 'Lembrete antes do vencimento',
  due_today: 'Lembrete de vencimento',
  overdue: 'Lembrete de atraso',
  payment_confirmation: 'Confirmação de pagamento',
  receipt_document: 'Recibo em PDF',
  payment_voided: 'Aviso de estorno'
};
```

Expose pure helpers on `window.AutomationCenterTest` only in a harmless namespace so they can be tested in Node/JSDOM later if desired.

- [ ] **Step 2: Add the new navigation tab and view container**

Add `Automações` beside Alunos / Financeiro / Relatórios.

The view must contain:
- integration status card;
- five status counters;
- four toggle controls;
- activity table/list;
- readiness checklist.

- [ ] **Step 3: Load the feature from `supabase-config.js`**

After existing feature loading, append:
```js
const automationScript = document.createElement('script');
automationScript.src = './js/features/automation-center.js?v=1';
automationScript.dataset.automationCenter = 'true';
document.body.appendChild(automationScript);
```

Ensure it loads once and after `db` exists.

- [ ] **Step 4: Implement settings load/upsert**

Load current academy row. If missing, insert defaults using the authenticated `user_id`.

Each toggle updates only its own column and then refreshes the local state.

Do not expose due-day customization.

- [ ] **Step 5: Implement activity history**

Query recent `automation_messages` for the academy, join/resolve student names locally from `students`, and render only friendly status/type labels plus sanitized `error_message`.

Retry button eligibility:
```js
const retryable = ['payment_confirmation', 'receipt_document', 'payment_voided'].includes(row.automation_type);
const showRetry = retryable && ['failed', 'skipped'].includes(row.status);
```

- [ ] **Step 6: Implement manual resend UI**

On click, generate a random request ID:
```js
const requestId = crypto.randomUUID();
await db.functions.invoke('retry-automation-message', {
  body: { source_message_id: row.id, request_id: requestId }
});
```

Disable the button while awaiting the response to prevent accidental double-clicks; the backend idempotency remains the real protection.

- [ ] **Step 7: Implement readiness checklist**

Checklist checks only browser-visible application state:
- academy name present;
- responsible name present;
- support phone present;
- automation settings row exists;
- receipt history query succeeds;
- no duplicate active receipts by `(student_id, person, kind, installment)`.

Always show Meta line as:
`Aguardando conexão com a Meta` until external integration is completed.

- [ ] **Step 8: Manual UI verification**

Verify desktop + mobile widths:
1. tab switches without breaking existing views;
2. toggles persist after reload;
3. existing financial totals remain unchanged;
4. activity renders empty state cleanly;
5. failed transactional row shows retry action;
6. reminder row never shows retry action.

- [ ] **Step 9: Commit**

```bash
git add app/index.html app/js/core/supabase-config.js app/js/features/automation-center.js
git commit -m "feat: add automation control center"
```

---

### Task 5: Duplicate protection and pre-Meta verification

**Files:**
- Modify only if verification exposes a gap: relevant shared helper or Edge Function.
- Document result in: `docs/superpowers/plans/2026-08-25-automation-control-center.md` under a final execution note if desired.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: evidence that the pre-Meta flow is safe and ready for external credentials/templates.

- [ ] **Step 1: Run all shared backend tests fresh**

Run:
```bash
deno test supabase/functions/_shared/*.test.ts
```
Expected: all tests pass, zero failures.

- [ ] **Step 2: Verify database constraints**

Check:
```sql
select student_id, person, kind, installment, count(*)
from public.receipts
where status = 'active'
group by student_id, person, kind, installment
having count(*) > 1;
```
Expected: zero rows.

Check duplicated idempotency keys:
```sql
select user_id, idempotency_key, count(*)
from public.automation_messages
where idempotency_key is not null
group by user_id, idempotency_key
having count(*) > 1;
```
Expected: zero rows.

- [ ] **Step 3: Exercise payment lifecycle with categories disabled**

Use a test student and verify:
- payment creates/keeps a single active receipt;
- repeat processing does not create a second active receipt;
- disabling confirmation does not affect receipt creation;
- disabling receipt delivery does not affect PDF generation;
- disabling void notification does not affect receipt voiding.

- [ ] **Step 4: Exercise eligibility scenarios**

Verify:
- student with no phone remains fully usable financially;
- phone without consent never becomes outbound-eligible;
- phone + consent becomes eligible;
- changing consent off blocks later retry.

- [ ] **Step 5: Exercise retry idempotency without Meta credentials**

Invoke the retry endpoint twice with the same `source_message_id` + `request_id` and verify only one new retry log can exist for the same idempotency key. Because Meta credentials are intentionally absent, provider delivery may remain unavailable; the database identity behavior is what this test proves.

- [ ] **Step 6: Check Supabase security/performance advisors**

Review new RLS/table advisory output and fix any security issues introduced by this phase before completion.

- [ ] **Step 7: Verify deployed Edge Functions**

Confirm active functions and intended authentication:
- `payment-lifecycle`: JWT required;
- `send-whatsapp`: JWT required;
- `retry-automation-message`: JWT required;
- `whatsapp-webhook`: JWT disabled, signature-authenticated;
- `process-reminders`: JWT disabled, cron-secret-authenticated.

- [ ] **Step 8: Final commit for verification fixes only**

If verification required changes:
```bash
git add <changed-files>
git commit -m "fix: harden pre-meta automation flow"
```

If no fixes are needed, do not create an empty commit.

---

## Definition of Done

The phase is complete only when:

- academy automation settings exist with RLS and default enabled values;
- reminder/payment backends enforce those settings independently;
- disabling WhatsApp categories never affects financial/receipt state;
- automation control center renders settings, friendly history, counters, readiness state, and safe retry actions;
- transactional retry is owner-checked, consent-aware, receipt-aware, history-preserving, and idempotent;
- all backend tests pass fresh;
- duplicate active receipt and duplicate idempotency queries return zero rows;
- Supabase advisors show no newly introduced critical security issue;
- all intended Edge Functions are deployed with correct authentication modes;
- Meta credentials/templates/Cron activation remain the only external production steps left.
