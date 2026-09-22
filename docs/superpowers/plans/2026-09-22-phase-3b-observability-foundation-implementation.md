# Phase 3B — Observability Foundation Implementation Plan

Date: 2026-09-22
Branch: `reliability/phase-3b-observability-foundation`

## Gate 1 — Repository

1. Add a safe shared observability helper.
2. Add request correlation with `X-Request-ID`.
3. Expose the trace header through the existing exact CORS allowlist.
4. Replace raw Edge Function console logs with structured allowlisted events.
5. Add CI contracts that prevent PII/secrets from entering the logger.
6. Document operational health checks and known integration failures.

No database migration is allowed in this phase.

## Gate 2 — DEV

1. Temporarily use the approved DEV/free-slot workflow.
2. Capture business-data counts and tenant/linkage baseline.
3. Deploy exact branch bundles to DEV.
4. Verify all six deployed bundles match the branch.
5. Run safe negative/auth/CORS checks where the environment supports them.
6. Verify database counts/invariants are unchanged.
7. Do not send real WhatsApp messages or create real payment/receipt events.
8. Restore the normal project-slot state.

## Gate 3 — PROD

Only after CI and DEV are green:

1. Capture fresh production counts and tenant/linkage invariants.
2. Deploy exact DEV-validated bundles.
3. Verify deployed files match the reviewed branch.
4. Recheck business counts/invariants.
5. Confirm no scheduler or database migration was created.
6. Merge the PR so `main` matches production.

## Operational follow-up

The `payment_voided` Meta template issue is configuration work, not a reason to rewrite or delete historical automation rows.

Do not retry configuration failures automatically. Preserve the failed rows as audit history.
