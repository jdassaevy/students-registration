# Phase 4C — Network Read Resilience Plan

Date: 2026-09-22
Branch: `reliability/phase-4c-network-read-resilience`

## Gate 1 — Repository

1. Add a shared read-only timeout/retry helper.
2. Load it before core business modules.
3. Deduplicate core `loadData()` calls and preserve stale state on failure.
4. Add offline/reconnect behavior with a read-only reconnect refresh.
5. Apply resilient reads to Reports, Automation, Receipts and Academy Profile.
6. Bound Chart.js lazy loading.
7. Add tests proving write paths are not retried.
8. Update lazy-load version contracts.

## Gate 2 — Preview

1. Require CI green.
2. Require Vercel Preview Ready.
3. Review the final diff for accidental write retries.
4. Confirm no Supabase migration, Edge Function or Storage changes.
5. Confirm existing security/CSP contracts remain green.

## Gate 3 — Production

1. Merge using the exact reviewed PR head SHA.
2. Require Vercel production Ready.
3. Require GitHub Pages publish green.
4. Confirm Supabase migration history is unchanged.

No database mutation or automated write retry is allowed in Phase 4C.
