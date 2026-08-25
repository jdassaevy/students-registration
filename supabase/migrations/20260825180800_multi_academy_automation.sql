-- Run after multi-academy-migration.sql and the existing automation migrations.

alter table public.automation_messages
    add column if not exists academy_id uuid references public.academies(id) on delete cascade;
alter table public.automation_settings
    add column if not exists id uuid not null default gen_random_uuid();
alter table public.automation_settings
    add column if not exists academy_id uuid references public.academies(id) on delete cascade;

-- user_id was the old primary key. Keep it as audit/compatibility data, but allow
-- the same support/admin account to work with settings from multiple academies.
alter table public.automation_settings drop constraint if exists automation_settings_pkey;
alter table public.automation_settings add constraint automation_settings_pkey primary key(id);
create index if not exists automation_settings_user_id_idx on public.automation_settings(user_id);

create index if not exists automation_messages_academy_id_idx
    on public.automation_messages(academy_id);
drop index if exists public.automation_messages_idempotency_idx;
create unique index if not exists automation_messages_academy_idempotency_idx
    on public.automation_messages(academy_id, idempotency_key)
    where academy_id is not null and idempotency_key is not null;
create unique index if not exists automation_settings_one_per_academy_idx
    on public.automation_settings(academy_id)
    where academy_id is not null;

create or replace function public.sync_owner_legacy_data_to_academy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.role <> 'owner' or new.is_active is not true then
        return new;
    end if;

    update public.automation_messages
       set academy_id = new.academy_id
     where user_id = new.user_id
       and academy_id is null;

    update public.automation_settings
       set academy_id = new.academy_id
     where user_id = new.user_id
       and academy_id is null;

    return new;
end;
$$;

drop trigger if exists sync_owner_legacy_data_to_academy on public.academy_members;
create trigger sync_owner_legacy_data_to_academy
after insert or update of academy_id, role, is_active on public.academy_members
for each row execute function public.sync_owner_legacy_data_to_academy();

-- Existing academies/members created before this extension are backfilled here.
update public.automation_messages am
set academy_id = (
    select m.academy_id
    from public.academy_members m
    where m.user_id = am.user_id
      and m.role = 'owner'
      and m.is_active = true
    order by m.created_at asc
    limit 1
)
where am.academy_id is null
  and exists(
      select 1 from public.academy_members m
      where m.user_id = am.user_id and m.role = 'owner' and m.is_active = true
  );

update public.automation_settings aset
set academy_id = (
    select m.academy_id
    from public.academy_members m
    where m.user_id = aset.user_id
      and m.role = 'owner'
      and m.is_active = true
    order by m.created_at asc
    limit 1
)
where aset.academy_id is null
  and exists(
      select 1 from public.academy_members m
      where m.user_id = aset.user_id and m.role = 'owner' and m.is_active = true
  );

drop trigger if exists assign_automation_messages_academy on public.automation_messages;
create trigger assign_automation_messages_academy
before insert on public.automation_messages
for each row execute function public.assign_tenant_academy_id();

drop trigger if exists assign_automation_settings_academy on public.automation_settings;
create trigger assign_automation_settings_academy
before insert on public.automation_settings
for each row execute function public.assign_tenant_academy_id();

drop policy if exists "Users read own automation messages" on public.automation_messages;
drop policy if exists "Academy access automation messages" on public.automation_messages;
create policy "Academy access automation messages"
on public.automation_messages for select to authenticated
using(
    public.is_academy_member(academy_id)
    or public.has_active_support_access(academy_id)
);

drop policy if exists "Users manage own automation settings" on public.automation_settings;
drop policy if exists "Academy access automation settings" on public.automation_settings;
create policy "Academy access automation settings"
on public.automation_settings for all to authenticated
using(
    public.is_academy_member(academy_id)
    or public.has_active_support_access(academy_id)
)
with check(
    public.is_academy_member(academy_id)
    or public.has_active_support_access(academy_id)
);

grant select on public.automation_messages to authenticated;
grant select, insert, update on public.automation_settings to authenticated;
