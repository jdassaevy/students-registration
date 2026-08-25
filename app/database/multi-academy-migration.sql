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
