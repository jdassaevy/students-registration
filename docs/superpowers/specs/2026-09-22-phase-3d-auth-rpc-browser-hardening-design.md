# Phase 3D — Auth, RPC and Browser Hardening

Date: 2026-09-22
Status: implementation candidate

## Goal

Reduce browser attack surface around authenticated sessions without changing tenant data or business behavior.

## Audit findings

- No application table or RPC is directly granted to `anon`.
- `anon` and `authenticated` have schema USAGE but cannot CREATE in `public`.
- Two trigger helpers still have unnecessary direct EXECUTE for `authenticated`:
  - `touch_automation_settings_updated_at()`
  - legacy/orphan `set_financial_charge_updated_at()`
- The production Vercel configuration has no CSP or standard browser security headers.
- The auth UI allows 6-character passwords for new registrations and password recovery changes.
- Password recovery currently derives its redirect from the entire current URL minus only the fragment.
- Supabase security advisor still reports Leaked Password Protection disabled; this is an Auth project setting and is not changed by this code/database phase.

## Design

### Browser security
- Move the early theme bootstrap out of inline JavaScript.
- Add a Vercel Content-Security-Policy that allows only local scripts plus the existing jsDelivr dependencies.
- Allow connections only to the app origin and the configured Supabase HTTPS/WSS origin.
- Deny framing and object embedding.
- Add nosniff, strict referrer policy, restrictive permissions policy and HSTS.

### Password UX
- Require at least 8 characters for new registrations and password recovery changes.
- Do not enforce that client minimum on login so existing users with legacy shorter passwords are not locked out.
- Keep the server as the final authority for password policy.
- Use only origin + pathname for password recovery redirect URLs.

### RPC / trigger least privilege
- Keep the two intended SECURITY DEFINER workflow RPCs unchanged.
- Keep `find_duplicate_active_receipts()`, membership helpers and service-only rate limiting unchanged.
- Revoke direct browser EXECUTE on trigger helper functions.
- Harden their search_path to `pg_catalog, public`.
- Do not drop the legacy helper in this phase.

## Data safety

The database migration contains ALTER FUNCTION and REVOKE only. It performs no DML and changes no user rows.

## Success criteria

- CI and Vercel preview green.
- CSP deploys without blocking the app's required local/jsDelivr scripts or Supabase connections.
- New passwords use an 8-character client minimum while existing login remains compatible.
- Trigger helper direct EXECUTE is denied to authenticated clients.
- Automation settings UPDATE still fires its trigger after the EXECUTE revoke.
- Counts and tenant/linkage invariants remain unchanged in DEV and PROD.
