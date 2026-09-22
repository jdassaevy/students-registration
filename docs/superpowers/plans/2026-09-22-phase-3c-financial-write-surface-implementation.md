# Phase 3C — Financial Write Surface Implementation Plan

Date: 2026-09-22
Branch: `security/phase-3c-financial-write-surface`

## Gate 1 — Repository

1. Remove the legacy browser writer from `reports.js`.
2. Refresh reports from the existing `payment:lifecycle` event.
3. Add an ACL migration making `payment_events` and `receipts` read-only to `authenticated`.
4. Align the canonical schema.
5. Add contract tests preventing direct browser writes from returning.

## Gate 2 — DEV

1. Capture DEV counts and tenant/linkage invariants.
2. Apply the ACL migration to DEV.
3. Verify effective grants.
4. Use transaction rollback for any synthetic permission checks.
5. Verify SELECT remains available to authenticated academy members.
6. Verify direct INSERT/UPDATE/DELETE is denied.
7. Verify the Edge Function bundles remain unchanged unless the frontend bundle requires no Edge deploy.
8. Recheck counts and tenant/linkage invariants.

## Gate 3 — PROD

Only after repository CI and DEV validation are green:

1. Capture production counts and tenant/linkage invariants.
2. Apply the exact reviewed ACL migration.
3. Verify effective grants.
4. Recheck counts/invariants.
5. Merge only after production matches the reviewed state.

No data cleanup, backfill or destructive reset is allowed.
