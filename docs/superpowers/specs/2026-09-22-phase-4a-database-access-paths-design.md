# Phase 4A — Database Access Paths

Date: 2026-09-22
Status: implementation candidate

## Goal

Prepare the multi-academy database for growth by indexing the foreign-key paths and tenant-scoped ordered reads that are already visible in production traffic, without changing any business rows or removing existing indexes.

## Evidence

Supabase performance advisors report four unindexed foreign keys in both DEV and PROD:

- `automation_messages.class_id`
- `automation_messages.receipt_id`
- `payment_events.class_id`
- `receipts.class_id`

`pg_stat_statements` also shows recurring production reads shaped as:

- receipts filtered by academy and ordered by `created_at desc`
- students filtered by academy and ordered by `created_at desc`
- classes filtered by academy and ordered by `created_at asc`
- payment events filtered by academy and ordered by `paid_at asc`
- automation messages filtered by academy and ordered by `created_at desc`, usually limited to the latest 50

Current EXPLAIN plans show explicit sort steps on receipts, students, classes and automation messages. Payment events can use the global paid-at index but still filter academy afterward.

## Design

Add four single-column indexes to cover the foreign keys identified by the advisor.

Add five tenant-first composite indexes matching the recurring production read shapes.

Existing indexes are intentionally retained. Even when a new composite index may later make a simpler index redundant, removal requires post-rollout usage evidence and belongs in a separate phase.

## Data safety

The migration contains only `CREATE INDEX IF NOT EXISTS`. It performs no DML, no constraint rewrite and no index removal.

Tables are currently small in production (hundreds of rows), so regular index creation has low operational risk. The same exact migration is validated in DEV before PROD.

## Success criteria

- CI green.
- DEV migration applies successfully.
- Supabase advisor no longer reports the four unindexed foreign keys in DEV.
- All nine reviewed index definitions exist with the expected columns/order.
- Business counts and tenant/linkage invariants remain unchanged.
- Exact migration blob is promoted to PROD only after DEV validation.
- PROD advisor clears the unindexed foreign-key findings.
