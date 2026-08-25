# Automation Control Center Design

## Goal

Close the pre-Meta automation work by adding an academy-facing control center, configurable automation toggles, friendly delivery history, safe manual resend, and a repeatable pre-Meta validation flow without changing the existing financial rules.

## Context

The project already has:

- optional phone and individual WhatsApp consent per student;
- academy profile data;
- auditable receipts and private PDF storage;
- `send-whatsapp`, `whatsapp-webhook`, `process-reminders`, and `payment-lifecycle` Edge Functions;
- `automation_messages` as the technical delivery log;
- D-3 / D0 / D+3 reminder rules derived only from `classes.start_date`;
- payment confirmation, receipt PDF generation, and voiding logic.

The remaining pre-Meta work should improve operability without changing the core payment model.

## Product Design

### 1. Automation Control Center

Add a new `Automações` tab to the authenticated app.

The page must show:

- integration status card: `Aguardando Meta`, `Configurado`, or `Erro de configuração`;
- summary counters for messages sent, delivered, read, failed, and skipped;
- academy automation settings;
- recent automation activity;
- a pre-Meta readiness checklist.

The page must not expose secrets, tokens, phone-number IDs, app secrets, or raw provider payloads.

### 2. Academy Automation Settings

Create one settings row per academy account in a new table named `automation_settings`.

Fields:

- `user_id uuid primary key references auth.users(id)`;
- `reminders_enabled boolean not null default true`;
- `payment_confirmation_enabled boolean not null default true`;
- `receipt_delivery_enabled boolean not null default true`;
- `void_notification_enabled boolean not null default true`;
- `updated_at timestamptz not null default now()`.

Rules:

- settings belong to the authenticated academy;
- the academy may enable or disable whole automation categories;
- D-3 / D0 / D+3 timing remains fixed by Dassaevy Labs and is not customizable;
- student phone and consent remain independent eligibility requirements;
- disabling an automation must never affect payment registration, receipt generation, or financial totals.

### 3. Backend Enforcement

Automation settings must be enforced in the backend, not only hidden in the UI.

`process-reminders` must check `reminders_enabled` before generating candidates for an academy.

`payment-lifecycle` must always perform financial synchronization and receipt generation, then conditionally send:

- payment confirmation when `payment_confirmation_enabled = true`;
- PDF receipt when `receipt_delivery_enabled = true`;
- void notification when `void_notification_enabled = true`.

If a category is disabled, create no outbound provider call for that category.

### 4. Friendly Activity History

Use `automation_messages` as the source of truth and expose a human-readable history in the new page.

Each row should display:

- student name;
- automation type translated to Portuguese;
- academy-visible status;
- date/time;
- short failure reason when present;
- resend action only when eligible.

Friendly statuses:

- `pending` → `Aguardando envio`;
- `sent` → `Enviado`;
- `delivered` → `Entregue`;
- `read` → `Lido`;
- `failed` → `Falhou`;
- `skipped` → `Não enviado`.

Do not expose raw Meta errors if they contain provider internals. Continue using sanitized `error_message` only.

### 5. Manual Resend

Add a JWT-protected Edge Function `retry-automation-message`.

Supported source message types:

- `payment_confirmation`;
- `receipt_document`;
- `payment_voided`.

Reminder messages are not manually resent from the UI because their timing is lifecycle-driven; future scheduled processing remains the source of truth for reminders.

Resend rules:

- only the owner academy may request the resend;
- student must still exist;
- phone and consent must still be valid;
- related receipt must still exist when required;
- a resend creates a new `automation_messages` row rather than mutating the historical source row;
- resend idempotency key must include the original message ID plus a generated retry identity so double-clicks cannot create duplicate provider calls;
- the original failed or prior message record remains immutable history.

The resend function should reuse the same shared WhatsApp payload helpers and sanitized error handling already used by `send-whatsapp` and `payment-lifecycle`.

### 6. Duplicate Protection Review

Keep the existing unique index on `(user_id, idempotency_key)` for non-null keys.

Ensure these identities remain unique:

- reminders: student + person + installment + reminder type + due date;
- payment confirmation: receipt ID + confirmation;
- receipt document: receipt ID + document;
- void notification: receipt ID + voided;
- manual resend: source automation message ID + retry request identity.

Payment toggling must remain idempotent: a paid state with an active receipt keeps the existing receipt; an unpaid state with an active receipt voids it; repeated lifecycle processing does not create another active receipt.

### 7. Pre-Meta Readiness Check

The control center should show a deterministic checklist based on application data, not on Meta secrets visible to the browser.

Checks:

- academy profile has `academy_name`;
- academy profile has `responsible_name`;
- academy profile has `support_phone`;
- at least one student can be registered with and without WhatsApp without errors;
- receipts bucket/functionality is available from prior tested flow;
- automation settings row exists;
- there are no duplicate active receipts for the same payment identity.

Meta credential readiness remains represented only as `Aguardando conexão com a Meta` until the external integration is completed. The frontend must not query or reveal Supabase secrets.

### 8. Test Strategy

Use TDD for backend settings and retry behavior.

Required automated coverage:

- automation settings default to enabled;
- reminders are skipped when academy reminders are disabled;
- payment confirmation can be disabled while receipt creation still occurs;
- receipt delivery can be disabled independently;
- void notification can be disabled independently;
- manual resend rejects another academy's message;
- manual resend rejects missing consent or phone;
- manual resend keeps the original log unchanged and creates a new log;
- retry idempotency prevents a double-click duplicate;
- friendly status mapping is deterministic.

Required manual validation before Meta:

1. Create/update academy profile.
2. Register a student without phone and confirm normal financial behavior.
3. Register a student with phone but without consent and confirm no outbound automation eligibility.
4. Register a student with phone and consent.
5. Toggle each automation category off/on and confirm core payment/receipt behavior is unaffected.
6. Mark a payment paid and verify receipt history.
7. Void the same payment and verify receipt remains as voided.
8. Review automation activity and friendly statuses.
9. Trigger a simulated failed record path and verify resend eligibility rules without requiring Meta credentials.

## Files Expected to Change

- `app/index.html` — add Automations tab/view container.
- `app/js/core/supabase-config.js` — load the control-center feature.
- `app/js/features/automation-center.js` — page rendering, settings interaction, activity history, readiness checks, resend UI.
- `supabase/migrations/<timestamp>_automation_settings.sql` — settings table, RLS, grants.
- `supabase/functions/process-reminders/index.ts` — enforce reminders setting.
- `supabase/functions/payment-lifecycle/index.ts` — enforce confirmation/receipt/void settings while preserving receipt lifecycle.
- `supabase/functions/retry-automation-message/index.ts` — authenticated manual resend endpoint.
- `supabase/functions/_shared/automation-settings.ts` — pure policy helpers.
- `supabase/functions/_shared/automation-settings.test.ts` — policy tests.
- `supabase/functions/_shared/retry-policy.ts` — resend eligibility/idempotency helpers.
- `supabase/functions/_shared/retry-policy.test.ts` — retry tests.

## Non-Goals

This phase does not:

- configure or store Meta credentials;
- create or approve Meta message templates;
- activate the production Cron;
- allow academies to edit D-3 / D0 / D+3 timing;
- add email/SMS delivery channels;
- change financial values, payment due-date rules, or receipt audit semantics.

## Acceptance Criteria

The pre-Meta phase is accepted when an academy can see and control automation categories, review human-readable automation history, safely retry supported failed transactional messages, and complete the readiness checklist, while all financial and receipt behavior continues to work independently of WhatsApp availability.