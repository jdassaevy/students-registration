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

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_academy_member(uuid) from public;
revoke all on function public.is_academy_owner(uuid) from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_academy_member(uuid) to authenticated;
grant execute on function public.is_academy_owner(uuid) to authenticated;

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
