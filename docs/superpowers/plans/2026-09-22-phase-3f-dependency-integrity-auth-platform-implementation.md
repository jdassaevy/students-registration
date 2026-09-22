# Phase 3F — Dependency Integrity and Auth Platform Plan

Date: 2026-09-22
Branch: `security/phase-3f-dependency-integrity-auth-platform`

## Gate 1 — Repository

1. Add the verified SHA-384 SRI value to the exact-pinned Supabase JS script.
2. Keep anonymous CORS and no-referrer on the CDN request.
3. Keep docx exact-pinned; do not add unverified SRI.
4. Explicitly preserve the client-only implicit Auth flow.
5. Add regression tests for SRI, pinning and Auth-flow behavior.
6. Document the official artifact provenance used for the hash.

## Gate 2 — Preview

1. Require CI green.
2. Require Vercel Preview Ready.
3. Review the final diff for any accidental session/storage behavior change.
4. Do not touch Supabase DEV/PROD data because this phase has no database change.

## Gate 3 — Production

1. Merge using the exact reviewed PR head SHA.
2. Require Vercel production deployment Ready.
3. Require GitHub production publish workflow green.
4. Re-run Supabase security advisors as observational closeout only.

## Operational Auth follow-up

If/when the Supabase project is on Pro and the product decision is approved separately:

- enable Leaked Password Protection;
- confirm server-side minimum password length is at least 8;
- evaluate an inactivity timeout or time-boxed sessions without enabling single-session mode by default.

No Auth platform setting is changed automatically in this phase.
