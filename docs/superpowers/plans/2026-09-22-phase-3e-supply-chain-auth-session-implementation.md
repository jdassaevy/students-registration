# Phase 3E — Supply Chain and Auth Session Plan

Date: 2026-09-22
Branch: `security/phase-3e-supply-chain-auth-session`

## Gate 1 — Repository

1. Pin Supabase JS to the reviewed exact stable version.
2. Keep docx pinned at its current exact version.
3. Add anonymous/no-referrer attributes to external scripts.
4. Restrict CSP script-src to the two exact CDN URLs.
5. Make the browser Auth session defaults explicit.
6. Add regression tests for dependency pinning, CSP and secret-key markers.

## Gate 2 — Preview

1. Require CI green.
2. Require Vercel Preview Ready.
3. Review the final diff for accidental dependency or Auth-flow changes.
4. Do not touch Supabase DEV/PROD data because this phase has no database change.

## Gate 3 — Production

1. Merge using the exact reviewed PR head SHA.
2. Require Vercel production deployment Ready.
3. Require the GitHub publish workflow green.
4. Confirm the production commit matches the reviewed merge.
5. Re-run Supabase security advisors only as an observational closeout; no Auth project setting is auto-changed.

No database cleanup, reset, backfill or user-session invalidation is allowed.
