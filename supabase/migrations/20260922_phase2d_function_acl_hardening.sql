-- Phase 2D: reduce SECURITY DEFINER surface and close future function ACL defaults.
-- No business-row INSERT/UPDATE/DELETE is performed by this migration.

-- These two helpers only read academy_members for the current auth.uid().
-- academy_members already has a non-recursive authenticated SELECT policy, so
-- they do not need owner privileges to support RLS on tenant-owned tables.
alter function public.is_academy_member(uuid) security invoker;
alter function public.is_academy_member(uuid) set search_path = pg_catalog, public;

alter function public.is_academy_owner(uuid) security invoker;
alter function public.is_academy_owner(uuid) set search_path = pg_catalog, public;

-- These RPCs intentionally retain SECURITY DEFINER because they perform atomic
-- privileged workflows on behalf of an authenticated caller. Keep their lookup
-- path explicit and their API grants narrow.
alter function public.bootstrap_academy(text) set search_path = pg_catalog, public;
alter function public.delete_class_with_students(uuid) set search_path = pg_catalog, public;

revoke execute on function public.bootstrap_academy(text) from public, anon;
revoke execute on function public.delete_class_with_students(uuid) from public, anon;
revoke execute on function public.is_academy_member(uuid) from public, anon;
revoke execute on function public.is_academy_owner(uuid) from public, anon;

grant execute on function public.bootstrap_academy(text) to authenticated, service_role;
grant execute on function public.delete_class_with_students(uuid) to authenticated, service_role;
grant execute on function public.is_academy_member(uuid) to authenticated, service_role;
grant execute on function public.is_academy_owner(uuid) to authenticated, service_role;

-- New postgres-owned functions in public must be exposed deliberately.
-- Supabase-managed role defaults are intentionally left unchanged.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
