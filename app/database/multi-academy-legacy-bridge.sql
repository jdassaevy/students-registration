-- Temporary compatibility bridge. `academies` + `profiles` are authoritative.
-- Keep academy_profiles synchronized until all legacy UI has been removed.

create or replace function public.create_legacy_academy_profile_for_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_academy public.academies%rowtype;
    v_profile public.profiles%rowtype;
begin
    if new.role <> 'owner' or new.is_active is not true then
        return new;
    end if;

    select * into v_academy from public.academies where id = new.academy_id;
    select * into v_profile from public.profiles where user_id = new.user_id;

    insert into public.academy_profiles(
        user_id,
        academy_name,
        responsible_name,
        support_phone,
        display_name,
        updated_at
    ) values(
        new.user_id,
        coalesce(v_academy.name, ''),
        coalesce(v_profile.full_name, ''),
        nullif(v_academy.contact_phone, ''),
        coalesce(v_academy.name, ''),
        now()
    )
    on conflict(user_id) do update
    set academy_name = excluded.academy_name,
        responsible_name = excluded.responsible_name,
        support_phone = excluded.support_phone,
        display_name = excluded.display_name,
        updated_at = now();

    return new;
end;
$$;

drop trigger if exists create_legacy_academy_profile_for_owner on public.academy_members;
create trigger create_legacy_academy_profile_for_owner
after insert or update of academy_id, role, is_active on public.academy_members
for each row execute function public.create_legacy_academy_profile_for_owner();

create or replace function public.sync_legacy_profile_from_academy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.academy_profiles ap
       set academy_name = new.name,
           display_name = new.name,
           support_phone = nullif(new.contact_phone, ''),
           updated_at = now()
      from public.academy_members m
     where m.academy_id = new.id
       and m.user_id = ap.user_id
       and m.role = 'owner'
       and m.is_active = true;
    return new;
end;
$$;

drop trigger if exists sync_legacy_profile_from_academy on public.academies;
create trigger sync_legacy_profile_from_academy
after update of name, contact_phone on public.academies
for each row execute function public.sync_legacy_profile_from_academy();

create or replace function public.sync_legacy_profile_from_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.academy_profiles ap
       set responsible_name = new.full_name,
           updated_at = now()
      from public.academy_members m
     where m.user_id = new.user_id
       and m.user_id = ap.user_id
       and m.role = 'owner'
       and m.is_active = true;
    return new;
end;
$$;

drop trigger if exists sync_legacy_profile_from_owner_profile on public.profiles;
create trigger sync_legacy_profile_from_owner_profile
after update of full_name on public.profiles
for each row execute function public.sync_legacy_profile_from_owner_profile();

-- Backfill owners that existed before this compatibility bridge.
insert into public.academy_profiles(user_id, academy_name, responsible_name, support_phone, display_name, updated_at)
select
    m.user_id,
    a.name,
    coalesce(p.full_name, ''),
    nullif(a.contact_phone, ''),
    a.name,
    now()
from public.academy_members m
join public.academies a on a.id = m.academy_id
left join public.profiles p on p.user_id = m.user_id
where m.role = 'owner' and m.is_active = true
on conflict(user_id) do update
set academy_name = excluded.academy_name,
    responsible_name = excluded.responsible_name,
    support_phone = excluded.support_phone,
    display_name = excluded.display_name,
    updated_at = now();

drop policy if exists "Audited support reads legacy academy profile" on public.academy_profiles;
create policy "Audited support reads legacy academy profile"
on public.academy_profiles for select to authenticated
using(public.has_active_support_for_user(user_id));

drop policy if exists "Audited support updates legacy academy profile" on public.academy_profiles;
create policy "Audited support updates legacy academy profile"
on public.academy_profiles for update to authenticated
using(public.has_active_support_for_user(user_id))
with check(public.has_active_support_for_user(user_id));
