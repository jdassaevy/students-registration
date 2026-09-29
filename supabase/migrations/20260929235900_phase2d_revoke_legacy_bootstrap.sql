-- Phase 2D rollout stage 2.
-- Apply only after the bootstrap-academy Edge Function and the frontend that
-- invokes it are live. This changes ACLs only and touches no business rows.

revoke execute on function public.bootstrap_academy(text) from public, anon, authenticated;
grant execute on function public.bootstrap_academy(text) to service_role;
