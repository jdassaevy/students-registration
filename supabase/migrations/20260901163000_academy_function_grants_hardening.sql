-- Supabase grants EXECUTE directly to API roles on new functions.
-- Keep the academy SECURITY DEFINER helpers available to authenticated users only.

revoke execute on function public.bootstrap_academy(text) from anon;
revoke execute on function public.bootstrap_academy(text) from public;
grant execute on function public.bootstrap_academy(text) to authenticated;

revoke execute on function public.is_academy_member(uuid) from anon;
revoke execute on function public.is_academy_member(uuid) from public;
grant execute on function public.is_academy_member(uuid) to authenticated;

revoke execute on function public.is_academy_owner(uuid) from anon;
revoke execute on function public.is_academy_owner(uuid) from public;
grant execute on function public.is_academy_owner(uuid) to authenticated;
