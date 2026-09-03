# Student Archive Removal Design

Date: 2026-09-03
Status: Proposed for implementation after user review
Branch: `fix/student-archive-removal`

## Context

The current student removal flow always executes a hard `DELETE` against `students`. This fails when a student has receipts because `receipts.student_id` references `students.id` with `ON DELETE RESTRICT`. The frontend hides the database reason and shows only `Erro ao excluir.`.

The desired product behavior is different from a destructive delete: when a student/couple has financial history, the record must disappear from current operations and current financial totals while preserving receipts and audit records. There will be no archived-students UI and no restore action in this scope.

## User decisions

- Removing a student/couple with history must remove them from current operational views and current financial totals.
- Historical receipts and audit records must remain preserved.
- There will be no `Arquivados` screen and no restore button.
- A student/couple with no financial history may still be hard-deleted.

## Goals

1. Make the existing remove action work for students with receipts/history.
2. Preserve immutable financial/audit evidence.
3. Exclude archived students from current students, dashboard, class counts, finance totals, reports, due-date operations and future reminder automation.
4. Keep the user-facing action simple: the existing delete control remains the entry point.
5. Preserve tenant isolation and existing multi-academy RLS behavior.

## Non-goals

- No archived-students browsing UI.
- No restore flow.
- No deletion of historical receipts.
- No rewriting old receipt PDFs.
- No change to payment amounts, due-date rules or WhatsApp templates.
- No production migration or deploy before DEV validation and separate approval.

## Data model

Add a nullable timestamp to `public.students`:

```sql
archived_at timestamptz null
```

Semantics:

- `archived_at IS NULL`: active student/couple and part of current operations.
- `archived_at IS NOT NULL`: removed from current operations but retained for historical references.

Existing rows remain active because the new column defaults to `NULL`.

## Removal operation

Introduce one database operation, exposed as an authenticated RPC, to decide atomically whether to hard-delete or archive.

Suggested contract:

```text
remove_student_from_operation(student_id) -> 'deleted' | 'archived'
```

The operation runs with caller authorization and existing tenant access rules. It must not bypass academy isolation.

Decision rule:

- If the student has at least one row in `receipts` or `payment_events`, set `students.archived_at = now()` and return `archived`.
- Otherwise, hard-delete the `students` row and return `deleted`.

`financial_charges` are current/derived obligations and do not by themselves force archival. Existing foreign-key behavior may remove them on a true hard delete. Historical `automation_messages` remain governed by their existing FK behavior.

The operation must be idempotent enough for the UI not to create duplicate destructive effects: an already archived or unavailable record should return a controlled error rather than silently manipulating another tenant's data.

## Frontend removal flow

Replace the direct `.from('students').delete()` call in `removeCouple(id)` with the RPC.

After success:

- remove the student from the in-memory `couples` list;
- re-render current views;
- if result is `archived`, show `Cadastro removido. Histórico financeiro preservado.`;
- if result is `deleted`, show `Cadastro excluído.`.

Database errors must be logged for diagnosis while the user receives a concise non-sensitive message.

## Active-student filtering

The primary student loader must explicitly select only active rows:

```text
students where archived_at is null
```

This causes the existing in-memory `couples`-based calculations to exclude archived students from:

- student list and search;
- dashboard current counts;
- class current counts;
- current Financeiro totals and detail cards;
- current report metrics derived from `couples`;
- DOCX/current student exports that consume the active list.

Any code path that queries `students` independently must also use the active predicate when its purpose is current operations.

## Reports and historical events

The reports revenue chart loads `payment_events` directly. Therefore filtering only `couples` is insufficient.

For current financial reporting, payment events belonging to archived students must not contribute to current report totals or the monthly revenue series. The frontend can derive the active student ID set from the already loaded active `couples` and filter loaded events against that set, or apply an equivalent database query. The implementation should prefer the smallest change that preserves tenant isolation and avoids URL/query-size issues.

Historical `payment_events` rows themselves remain in the database unchanged.

## Automation behavior

`process-reminders` currently loads students directly from Supabase. It must explicitly exclude rows where `archived_at IS NOT NULL` so archived students never become D-3, D0 or D+3 candidates.

Any current-readiness/student-eligibility query in the Automation Center should also use active students for operational checks.

Existing `automation_messages` remain preserved as audit/history. The archive action must not delete historical automation logs.

## Receipts

Receipts remain untouched and continue referencing the archived `students` row. Keeping the student row is intentional: it preserves referential integrity and historical context.

Receipt history is not part of current financial totals. It may continue to expose historical receipts through the existing receipt-history flow.

## Security and tenant isolation

The migration must preserve existing RLS policies. The removal RPC must only act on a student visible/authorized to the authenticated academy member under the existing multi-academy model.

If implemented as a normal `SECURITY INVOKER` function, RLS remains authoritative. If implementation constraints require `SECURITY DEFINER`, explicit academy authorization and a fixed safe `search_path` become mandatory. Prefer `SECURITY INVOKER` unless testing proves it insufficient.

No secret, service-role credential or Meta credential is exposed to the browser.

## Error handling

Expected outcomes:

- `deleted`: no financial history, hard delete succeeded.
- `archived`: financial history exists, archive succeeded.
- not found/access denied: no mutation; show a controlled failure.
- unexpected database failure: no local list mutation; log technical detail and show a generic failure.

The frontend must not optimistically remove a student before the database confirms the result.

## Testing strategy

Implementation follows TDD.

Database/migration tests or executable SQL checks must cover:

- existing students default to active after migration;
- student with receipt is archived, receipt remains;
- student with payment event is archived, event remains;
- student with neither receipt nor payment event is hard-deleted;
- tenant/user cannot remove another academy's student;
- repeated/remnant requests fail safely without corrupting history.

Frontend tests must cover:

- loader requests only active students;
- removal result `archived` removes the item from `couples` and uses the archive-success message;
- removal result `deleted` uses the delete-success message;
- failed RPC leaves local data intact;
- report event filtering excludes events whose `student_id` is not in the active student set.

Automation tests must cover:

- reminder processing query excludes archived students;
- archived students cannot produce new reminder candidates.

The full existing JavaScript test suite must pass after the change.

## DEV validation sequence

1. Implement tests first and confirm RED on the current behavior.
2. Add the migration/RPC and code changes on `fix/student-archive-removal`.
3. Apply the migration only to the DEV Supabase project first.
4. Deploy the matching code only to `dev-preview`, preserving the DEV Supabase configuration.
5. Create controlled DEV fixtures for both paths: one no-history student and one student with history.
6. Validate hard delete, archive behavior, current financial exclusion and reminder exclusion.
7. User manually validates DEV.
8. Only after explicit approval: open/review PR to `main`.
9. Only after separate explicit approval: merge and apply/deploy production changes.

## Production rollout safeguards

Production rollout is intentionally separate because the feature contains a database migration.

Before production migration/deploy:

- confirm the exact main SHA and migration contents;
- confirm DEV behavior passed;
- confirm no code path still treats archived students as current operations;
- take no destructive cleanup action on existing production students automatically;
- add only the nullable column/function; do not backfill `archived_at` for existing rows.

After production rollout, existing students remain active until a user explicitly uses the remove action.

## Acceptance criteria

The feature is complete when:

- a student with historical receipts can be removed without deleting those receipts;
- a student with payment history disappears from current operational and financial views after removal;
- a no-history student is hard-deleted;
- archived students generate no future reminder candidates;
- historical receipts, payment events and automation logs remain preserved;
- there is no archived-students UI;
- tenant isolation remains intact;
- DEV manual validation succeeds before production changes.