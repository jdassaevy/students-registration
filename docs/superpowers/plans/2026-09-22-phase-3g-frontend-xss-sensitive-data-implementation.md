# Phase 3G — Frontend XSS and Sensitive Data Plan

Date: 2026-09-22
Branch: `security/phase-3g-frontend-xss-sensitive-data`

## Gate 1 — Repository

1. Replace inline student action handlers with delegated data-* actions.
2. Move Chart.js to an exact-pinned static script and align CSP.
3. Remove dynamic Chart.js script injection.
4. Purge legacy localStorage business data only after migration completion is established.
5. Add regression tests for CSP compatibility, Chart.js, escaping and local-data cleanup.

## Gate 2 — Preview

1. Require CI green.
2. Require Vercel Preview Ready.
3. Confirm no unexpected database/Edge/Storage changes exist.
4. Review the final diff for any action-routing regression.

## Gate 3 — Production

1. Merge using the exact reviewed PR head SHA.
2. Require Vercel production Ready.
3. Require GitHub production publish workflow green.
4. Re-run the security contract tests through CI.

No database cleanup, reset or server-side deletion is allowed in this phase.
