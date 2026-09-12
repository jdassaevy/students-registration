# Students Registration — Canonical Security State Implementation Plan

Date: 2026-09-11
Status: approved and validated in Supabase dev
Scope: Phase 1 — tenant isolation, RLS/grants, Edge Function authorization, schema reconciliation

## Global Constraints

- Protect business data before pursuing schema cleanliness.
- Dev is the validation environment; production only receives exact changes that passed dev.
- Never copy production rows into dev.
- Prefer metadata and aggregate counts; do not inspect names, phones, payment details, or receipt contents for security verification.
- Any destructive DDL must have a preflight guard that aborts on unexpected data.
- Service-role code must re-establish user/academy authorization explicitly because service role bypasses RLS.
- Do not generate repeated GitHub/Vercel previews. Repository changes are published in one grouped branch commit after dev validation.
- All synthetic database tests must run inside a transaction and end in `ROLLBACK`.

## Canonical Files

Migrations:

1. `supabase/migrations/20260911203000_canonical_security_hardening.sql`
2. `supabase/migrations/20260911203500_allow_receipt_student_unlink_only.sql`
3. `supabase/migrations/20260911204000_automation_tenant_scope.sql`
4. `supabase/migrations/20260911205000_remove_legacy_schema.sql`
5. `supabase/migrations/20260911205500_archive_history_client_deny.sql`

Shared Edge helpers:

- `supabase/functions/_shared/tenant.ts`
- `supabase/functions/_shared/tenant-linkage.mjs`
- `supabase/functions/_shared/reminders.js`

Reconciled Edge Functions:

- `supabase/functions/send-whatsapp/index.ts`
- `supabase/functions/retry-automation-message/index.ts`
- `supabase/functions/payment-lifecycle/index.ts`
- `supabase/functions/process-reminders/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts` remains the canonical HMAC-authenticated implementation already versioned in main.
- `payment-receipt` remains unchanged because dev/prod already shared the reviewed implementation.

Repository tests:

- `app/js/tests/canonical-reference-schema.test.mjs`
- `app/js/tests/canonical-security-migrations.test.mjs`
- `app/js/tests/edge-function-tenant-contract.test.mjs`
- `app/js/tests/tenant-linkage.test.mjs`

Reference:

- `app/database/supabase-schema.sql`
- `docs/superpowers/specs/2026-09-11-security-canonical-state-design.md`

## Task 1 — Freeze Canonical Security Contracts

Create static/pure tests before implementation. Required assertions:

- tenant linkage accepts only complete/equal academy IDs;
- a receipt matches only the exact student and academy;
- canonical migrations remove legacy `academy_id IS NULL` RLS fallback;
- `anon` direct table grants are revoked;
- service-role Edge Functions use academy membership rather than historical `user_id` ownership alone;
- receipt delivery requires exact student/receipt linkage;
- reminder helper propagates `academyId` and rejects class/student tenant mismatch;
- canonical schema documents receipt preservation and omits retired legacy fields.

Expected TDD sequence: relevant tests fail before the corresponding migration/function exists, then turn green after the minimal implementation.

## Task 2 — Canonical RLS, Grants, RPCs

Implement `20260911203000_canonical_security_hardening.sql`.

Requirements:

- RLS enabled on application tables;
- classes/students/payment events/receipts use `is_academy_member(academy_id)` only;
- no legacy nullable-academy compatibility path;
- `anon` gets no application-table privileges;
- `authenticated` receives the minimum DML matrix required by the frontend;
- `delete_class_with_students` authorizes by active academy membership;
- helper functions have fixed `search_path` and intentional EXECUTE grants only.

Dev verification:

- zero legacy fallback policies;
- zero anon table grants;
- zero tenant rows missing `academy_id` in core tables;
- authenticated Academy A sees/updates/deletes zero Academy B rows.

## Task 3 — Tenant-Scope Automation History

Implement `20260911204000_automation_tenant_scope.sql`.

Preflight must prove every existing `automation_messages` row can resolve one academy from linked student/receipt and that both agree when both exist. Abort on unresolved or conflicting rows.

Then:

- add `academy_id`;
- backfill deterministically;
- set NOT NULL;
- FK to academies with `ON DELETE RESTRICT`;
- add index;
- replace user-only RLS with academy-membership SELECT policy;
- keep client grant at SELECT only.

Dev validation recorded during implementation: 10 total messages, 10 resolvable, zero unresolved, zero conflicting; post-migration all 10 retained with `academy_id` and zero cross-academy conflicts.

## Task 4 — Reconcile `send-whatsapp`

Use production/main behavior as the functional baseline and change authorization only where required.

Required flow:

1. validate bearer JWT;
2. load student including `academy_id`;
3. require active academy membership via `requireAcademyAccess`;
4. for `receipt_document`, load receipt and require `receiptMatchesStudent(receipt, student)` plus `storage_path`;
5. reject invalid receipt/student pairing before creating an automation log;
6. write `academy_id` to `automation_messages`;
7. keep consent, idempotency, provider error sanitization, and Meta payload behavior unchanged.

Deploy only to dev with `verify_jwt=true`. Do not send a real WhatsApp solely for testing.

## Task 5 — Reconcile Retry and Payment Lifecycle

### `retry-automation-message`

- source message carries `academy_id`;
- authenticate user and require membership in source academy;
- student must match source academy;
- receipt must match both exact student and academy;
- academy identity for templates comes from `academies`, not legacy `academy_profiles` ownership;
- retry log retains source `academy_id`;
- idempotency query is tenant-scoped.

### `payment-lifecycle`

Keep payment/receipt business behavior unchanged while adding tenant guards:

- authorize student academy membership first;
- reject existing payment/receipt/class tenant mismatch;
- scope payment DELETE and receipt UPDATE by `academy_id`;
- validate delegated monthly receipt still matches student/academy;
- write `academy_id` on every automation log;
- tenant-scope idempotency lookups.

Deploy both to dev with `verify_jwt=true`. Supabase Edge deployment is the compile/import gate because Deno is unavailable in the local runtime.

## Task 6 — Reconcile Reminder and Webhook Paths

### `process-reminders`

Keep `verify_jwt=false` only because the function checks `AUTOMATION_CRON_SECRET` / `x-cron-secret` before creating the service-role client.

- load `academy_id` for classes and students;
- reject class/student tenant mismatch;
- use `academies` by ID for academy identity;
- helper returns `academyId`;
- automation logs include `academy_id`;
- status updates include tenant condition where applicable.

Do not execute the cron just to test compilation; that could send real messages.

### `whatsapp-webhook`

Keep the versioned canonical behavior:

- GET verification uses `META_WEBHOOK_VERIFY_TOKEN`;
- POST requires `x-hub-signature-256` validated with HMAC SHA-256 and `META_APP_SECRET`;
- `verify_jwt=false` is intentional because Meta cannot provide a Supabase user JWT.

Pure Web Crypto verification must accept a valid signature and reject an invalid one.

## Task 7 — Preserve History, Remove Legacy Schema Safely

Implement `20260911205000_remove_legacy_schema.sql` plus `20260911205500_archive_history_client_deny.sql`.

### Archive amendment discovered during dev

Dev contained two non-null `students.archived_at` timestamps. Therefore the migration must not drop the column directly.

Canonical sequence:

1. create `student_archive_history(student_id, academy_id, archived_at)`;
2. require every archived row to have an academy;
3. copy only those three audit fields;
4. compare source and preserved counts;
5. abort on mismatch;
6. only then drop `students.archived_at`.

The audit table has RLS enabled, an explicit authenticated deny-all policy, and no `public`/`anon`/`authenticated` table grants.

### Other retired objects

- `financial_charges`: drop only if row count remains zero;
- `classes.installment_count`: drop only if every value is the legacy default `3`.

### Receipt unlink amendment discovered during rollback test

Canonical receipt FK is nullable `student_id` with `ON DELETE SET NULL`. A real rollback-only test exposed that the audit trigger blocked the FK transition.

Implement `20260911203500_allow_receipt_student_unlink_only.sql` so the trigger permits exactly:

`student_id: non-null UUID -> NULL`

and still rejects:

- UUID -> different UUID;
- NULL -> UUID (relink);
- changes to receipt number/person/kind/installment/amount/paid_at;
- reactivation of voided receipts.

Rollback test must prove student deletion preserves receipt with `student_id=NULL` and relinking that receipt is rejected.

## Task 8 — Full Dev Gate, Single Repository Publication, Production Rollout

### Dev gate

Required evidence before GitHub publication:

- all package tests green;
- Edge Functions ACTIVE with expected `verify_jwt` modes;
- no missing `academy_id` in core tenant tables or automation history;
- no cross-academy relationship conflicts;
- Academy A cannot read/update/delete Academy B resources;
- `delete_class_with_students` rollback test preserves receipts with `student_id` and `class_id` nulled;
- receipt unlink/relink rollback test passes;
- archive history count equals preserved source history;
- Supabase security advisors show only explicitly accepted warnings.

Validated dev aggregate state after canonicalization:

- classes: 5
- students: 6
- payment events: 8
- receipts: 10
- automation messages: 10
- archive history rows: 2
- missing tenant IDs: 0
- anon grants: 0
- legacy fallback policies: 0

Accepted advisors:

- authenticated access to the four intentional SECURITY DEFINER functions (`bootstrap_academy`, `delete_class_with_students`, `is_academy_member`, `is_academy_owner`);
- leaked-password protection remains disabled until separately approved because changing Auth policy can affect existing users.

### Repository source-of-truth checkpoint

Publish one grouped branch commit from the audited `main` SHA, rather than file-by-file commits. Branch:

`security/phase-1-hardening`

The grouped commit contains canonical migrations, Edge Function sources, tests, reference schema, spec, and this plan. Create the commit object before moving a branch ref so intermediate uploads do not trigger previews.

Open one PR to `main` to run repository CI. Expected CI includes Node 22 tests:

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Do not claim the full repository suite ran locally: the execution environment used a partial isolated snapshot. Local canonical package tests passed 13/13; full-suite confirmation comes from CI.

### Production preflight

Immediately before production migrations, read aggregate/metadata only and record current counts. Historical counts are references, not targets; legitimate app activity may change them.

Must confirm:

- core tenant resources still have no NULL `academy_id`;
- automation history can be resolved without conflict;
- `financial_charges` is still empty;
- `installment_count` contains only `3` if present;
- no unexpected archive column/data state exists.

### Production migration order

Apply exact tested migrations in order:

1. `20260911203000_canonical_security_hardening.sql`
2. `20260911203500_allow_receipt_student_unlink_only.sql`
3. `20260911204000_automation_tenant_scope.sql`
4. `20260911205000_remove_legacy_schema.sql`
5. `20260911205500_archive_history_client_deny.sql`

After each meaningful checkpoint, compare aggregate counts/invariants and rerun security metadata checks. Stop immediately on any guard failure.

### Production Edge Functions

After CI and DB migration verification, deploy the exact dev-validated sources:

- `send-whatsapp` — `verify_jwt=true`
- `retry-automation-message` — `verify_jwt=true`
- `payment-lifecycle` — `verify_jwt=true`
- `process-reminders` — `verify_jwt=false`, cron secret required
- `whatsapp-webhook` — `verify_jwt=false`, Meta HMAC required; redeploy only if deployed source differs from canonical version
- `payment-receipt` — unchanged unless source parity check finds drift

### Final production verification

- tenant isolation A->B returns zero foreign records/actions;
- receipt/student and automation tenant relationships have zero conflicts;
- no anon table grants;
- no legacy fallback policies;
- archive audit table is inaccessible to browser roles;
- receipt deletion semantics remain `ON DELETE SET NULL` and trigger blocks relink;
- Edge Function source/hash/config matches repository/dev expectations;
- advisors contain only explicitly accepted warnings;
- no business-row counts drop unexpectedly.

## Approved Implementation Amendment

The approved design originally expected legacy removal to be straightforward. Dev execution discovered two archived timestamps and a trigger/FK conflict. The user approved preserving the archive history instead of deleting it. The trigger fix was derived from a failing rollback-only test and narrows the allowed receipt mutation to the exact FK unlink transition. These amendments are part of the canonical plan, not optional cleanup.
