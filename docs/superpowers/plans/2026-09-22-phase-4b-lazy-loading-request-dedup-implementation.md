# Phase 4B — Lazy Loading and Request Deduplication Plan

Date: 2026-09-22
Branch: `performance/phase-4b-lazy-loading-request-dedup`

## Gate 1 — Repository

1. Lazy-load Chart.js from the exact CSP-approved URL.
2. Use the existing tab-bar fallback as the canonical lazy loader for Automation.
3. Cache/deduplicate Reports payment-history reads with payment-lifecycle invalidation.
4. Consolidate Automation student/settings reads.
5. Add a short Automation freshness window with explicit forced-refresh/invalidation paths.
6. Update legacy security contracts to accept the reviewed exact lazy loader.
7. Add Phase 4B regression tests.

## Gate 2 — Preview

1. Require CI green.
2. Require Vercel Preview Ready.
3. Verify the final diff contains no Supabase migration, Edge Function or write-path change.
4. Verify initial HTML no longer references Chart.js or `automation-center.js`.
5. Verify CSP still contains the exact Chart.js URL.

## Gate 3 — Production

1. Merge by the exact reviewed PR head SHA.
2. Require Vercel production deployment Ready.
3. Require the GitHub publish workflow green.
4. Observe `pg_stat_statements` over subsequent real traffic before making any further query/index-removal decision.

No database mutation or cleanup is allowed in Phase 4B.
