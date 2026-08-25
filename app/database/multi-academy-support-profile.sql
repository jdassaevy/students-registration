-- Run after multi-academy-migration.sql.
-- Grants audited support access to non-auth profile fields only. Passwords remain in Supabase Auth.

create or replace function public.has_active_support_for_user(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_platform_admin()
       and exists(
            select 1
            from public.academy_members m
            join public.support_access_logs s
              on s.academy_id = m.academy_id
             and s.admin_user_id = auth.uid()
             and s.ended_at is null
            where m.user_id = target_user
              and m.role = 'owner'
              and m.is_active = true
       );
$$;

revoke all on function public.has_active_support_for_user(uuid) from public;
grant execute on function public.has_active_support_for_user(uuid) to authenticated;

drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Users or audited support update profile" on public.profiles;
create policy "Users or audited support update profile"
on public.profiles for update to authenticated
using(
    user_id = auth.uid()
    or public.has_active_support_for_user(user_id)
)
with check(
    user_id = auth.uid()
    or public.has_active_support_for_user(user_id)
);
