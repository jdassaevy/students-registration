-- Multi-academy foundation. This migration is intentionally additive.
-- Existing user_id columns and academy_profiles remain during the transition.

create extension if not exists pgcrypto;

create table if not exists public.profiles(
    user_id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null default '' check(char_length(full_name) <= 160),
    phone text not null default '' check(char_length(phone) <= 32),
    platform_role text not null default 'user' check(platform_role in ('user', 'platform_admin')),
    subscription_exempt boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.academies(
    id uuid primary key default gen_random_uuid(),
    name text not null check(char_length(name) between 1 and 160),
    contact_email text not null default '' check(char_length(contact_email) <= 320),
    contact_phone text not null default '' check(char_length(contact_phone) <= 32),
    logo_path text,
    subscription_status text not null default 'active' check(subscription_status in ('active', 'trial', 'past_due', 'suspended', 'cancelled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.academy_members(
    academy_id uuid not null references public.academies(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check(role in ('owner', 'teacher')),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    primary key(academy_id, user_id)
);

create table if not exists public.support_access_logs(
    id uuid primary key default gen_random_uuid(),
    admin_user_id uuid not null references auth.users(id) on delete restrict,
    academy_id uuid not null references public.academies(id) on delete restrict,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    reason text,
    metadata jsonb not null default '{}'::jsonb,
    check(ended_at is null or ended_at >= started_at)
);

alter table public.classes
    add column if not exists academy_id uuid references public.academies(id) on delete cascade;
alter table public.students
    add column if not exists academy_id uuid references public.academies(id) on delete cascade;
alter table public.payment_events
    add column if not exists academy_id uuid references public.academies(id) on delete cascade;
alter table public.receipts
    add column if not exists academy_id uuid references public.academies(id) on delete cascade;

create index if not exists classes_academy_id_idx on public.classes(academy_id);
create index if not exists students_academy_id_idx on public.students(academy_id);
create index if not exists payment_events_academy_id_idx on public.payment_events(academy_id);
create index if not exists receipts_academy_id_idx on public.receipts(academy_id);
create index if not exists academy_members_user_id_idx on public.academy_members(user_id);
create index if not exists academy_members_active_idx on public.academy_members(academy_id, is_active);
create index if not exists support_access_logs_admin_idx on public.support_access_logs(admin_user_id, started_at desc);
create index if not exists support_access_logs_academy_idx on public.support_access_logs(academy_id, started_at desc);

alter table public.profiles enable row level security;
alter table public.academies enable row level security;
alter table public.academy_members enable row level security;
alter table public.support_access_logs enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.payment_events enable row level security;
alter table public.receipts enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists(
        select 1
        from public.profiles p
        where p.user_id = auth.uid()
          and p.platform_role = 'platform_admin'
    );
$$;

create or replace function public.is_academy_member(target_academy uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists(
        select 1
        from public.academy_members m
        where m.academy_id = target_academy
          and m.user_id = auth.uid()
          and m.is_active = true
    );
$$;

create or replace function public.is_academy_owner(target_academy uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists(
        select 1
        from public.academy_members m
        where m.academy_id = target_academy
          and m.user_id = auth.uid()
          and m.role = 'owner'
          and m.is_active = true
    );
$$;

create or replace function public.has_active_support_access(target_academy uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_platform_admin()
       and exists(
            select 1
            from public.support_access_logs s
            where s.admin_user_id = auth.uid()
              and s.academy_id = target_academy
              and s.ended_at is null
       );
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_academy_member(uuid) from public;
revoke all on function public.is_academy_owner(uuid) from public;
revoke all on function public.has_active_support_access(uuid) from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_academy_member(uuid) to authenticated;
grant execute on function public.is_academy_owner(uuid) to authenticated;
grant execute on function public.has_active_support_access(uuid) to authenticated;

create or replace function public.bootstrap_academy(
    academy_name text,
    responsible_name text,
    contact_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_academy_id uuid;
    v_email text;
begin
    if v_user_id is null then
        raise exception 'Authentication required';
    end if;
    academy_name := btrim(coalesce(academy_name, ''));
    responsible_name := btrim(coalesce(responsible_name, ''));
    contact_phone := regexp_replace(coalesce(contact_phone, ''), '\D', '', 'g');
    if academy_name = '' then raise exception 'Academy name is required'; end if;
    if responsible_name = '' then raise exception 'Responsible name is required'; end if;
    if char_length(contact_phone) not in (12, 13) or left(contact_phone, 2) <> '55' then
        raise exception 'Valid Brazilian phone is required';
    end if;

    select m.academy_id into v_academy_id
    from public.academy_members m
    where m.user_id = v_user_id and m.is_active = true
    order by m.created_at asc
    limit 1;
    if v_academy_id is not null then
        return v_academy_id;
    end if;

    select u.email into v_email from auth.users u where u.id = v_user_id;

    insert into public.profiles(user_id, full_name, phone)
    values(v_user_id, responsible_name, contact_phone)
    on conflict(user_id) do update
        set full_name = excluded.full_name,
            phone = excluded.phone,
            updated_at = now();

    insert into public.academies(name, contact_email, contact_phone)
    values(academy_name, coalesce(v_email, ''), contact_phone)
    returning id into v_academy_id;

    insert into public.academy_members(academy_id, user_id, role, is_active)
    values(v_academy_id, v_user_id, 'owner', true);

    update public.classes set academy_id = v_academy_id where user_id = v_user_id and academy_id is null;
    update public.students set academy_id = v_academy_id where user_id = v_user_id and academy_id is null;
    update public.payment_events set academy_id = v_academy_id where user_id = v_user_id and academy_id is null;
    update public.receipts set academy_id = v_academy_id where user_id = v_user_id and academy_id is null;

    return v_academy_id;
end;
$$;

revoke all on function public.bootstrap_academy(text, text, text) from public;
grant execute on function public.bootstrap_academy(text, text, text) to authenticated;

create or replace function public.assign_tenant_academy_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_academy_id uuid;
begin
    if auth.uid() is null then
        return new;
    end if;

    if new.academy_id is null then
        select m.academy_id into v_academy_id
        from public.academy_members m
        where m.user_id = auth.uid() and m.is_active = true
        order by case when m.role = 'owner' then 0 else 1 end, m.created_at asc
        limit 1;

        if v_academy_id is null and public.is_platform_admin() then
            select s.academy_id into v_academy_id
            from public.support_access_logs s
            where s.admin_user_id = auth.uid() and s.ended_at is null
            order by s.started_at desc
            limit 1;
        end if;

        if v_academy_id is null then
            raise exception 'No active academy context';
        end if;
        new.academy_id := v_academy_id;
    elsif not public.is_academy_member(new.academy_id)
       and not public.has_active_support_access(new.academy_id) then
        raise exception 'Academy access denied';
    end if;

    return new;
end;
$$;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if auth.uid() is not null
       and (new.platform_role is distinct from old.platform_role
            or new.subscription_exempt is distinct from old.subscription_exempt) then
        raise exception 'Platform privileges can only be changed by backend administration';
    end if;
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
before update on public.profiles
for each row execute function public.protect_profile_privileges();

drop trigger if exists assign_classes_academy on public.classes;
create trigger assign_classes_academy before insert on public.classes
for each row execute function public.assign_tenant_academy_id();
drop trigger if exists assign_students_academy on public.students;
create trigger assign_students_academy before insert on public.students
for each row execute function public.assign_tenant_academy_id();
drop trigger if exists assign_payment_events_academy on public.payment_events;
create trigger assign_payment_events_academy before insert on public.payment_events
for each row execute function public.assign_tenant_academy_id();
drop trigger if exists assign_receipts_academy on public.receipts;
create trigger assign_receipts_academy before insert on public.receipts
for each row execute function public.assign_tenant_academy_id();

-- Replace legacy per-user policies with tenant policies.
drop policy if exists "Users manage own classes" on public.classes;
drop policy if exists "Users manage own students" on public.students;
drop policy if exists "Users manage own payment events" on public.payment_events;
drop policy if exists "Users read own receipts" on public.receipts;
drop policy if exists "Users insert own receipts" on public.receipts;
drop policy if exists "Users update own receipts" on public.receipts;

drop policy if exists "Academy access classes" on public.classes;
create policy "Academy access classes" on public.classes for all to authenticated
using(public.is_academy_member(academy_id) or public.has_active_support_access(academy_id))
with check(public.is_academy_member(academy_id) or public.has_active_support_access(academy_id));

drop policy if exists "Academy access students" on public.students;
create policy "Academy access students" on public.students for all to authenticated
using(public.is_academy_member(academy_id) or public.has_active_support_access(academy_id))
with check(public.is_academy_member(academy_id) or public.has_active_support_access(academy_id));

drop policy if exists "Academy access payment events" on public.payment_events;
create policy "Academy access payment events" on public.payment_events for all to authenticated
using(public.is_academy_member(academy_id) or public.has_active_support_access(academy_id))
with check(public.is_academy_member(academy_id) or public.has_active_support_access(academy_id));

drop policy if exists "Academy access receipts" on public.receipts;
create policy "Academy access receipts" on public.receipts for all to authenticated
using(public.is_academy_member(academy_id) or public.has_active_support_access(academy_id))
with check(public.is_academy_member(academy_id) or public.has_active_support_access(academy_id));

drop policy if exists "Profiles visible to self and platform admin" on public.profiles;
create policy "Profiles visible to self and platform admin" on public.profiles for select to authenticated
using(user_id = auth.uid() or public.is_platform_admin());
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated
using(user_id = auth.uid()) with check(user_id = auth.uid());

drop policy if exists "Academies visible to members and platform admin" on public.academies;
create policy "Academies visible to members and platform admin" on public.academies for select to authenticated
using(public.is_academy_member(id) or public.is_platform_admin());
drop policy if exists "Owners and support update academy" on public.academies;
create policy "Owners and support update academy" on public.academies for update to authenticated
using(public.is_academy_owner(id) or public.has_active_support_access(id))
with check(public.is_academy_owner(id) or public.has_active_support_access(id));

drop policy if exists "Memberships visible to participants" on public.academy_members;
create policy "Memberships visible to participants" on public.academy_members for select to authenticated
using(user_id = auth.uid() or public.is_academy_owner(academy_id) or public.is_platform_admin());

drop policy if exists "Platform admins read support logs" on public.support_access_logs;
create policy "Platform admins read support logs" on public.support_access_logs for select to authenticated
using(public.is_platform_admin() and admin_user_id = auth.uid());
drop policy if exists "Platform admins start support access" on public.support_access_logs;
create policy "Platform admins start support access" on public.support_access_logs for insert to authenticated
with check(public.is_platform_admin() and admin_user_id = auth.uid() and ended_at is null);
drop policy if exists "Platform admins close support access" on public.support_access_logs;
create policy "Platform admins close support access" on public.support_access_logs for update to authenticated
using(public.is_platform_admin() and admin_user_id = auth.uid())
with check(public.is_platform_admin() and admin_user_id = auth.uid());

grant select, update on public.profiles to authenticated;
grant select, update on public.academies to authenticated;
grant select on public.academy_members to authenticated;
grant select, insert, update on public.support_access_logs to authenticated;
