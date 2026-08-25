# Etapa 5 — Automação e WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar automações multiacademia com WhatsApp Cloud API oficial da Meta, consentimento individual, lembretes baseados no início da turma, recibos PDF automáticos e estornos auditáveis.

**Architecture:** O frontend permanece estático em `app/`, enquanto dados e segurança ficam no Supabase. Edge Functions TypeScript executam integrações com a Meta, geração/entrega de recibos e processamento de lembretes; Supabase Cron invoca o processador de lembretes periodicamente. Tokens da Meta ficam somente em secrets server-side.

**Tech Stack:** HTML5, CSS3, JavaScript, Supabase PostgreSQL/RLS, Supabase Storage, Supabase Edge Functions (TypeScript/Deno), Supabase Cron, WhatsApp Cloud API (Meta), PDF generation server-side.

**Spec:** `docs/superpowers/specs/2026-08-24-automation-whatsapp-design.md`

## Global Constraints

- Um único número oficial da Dassaevy Labs envia mensagens para todas as academias.
- A academia controla seus próprios dados de identidade/contato, mas não edita templates.
- Telefone é opcional por pessoa.
- Consentimento WhatsApp é opcional, individual e `false` por padrão.
- Sem telefone ou sem consentimento, nenhuma automação WhatsApp é enviada.
- Vencimentos derivam exclusivamente da data de início da turma.
- Cadência fixa: D-3, D0 e D+3 se ainda pendente.
- Pagamento recebido sempre gera recibo, mesmo sem WhatsApp.
- Estorno nunca apaga recibo já emitido.
- Tokens/secrets da Meta nunca entram em `app/` ou no GitHub.
- Falha de envio não desfaz pagamento nem bloqueia o sistema.

---

### Task 1: Perfil da academia e dados de contato do aluno

**Files:**
- Modify: `app/database/supabase-schema.sql`
- Modify: `app/index.html`
- Modify: `app/js/core/script.js`
- Create: `app/js/features/academy-settings.js`
- Create: `app/js/tests/automation-data.test.js`

**Interfaces:**
- Produces: `academy_profiles` (one row per authenticated user), person phone/consent fields persisted in `students`.
- Consumes: existing authenticated user, existing `students` and class CRUD.

- [ ] **Step 1: Write failing tests for phone/consent normalization**

Create `app/js/tests/automation-data.test.js` asserting that empty phone remains `null`, consent without phone resolves to disabled for sending, and valid phone is normalized to E.164-compatible digits while retaining Brazil country code rules.

- [ ] **Step 2: Run the test and verify RED**

Run: `node app/js/tests/automation-data.test.js`
Expected: FAIL because the normalization helpers do not exist yet.

- [ ] **Step 3: Add database columns/tables with RLS**

Add migration-safe SQL for:

```sql
create table if not exists public.academy_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  academy_name text not null default '',
  responsible_name text not null default '',
  support_phone text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.students add column if not exists person1_phone text;
alter table public.students add column if not exists person2_phone text;
alter table public.students add column if not exists person1_whatsapp_consent boolean not null default false;
alter table public.students add column if not exists person2_whatsapp_consent boolean not null default false;
alter table public.students add column if not exists person1_whatsapp_consent_at timestamptz;
alter table public.students add column if not exists person2_whatsapp_consent_at timestamptz;
```

Add RLS so each user can only read/write their own academy profile and existing student ownership rules remain intact.

- [ ] **Step 4: Implement frontend normalization and persistence**

Add helpers in `script.js` to normalize phone values, write phone/consent values into student payloads, and map them back from Supabase. Consent timestamp is written only when consent changes from false to true and cleared on revocation.

- [ ] **Step 5: Add UI fields for each person**

In each person block add optional phone input and consent checkbox with copy explaining authorization for reminders, confirmations and receipts. No required attribute on phone or consent.

- [ ] **Step 6: Add academy settings feature**

`academy-settings.js` loads/saves academy name, responsible name, support phone and display name. Add a settings button/modal to `index.html`.

- [ ] **Step 7: Run tests and verify GREEN**

Run: `node app/js/tests/automation-data.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/database/supabase-schema.sql app/index.html app/js/core/script.js app/js/features/academy-settings.js app/js/tests/automation-data.test.js
git commit -m "feat: add academy profile and whatsapp consent"
```

### Task 2: Recibos e auditoria de pagamentos

**Files:**
- Modify: `app/database/supabase-schema.sql`
- Modify: `app/js/features/reports.js`
- Modify: `app/js/features/financial-details.js`
- Create: `app/js/features/receipts.js`
- Create: `app/js/tests/receipts.test.js`

**Interfaces:**
- Produces: `receipts`, immutable receipt number, status `active|voided`, storage path, payment linkage.
- Consumes: existing `payment_events`, student/person/installment data.

- [ ] **Step 1: Write failing receipt identity/state tests**

Test deterministic receipt labels, immutable receipt identifiers and transition `active -> voided` without deletion.

- [ ] **Step 2: Verify RED**

Run: `node app/js/tests/receipts.test.js`
Expected: FAIL because receipt helpers do not exist.

- [ ] **Step 3: Add receipt tables and RLS**

Create `receipts` with `id`, `user_id`, `student_id`, `class_id`, `person`, `kind`, `installment`, `amount`, `paid_at`, `receipt_number`, `status`, `storage_path`, `voided_at`, `created_at`. Enforce unique payment identity where appropriate and RLS by `user_id`.

- [ ] **Step 4: Add receipt lifecycle helpers**

`receipts.js` provides label/state functions and frontend querying for history. Actual PDF bytes are generated server-side in Task 3.

- [ ] **Step 5: Integrate financial UI**

Show receipt status and “Visualizar recibo” only when a storage path exists. Voided receipts remain visible and labeled “Estornado”.

- [ ] **Step 6: Verify GREEN**

Run: `node app/js/tests/receipts.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/database/supabase-schema.sql app/js/features/reports.js app/js/features/financial-details.js app/js/features/receipts.js app/js/tests/receipts.test.js
git commit -m "feat: add auditable receipt lifecycle"
```

### Task 3: Edge Function de recibo PDF

**Files:**
- Create: `supabase/functions/_shared/receipt.ts`
- Create: `supabase/functions/payment-receipt/index.ts`
- Create: `supabase/functions/_shared/receipt.test.ts`
- Modify: `app/database/supabase-schema.sql`

**Interfaces:**
- Consumes: authenticated payment/receipt identity and academy profile.
- Produces: private PDF object in Supabase Storage and `receipts.storage_path`.

- [ ] **Step 1: Write failing tests for receipt document model**

Test that the document model contains academy, student, class, payment description, value, timestamp, responsible contact and footer `Gerado por Dassaevy Labs`.

- [ ] **Step 2: Verify RED**

Run with Deno test for `_shared/receipt.test.ts`.
Expected: FAIL because builder is absent.

- [ ] **Step 3: Add private receipt bucket policy/reference SQL**

Document/create a private `receipts` storage bucket and policies allowing only owner-scoped access, with service-role write from Edge Functions.

- [ ] **Step 4: Implement PDF generation Edge Function**

Validate caller/service context, load receipt + academy + student + class, generate PDF, upload to private storage path `{user_id}/{receipt_id}.pdf`, update `storage_path`, and return receipt metadata.

- [ ] **Step 5: Verify GREEN**

Run Deno tests for receipt builder and local function request test.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions app/database/supabase-schema.sql
git commit -m "feat: generate payment receipt pdfs"
```

### Task 4: WhatsApp Cloud API sender

**Files:**
- Create: `supabase/functions/_shared/whatsapp.ts`
- Create: `supabase/functions/send-whatsapp/index.ts`
- Create: `supabase/functions/_shared/whatsapp.test.ts`
- Modify: `app/database/supabase-schema.sql`

**Interfaces:**
- Requires secrets: Meta access token, phone-number ID, Graph API version/config.
- Produces: send result with provider message ID, status and sanitized error.

- [ ] **Step 1: Write failing payload tests**

Test template payloads for reminder, payment confirmation, receipt document and void notification. Assert phone/consent eligibility before payload generation.

- [ ] **Step 2: Verify RED**

Run Deno tests for `_shared/whatsapp.test.ts`.
Expected: FAIL because sender/payload builder is absent.

- [ ] **Step 3: Add automation log table**

Create `automation_messages` with owner, student/person/payment reference, automation type, planned/executed timestamps, provider ID, status and sanitized error. Add uniqueness key to prevent duplicate scheduled messages.

- [ ] **Step 4: Implement Meta sender wrapper**

Build server-side `sendTemplateMessage` and `sendDocumentMessage`; read secrets only via Edge Function environment, never return token, and sanitize provider errors before persistence.

- [ ] **Step 5: Implement `send-whatsapp` function**

Validate student phone + consent at execution time, load academy identity, call the approved Dassaevy Labs template and log `sent|failed|skipped`.

- [ ] **Step 6: Verify GREEN**

Run Deno tests with mocked HTTP transport (no live Meta call in unit tests).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions app/database/supabase-schema.sql
git commit -m "feat: add official whatsapp cloud sender"
```

### Task 5: Payment confirmation, PDF delivery and estorno

**Files:**
- Modify: `app/js/features/reports.js`
- Modify: `app/js/core/script.js`
- Create: `supabase/functions/payment-automation/index.ts`
- Create: `supabase/functions/payment-automation/payment-automation.test.ts`

**Interfaces:**
- Consumes: transition of payment from unpaid to paid or paid to unpaid.
- Produces: receipt creation/generation, optional WhatsApp delivery, or void event.

- [ ] **Step 1: Write failing transition tests**

Cover unpaid→paid, paid→unpaid, repeated same-state operation, no phone, and no consent.

- [ ] **Step 2: Verify RED**

Run Deno tests.
Expected: FAIL because orchestration is absent.

- [ ] **Step 3: Implement idempotent payment automation**

On paid: ensure one active receipt for payment identity, generate PDF, then send confirmation/document if eligible. On unpaid: void active receipt, preserve history and send cancellation template if eligible.

- [ ] **Step 4: Integrate current toggle flow**

After database update succeeds, invoke the payment automation function with only payment identity. The server re-reads authoritative data rather than trusting amount/profile data from browser.

- [ ] **Step 5: Verify GREEN and regression**

Run new Deno tests plus existing Node tests:

```bash
node app/js/tests/money-input.test.js
node app/js/tests/automation-data.test.js
node app/js/tests/receipts.test.js
```

- [ ] **Step 6: Commit**

```bash
git add app/js/core/script.js app/js/features/reports.js supabase/functions/payment-automation
git commit -m "feat: automate receipts and payment notifications"
```

### Task 6: Scheduled reminder engine

**Files:**
- Create: `supabase/functions/_shared/due-reminders.ts`
- Create: `supabase/functions/process-reminders/index.ts`
- Create: `supabase/functions/_shared/due-reminders.test.ts`
- Modify: `app/database/supabase-schema.sql`

**Interfaces:**
- Consumes: class `start_date`, payment state, phone/consent, academy profile.
- Produces: eligible D-3/D0/D+3 sends with unique idempotency keys.

- [ ] **Step 1: Write failing date eligibility tests**

Cover D-3, D0, D+3, paid installment, missing phone, revoked consent, month-end dates and no class start date.

- [ ] **Step 2: Verify RED**

Run Deno test.
Expected: FAIL because reminder engine is absent.

- [ ] **Step 3: Implement reminder eligibility**

Reuse the same month-clamped due-date semantics already used by the frontend. Only unpaid monthly installments are candidates; enrollment date is ignored.

- [ ] **Step 4: Implement process-reminders Edge Function**

Query candidate students/classes, evaluate each person/installment, insert a unique pending automation row before sending, invoke WhatsApp sender, then finalize status.

- [ ] **Step 5: Add Cron SQL**

Enable/document Supabase Cron and schedule the reminder processor at a stable daily time. Use Vault/secure invocation credentials rather than embedding privileged secrets in SQL source.

- [ ] **Step 6: Verify GREEN**

Run full Deno reminder tests and ensure duplicate invocation yields no second send record.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions app/database/supabase-schema.sql
git commit -m "feat: schedule fixed whatsapp payment reminders"
```

### Task 7: Automation status UI and documentation

**Files:**
- Modify: `app/index.html`
- Modify: `app/css/style.css`
- Create: `app/js/features/automation-status.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: `automation_messages`, `receipts`, academy profile.
- Produces: human-readable status without exposing provider secrets.

- [ ] **Step 1: Add status presentation**

Show WhatsApp eligibility (`Ativo`, `Sem autorização`, `Sem WhatsApp`) per person and latest receipt/send status in financial detail UI.

- [ ] **Step 2: Add academy configuration completeness warning**

If academy name/responsible/support contact are incomplete, show a non-blocking settings prompt; student CRUD remains usable.

- [ ] **Step 3: Update README**

Document new architecture, local requirements, Edge Functions, required secrets by name only (never values), Meta template setup, Supabase Cron and testing commands.

- [ ] **Step 4: Run full verification**

Run all Node tests and Deno tests. Validate no source file contains a real Meta token. Confirm `app/` remains deployable and static frontend references still resolve.

- [ ] **Step 5: Commit**

```bash
git add app README.md
git commit -m "docs: expose and document automation status"
```

## Final verification checklist

- [ ] Existing login, students, finance, reports and due dates still work.
- [ ] Student can be saved with no phone.
- [ ] Phone alone sends nothing.
- [ ] Consent revocation stops future sends.
- [ ] Payment creates a receipt even when WhatsApp is ineligible.
- [ ] Receipt PDF uses academy identity and Dassaevy Labs footer.
- [ ] Estorno preserves receipt and audit trail.
- [ ] Reminder dates are based on class start date only.
- [ ] D-3/D0/D+3 are idempotent.
- [ ] Meta secrets exist only in Supabase environment.
- [ ] RLS isolates every academy.
- [ ] Failed WhatsApp send never rolls back a payment.
