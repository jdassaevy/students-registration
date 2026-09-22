# Phase 4A — Database Access Paths Plan

Date: 2026-09-22
Branch: `performance/phase-4a-database-access-paths`

## Gate 1 — Repository

1. Add an index-only migration for the four unindexed foreign keys.
2. Add tenant-first composite indexes for the five observed ordered read patterns.
3. Align the canonical schema.
4. Add regression tests preventing DML, index drops or accidental access-path drift.

## Gate 2 — DEV

1. Capture DEV row counts and tenant/linkage invariants.
2. Capture current performance-advisor findings.
3. Apply the exact reviewed migration.
4. Verify all nine indexes structurally.
5. Re-run the performance advisor and require the unindexed-FK findings to clear.
6. Recheck counts and tenant/linkage invariants.

## Gate 3 — Production

1. Merge only after CI and DEV are green.
2. Capture production counts and tenant/linkage invariants.
3. Apply the exact migration blob validated in DEV.
4. Verify all nine index definitions.
5. Re-run the performance advisor.
6. Recheck business counts/invariants.

Do not remove any existing index in Phase 4A.
