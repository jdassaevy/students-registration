-- Tenant-owned academy institutional identity.
-- Additive by design: academy_profiles remains intact for rollback/compatibility.

alter table public.academies
    add column if not exists responsible_name text not null default '',
    add column if not exists support_phone text,
    add column if not exists display_name text;

-- Backfill legacy user-owned academy profile data into the academy tenant.
-- If an academy ever has more than one active owner, use the earliest membership
-- deterministically and never overwrite an already-populated academy value.
with legacy_profile as (
    select distinct on (member.academy_id)
        member.academy_id,
        profile.academy_name,
        profile.responsible_name,
        profile.support_phone,
        profile.display_name
    from public.academy_members member
    join public.academy_profiles profile
      on profile.user_id = member.user_id
    where member.role = 'owner'
      and member.is_active = true
    order by member.academy_id, member.created_at asc
)
update public.academies academy
set
    name = coalesce(nullif(btrim(academy.name), ''), nullif(btrim(profile.academy_name), ''), academy.name),
    responsible_name = coalesce(nullif(btrim(academy.responsible_name), ''), profile.responsible_name, ''),
    support_phone = coalesce(nullif(btrim(academy.support_phone), ''), profile.support_phone),
    display_name = coalesce(nullif(btrim(academy.display_name), ''), profile.display_name),
    updated_at = now()
from legacy_profile profile
where profile.academy_id = academy.id
  and (
      btrim(academy.name) = ''
      or btrim(academy.responsible_name) = ''
      or academy.support_phone is null
      or btrim(coalesce(academy.support_phone, '')) = ''
      or academy.display_name is null
      or btrim(coalesce(academy.display_name, '')) = ''
  );

create or replace function public.is_academy_owner(target_academy uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select target_academy is not null
       and auth.uid() is not null
       and exists (
            select 1
            from public.academy_members member
            where member.academy_id = target_academy
              and member.user_id = auth.uid()
              and member.role = 'owner'
              and member.is_active = true
       );
$$;

revoke all on function public.is_academy_owner(uuid) from public;
grant execute on function public.is_academy_owner(uuid) to authenticated;

drop policy if exists "Owners update own academy" on public.academies;
create policy "Owners update own academy"
on public.academies
for update
to authenticated
using (public.is_academy_owner(id))
with check (public.is_academy_owner(id));

grant update (name, responsible_name, support_phone, display_name, updated_at)
on public.academies to authenticated;
