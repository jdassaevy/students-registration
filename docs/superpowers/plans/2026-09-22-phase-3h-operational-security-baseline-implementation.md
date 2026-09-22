# Phase 3H — Operational Security Baseline Plan

Date: 2026-09-22
Branch: `security/phase-3h-operational-security-baseline`

## Gate 1 — Repository

1. Pin all GitHub Actions to reviewed full commit SHAs.
2. Move CI/deploy runners from `ubuntu-latest` to `ubuntu-24.04`.
3. Disable persisted checkout credentials.
4. Add a sanitized client logging helper and remove raw Error/message logging.
5. Add no-store rules for Vercel HTML entry points.
6. Add regression tests for the operational security baseline.

## Gate 2 — Preview / CI

1. Require the modified CI workflow itself to pass.
2. Require Vercel Preview Ready.
3. Confirm the workflow no longer depends on mutable Action tags.
4. Confirm no Supabase/database files changed.

## Gate 3 — Production

1. Merge using the exact reviewed PR head SHA.
2. Require Vercel production deployment Ready.
3. Require the SHA-pinned GitHub Pages workflow to complete successfully.
4. Record the production closeout in the PR.

No database cleanup, reset, backfill, session invalidation or business-data mutation is allowed.
