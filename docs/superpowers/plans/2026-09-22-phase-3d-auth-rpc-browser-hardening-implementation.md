# Phase 3D — Auth, RPC and Browser Hardening Plan

Date: 2026-09-22
Branch: `security/phase-3d-auth-rpc-browser-hardening`

## Gate 1 — Repository

1. Externalize the inline theme bootstrap.
2. Add Vercel security headers and CSP.
3. Raise the client minimum for newly-created passwords to 8 without changing login compatibility.
4. Normalize password recovery redirects to origin + pathname.
5. Add a migration revoking direct EXECUTE on trigger helpers.
6. Add regression tests for Auth, CSP and function ACLs.

## Gate 2 — DEV

1. Capture counts, tenant/linkage invariants and function privileges.
2. Apply the exact reviewed Phase 3D migration.
3. Confirm authenticated EXECUTE is removed from trigger helpers.
4. Run an authenticated automation-settings UPDATE inside an explicit transaction and ROLLBACK to prove the trigger still fires.
5. Recheck counts/invariants and confirm no synthetic changes persist.

## Gate 3 — Production

1. Merge only after CI and Preview Vercel are green and DEV ACL validation succeeds.
2. Wait for the production Vercel deployment to become Ready so the CSP/Auth browser changes are live.
3. Capture the production preflight.
4. Apply the exact migration blob validated in DEV.
5. Verify effective function privileges and Supabase security advisors.
6. Recheck counts and tenant/linkage invariants.

No business-row cleanup, reset or backfill is permitted.
