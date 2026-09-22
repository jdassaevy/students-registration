# Phase 2D — Final Security Hardening Design

Date: 2026-09-22
Status: implementation candidate

## Goal

Close the remaining actionable hardening items after Phases 1, 2A, 2B and 2C without changing business behavior or tenant data.

## SECURITY DEFINER review

Production currently has five SECURITY DEFINER functions in public. One, `check_rate_limit`, is already service-role only and is not flagged.

The four advisor findings split into two categories:

- `is_academy_member(uuid)` and `is_academy_owner(uuid)` only read `academy_members` for `auth.uid()`. That table has a non-recursive authenticated SELECT policy, so these helpers do not need owner privileges. Phase 2D converts them to SECURITY INVOKER.
- `bootstrap_academy(text)` and `delete_class_with_students(uuid)` implement intentional authenticated workflows that currently depend on privileged/atomic behavior. Phase 2D keeps them SECURITY DEFINER, narrows their grants, and pins their search path.

This should reduce the advisor findings from four intentional/excessive definers to two intentional workflow RPCs.

## Future function ACLs

Supabase currently gives postgres-owned functions created in `public` default EXECUTE grants to `anon` and `authenticated`.

Phase 2D changes the postgres default for future public functions so browser roles do not receive EXECUTE automatically. Future RPCs must be granted deliberately.

Supabase-managed default privileges owned by internal roles are not changed.

## Secret surface

The repository is public. It currently contains no committed `.env` file and the browser only contains the Supabase publishable key, which is intentionally public.

Phase 2D adds:

- a repository `.gitignore` for local env files, private key material, Vercel/Supabase local state, and node modules;
- a CI contract that keeps server-only secret names out of browser config;
- a CI scan for high-signal live secret formats;
- a contract that server-only values continue to come from Edge Function environment variables.

No existing secret values are printed, copied, or rotated by this phase.

## Auth leaked-password protection

The Supabase security advisor reports leaked-password protection as disabled.

This setting is managed by Supabase Auth configuration, not by the database migration path available to this repository. Supabase's current documentation states that leaked-password protection is available on the Pro Plan and above. The current organization is operating under the free-project limit, so this advisor warning is an accepted platform limitation unless the project is upgraded.

On the current plan, the review records the limitation explicitly and does not pretend that a client-only password rule is equivalent to server-side leaked-password protection. If the project moves to Pro or above, enable leaked-password protection in Auth settings and re-run the advisor.

## Data safety

The Phase 2D database migration contains only ALTER FUNCTION, GRANT/REVOKE, and ALTER DEFAULT PRIVILEGES statements. It performs no business-row insert, update, or delete.

## Success criteria

- repository CI green;
- DEV migration applies cleanly;
- tenant RLS and atomic class deletion pass rollback-only runtime tests;
- `is_academy_member` and `is_academy_owner` are SECURITY INVOKER in DEV;
- advisor SECURITY DEFINER findings drop from four to two;
- no tenant/linkage invariant changes;
- exact validated migration is promoted to PROD;
- production postflight remains clean;
- the leaked-password advisor is either cleared on Pro+ or explicitly recorded as an accepted Free-plan platform limitation.
