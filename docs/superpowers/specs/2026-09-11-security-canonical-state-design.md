# Students Registration — Canonical Security State Design

Date: 2026-09-11
Scope: Phase 1 — Security, RLS, permissions, tenant isolation, Supabase alignment

## Goal

Establish a single canonical state for GitHub, Supabase development, and Supabase production without losing or rewriting production data. The canonical state must preserve the currently working business flows while removing legacy schema and authorization paths that create ambiguity or unnecessary attack surface.

## Core Principles

1. Production data integrity has priority over schema cleanliness.
2. Read-only inspection first; destructive DDL only after proving the target objects are unused and non-essential.
3. No bulk data migration, backfill, delete, or rewrite unless strictly required.
4. Development is the validation environment; production only receives changes already validated in development.
5. GitHub becomes the source of truth after reconciliation.
6. Vercel deploys are minimized by grouping repository changes into one coordinated push after database and Edge Function validation.
7. Any operation using Supabase service role must explicitly re-establish authorization because service role bypasses RLS.

## Canonical Data Model

Retain as active application data model:

- `academies`
- `academy_members`
- `academy_profiles`
- `classes`
- `students`
- `payment_events`
- `receipts`
- `automation_settings`
- `automation_messages`
- `student_archive_history` (internal audit-only history; no client grants)

Canonical tenant relationship:

`authenticated user -> academy_members -> academy -> resource`

Every tenant-owned resource must be authorized from academy membership, not only from historical `user_id` ownership.

### Legacy objects to remove from the canonical state

#### `students.archived_at`

Reason: belongs to the older archive model. Current production behavior uses real deletion while preserving financial history through receipts. Keeping both models creates contradictory behavior in application and Edge Functions.

Removal condition:

- verify no current dev workflow depends on `archived_at` after Edge Function reconciliation;
- update any remaining query using `.is('archived_at', null)` before dropping the column;
- copy every non-null `(student_id, academy_id, archived_at)` tuple into `student_archive_history`;
- abort if any archived row lacks `academy_id` or if source/preserved counts differ;
- only then drop `students.archived_at`.

#### `financial_charges`

Reason: present only in production, currently contains zero rows, is absent from main GitHub schema, and no database routine references it.

Removal condition:

- final code search confirms no production frontend/Edge Function runtime references;
- record count remains zero immediately before removal.

#### `classes.installment_count`

Reason: present only in production, all existing values are the default value `3`, and no database routine references it. Current application model already stores payment state without depending on this field.

Removal condition:

- final code search confirms no active UI/Edge Function path depends on it;
- all production values remain `3` immediately before removal.

## Receipt Preservation

Deletion of a student must not delete historical receipts.

Canonical rule:

- `receipts.student_id` is nullable;
- FK from `receipts.student_id` uses `ON DELETE SET NULL`;
- receipt number, amount, person, payment type, installment, paid date, status and storage path remain preserved after student deletion;
- the receipt audit trigger allows only the unlink transition `student_id: UUID -> NULL`; relinking `NULL -> UUID` or changing one UUID to another remains forbidden.

Class/student deletion must continue to be atomic where appropriate.

## RLS and Grants

Canonical RLS behavior:

- no `academy_id IS NULL AND auth.uid() = user_id` compatibility fallback;
- tenant-owned resources resolve access through active membership in `academy_members`;
- Academy A cannot SELECT, INSERT, UPDATE or DELETE Academy B resources;
- service-role code performs its own equivalent tenant checks.

Canonical table grants:

- `anon`: no direct table privileges on application tables;
- `authenticated`: only the DML operations required by the application;
- RLS remains enabled on tenant-sensitive tables.

Internal helper functions:

- fixed `search_path` where required;
- no unnecessary `PUBLIC` or `anon` execute grants;
- `SECURITY DEFINER` remains only where intentional and reviewed.

## Edge Function Authorization Model

All authenticated Edge Functions using `SUPABASE_SERVICE_ROLE_KEY` must follow this sequence:

1. Validate JWT and resolve the authenticated Supabase user.
2. Load the target resource.
3. Resolve the target `academy_id`.
4. Verify active academy membership for the authenticated user.
5. Verify cross-resource tenant consistency.
6. Only then execute privileged reads/writes or generate signed URLs.

### `payment-receipt`

Current implementation is already close to canonical and is identical in dev/production bundles.

Required invariant:

- membership in `receipt.academy_id`;
- student belongs to receipt academy;
- class, when present, belongs to receipt academy.

### `send-whatsapp`

Canonical checks:

- student must have `academy_id`;
- authenticated user must have active access to that academy;
- automation log must be associated with the same tenant context;
- for receipt delivery:
  - `receipt.academy_id === student.academy_id`;
  - `receipt.student_id === student.id`;
  - `receipt.storage_path` exists;
- only then create a signed URL and send the document.

This prevents a valid receipt from Student A being deliberately sent to Student B's WhatsApp contact.

### `retry-automation-message`

Canonical checks:

- source automation message must belong to an academy accessible by the authenticated user;
- student must belong to that same academy;
- receipt, when required, must match both academy and student;
- retries retain idempotency guarantees.

Do not rely only on `source.user_id === user.id` or `student.user_id === user.id`.

### `payment-lifecycle`

Review and normalize to the same membership/academy model before promotion.

### `whatsapp-webhook`

Keep `verify_jwt=false` only because POST requests validate Meta's HMAC signature using `META_APP_SECRET`; GET verification continues using the configured verification token.

### `process-reminders`

Keep `verify_jwt=false` only while the function independently requires `AUTOMATION_CRON_SECRET` before privileged work.

## Environment Reconciliation Strategy

### Development first

1. Bring development schema to canonical structure.
2. Remove legacy dev-only `archived_at` usage from code/functions.
3. Bring production-only active behavior required by the application into versioned migrations where appropriate.
4. Reconcile all six Edge Functions to the canonical authorization rules.
5. Deploy reconciled functions only to Supabase dev.
6. Run security and regression verification.

### Production second

Production receives only the exact changes that passed development verification.

Before each production DDL change:

- re-check production object usage/counts;
- record aggregate invariants;
- avoid data-changing DML.

After each production change:

- re-check aggregate counts;
- re-run cross-tenant visibility test;
- run Supabase security advisors.

## Data Safety Invariants

Production baseline recorded during Phase 1:

- classes: 1
- students: 17
- payment events: 22
- receipts: 46
- records missing `academy_id` in the four principal tenant tables: 0
- known cross-academy relationship mismatches: 0
- automation messages with receipts: 80
- known student/receipt mismatches in automation history: 0

These are verification invariants, not migration targets. No migration may attempt to force counts back to these values.

## Test Matrix

### Tenant isolation

Using an authenticated dev session for Academy A:

- see Academy A resources: allowed;
- see Academy B classes: denied;
- see Academy B students: denied;
- see Academy B payments: denied;
- see Academy B receipts: denied;
- update/delete Academy B resources: denied.

### Receipt linkage

- same academy + same student: allowed;
- same academy + different student: denied;
- different academy + same/different student: denied;
- missing linkage: denied.

### Student/class deletion

- delete student: student removed, receipt preserved with nullable student link;
- delete class with students: operation remains authorized and atomic;
- no receipt history is destroyed.

### WhatsApp and automation

- unauthorized academy: denied before provider call;
- missing consent: skipped;
- invalid student/receipt pairing: denied;
- duplicate idempotency key: safe duplicate response;
- Meta failure: logged without breaking core database state;
- retry respects the same tenant and receipt invariants.

### Webhooks/cron

- invalid Meta signature: rejected;
- valid Meta signature: accepted;
- missing/invalid cron secret: rejected;
- valid cron secret: proceeds.

## GitHub as Source of Truth

After dev verification, repository state must include:

- migrations representing the canonical schema and hardening already applied;
- reconciled Edge Function source matching the tested dev deployment;
- tests for tenant isolation and receipt linkage;
- this design document;
- no runtime-only Supabase changes that are missing from GitHub;
- explicit migrations for receipt-unlink audit semantics and deny-all archive-history RLS.

The repository push should be grouped to minimize Vercel preview/build activity.

## Rollout Order

1. Canonical schema reconciliation in dev.
2. Edge Function reconciliation in dev.
3. Dev test matrix.
4. Add canonical migrations/function code/tests to one GitHub branch/push.
5. Review CI without repeatedly creating Vercel builds.
6. Apply validated schema changes to production.
7. Deploy validated Edge Functions to production.
8. Final production security/integrity verification.

## Success Criteria

Phase 1 canonicalization is complete when:

- GitHub, dev, and production agree on the supported schema;
- GitHub source matches deployed Edge Functions;
- no tenant access path relies on legacy `user_id` ownership alone where academy membership is required;
- receipt delivery validates academy and student linkage;
- no unnecessary anon table access remains;
- no production business data is lost or rewritten during reconciliation;
- final Supabase advisors contain only explicitly accepted warnings;
- Vercel receives no repeated incremental deploy spam during the reconciliation process.

## Implementation Findings Incorporated

During dev verification, two historical `students.archived_at` values were found. The approved canonicalization therefore preserves those timestamps in `student_archive_history` before dropping the legacy column. No names, phones, payment values, or other business fields are copied into this audit table.

A rollback-only deletion test also exposed a conflict between `ON DELETE SET NULL` and the receipt audit trigger. The canonical trigger now permits only `student_id` changing from a non-null UUID to `NULL`; every other student-link mutation remains immutable.

The audit-history table has RLS enabled, an explicit deny-all authenticated policy, and no `anon`/`authenticated` table grants.
