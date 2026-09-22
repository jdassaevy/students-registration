# Phase 2D — Final Security Hardening Implementation Plan

Date: 2026-09-22
Branch: `security/phase-2d-final-hardening`

## Gate 1 — Repository

1. Add the Phase 2D function ACL migration.
2. Convert only membership/owner RLS helpers to SECURITY INVOKER.
3. Keep bootstrap/class-delete workflow RPCs SECURITY DEFINER with narrow grants and explicit search paths.
4. Revoke future postgres-owned public-function EXECUTE defaults from browser roles.
5. Add `.gitignore` and secret-surface CI contracts.
6. Align the canonical reference schema.
7. Require the existing repository test workflow to pass.

No Supabase project is changed in this gate.

## Gate 2 — DEV

Use the existing temporary free-project slot workflow:

1. pause `family-finance` only while DEV validation is active;
2. restore `students-registration-dev`;
3. capture schema/function/advisor and tenant-integrity baseline;
4. apply the exact Phase 2D migration;
5. verify helper `prosecdef=false`, grants, default ACLs, and advisor delta;
6. run rollback-only two-tenant RLS tests;
7. verify class deletion/receipt-history behavior;
8. verify zero synthetic rows remain;
9. pause DEV and restore `family-finance`.

## Gate 3 — PROD

Only after DEV and CI are green:

1. capture fresh production counts/invariants/advisors;
2. apply the exact validated DDL migration;
3. repeat function/grant/default-ACL checks;
4. repeat tenant/linkage invariants;
5. confirm advisor findings did not expand;
6. merge PR only after postflight is clean.

## Auth operations gate

Supabase's current documentation places leaked-password protection on Pro and above. On the current Free-plan project setup, record the advisor as an accepted platform limitation.

If the project is upgraded to Pro or above:

- enable leaked-password protection in Auth settings;
- re-run the security advisor;
- verify signup, sign-in, password recovery and password update;
- do not weaken the setting to preserve compatibility with a known compromised password.

## Stop conditions

Stop on any of these:

- authenticated users lose access to their own academy data;
- cross-tenant visibility or mutation appears;
- bootstrap or atomic class deletion changes behavior;
- advisor findings increase unexpectedly;
- business-data counts/invariants change;
- DEV migration differs from the repository candidate;
- any secret value is exposed during validation.
