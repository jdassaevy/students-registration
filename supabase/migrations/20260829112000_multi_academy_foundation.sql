-- Stage 1 multi-academy foundation.
-- Additive by design: legacy user_id columns and academy_profiles remain intact.

create extension if not exists pgcrypto;

create table if not exists public.academies (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(btrim(name)) between 1 and 160),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.academy_members (
    academy_id uuid not null references public.academies(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'owner' check (role in ('owner')),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    primary key (academy_id, user_id)
);

create index if not exists academy_members_user_id_idx
    on public.academy_members(user_id);
create index if not exists academy_members_active_idx
    on public.academy_members(user_id, is_active);

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

alter table public.academies enable row level security;
alter table public.academy_members enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.payment_events enable row level security;
alter table public.receipts enable row level security;

create or replace function public.is_academy_member(target_academy uuid)
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
              and member.is_active = true
       );
$$;

revoke all on function public.is_academy_member(uuid) from public;
grant execute on function public.is_academy_member(uuid) to authenticated;

create or replace function public.bootstrap_academy(academy_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_academy_id uuid;
    v_academy_name text := btrim(coalesce(academy_name, ''));
begin
    if v_user_id is null then
        raise exception 'Authentication required';
    end if;

    if char_length(v_academy_name) not between 1 and 160 then
        raise exception 'Academy name must contain between 1 and 160 characters';
    end if;

    select member.academy_id
      into v_academy_id
      from public.academy_members member
     where member.user_id = v_user_id
       and member.is_active = true
     order by member.created_at asc
     limit 1;

    if v_academy_id is not null then
        return v_academy_id;
    end if;

    insert into public.academies(name)
    values (v_academy_name)
    returning id into v_academy_id;

    insert into public.academy_members(academy_id, user_id, role, is_active)
    values (v_academy_id, v_user_id, 'owner', true);

    update public.classes
       set academy_id = v_academy_id
     where user_id = v_user_id
       and academy_id is null;

    update public.students
       set academy_id = v_academy_id
     where user_id = v_user_id
       and academy_id is null;

    update public.payment_events
       set academy_id = v_academy_id
     where user_id = v_user_id
       and academy_id is null;

    update public.receipts
       set academy_id = v_academy_id
     where user_id = v_user_id
       and academy_id is null;

    return v_academy_id;
end;
$$;

revoke all on function public.bootstrap_academy(text) from public;
grant execute on function public.bootstrap_academy(text) to authenticated;

drop policy if exists "Members read own academy memberships" on public.academy_members;
create policy "Members read own academy memberships"
on public.academy_members
for select
to authenticated
using ((select auth.uid()) = user_id and is_active = true);

drop policy if exists "Members read own academy" on public.academies;
create policy "Members read own academy"
on public.academies
for select
to authenticated
using (public.is_academy_member(id));

grant select on public.academies to authenticated;
grant select on public.academy_members to authenticated;

-- Replace user-only policies with tenant policies. The user_id fallback applies only
-- while academy_id is null, preserving legacy access until bootstrap/rollback.
drop policy if exists "Users manage own classes" on public.classes;
drop policy if exists "Academy members manage classes" on public.classes;
create policy "Academy members manage classes"
on public.classes
for all
to authenticated
using (
    public.is_academy_member(academy_id)
    or (academy_id is null and (select auth.uid()) = user_id)
)
with check (
    public.is_academy_member(academy_id)
    or (academy_id is null and (select auth.uid()) = user_id)
);

drop policy if exists "Users manage own students" on public.students;
drop policy if exists "Academy members manage students" on public.students;
create policy "Academy members manage students"
on public.students
for all
to authenticated
using (
    public.is_academy_member(academy_id)
    or (academy_id is null and (select auth.uid()) = user_id)
)
with check (
    public.is_academy_member(academy_id)
    or (academy_id is null and (select auth.uid()) = user_id)
);

drop policy if exists "Users manage own payment events" on public.payment_events;
drop policy if exists "Academy members manage payment events" on public.payment_events;
create policy "Academy members manage payment events"
on public.payment_events
for all
to authenticated
using (
    public.is_academy_member(academy_id)
    or (academy_id is null and (select auth.uid()) = user_id)
)
with check (
    public.is_academy_member(academy_id)
    or (academy_id is null and (select auth.uid()) = user_id)
);

drop policy if exists "Users read own receipts" on public.receipts;
drop policy if exists "Users insert own receipts" on public.receipts;
drop policy if exists "Users update own receipts" on public.receipts;
drop policy if exists "Academy members read receipts" on public.receipts;
drop policy if exists "Academy members insert receipts" on public.receipts;
drop policy if exists "Academy members update receipts" on public.receipts;

create policy "Academy members read receipts"
on public.receipts
for select
to authenticated
using (
    public.is_academy_member(academy_id)
    or (academy_id is null and (select auth.uid()) = user_id)
);

create policy "Academy members insert receipts"
on public.receipts
for insert
to authenticated
with check (
    public.is_academy_member(academy_id)
    or (academy_id is null and (select auth.uid()) = user_id)
);

create policy "Academy members update receipts"
on public.receipts
for update
to authenticated
using (
    public.is_academy_member(academy_id)
    or (academy_id is null and (select auth.uid()) = user_id)
)
with check (
    public.is_academy_member(academy_id)
    or (academy_id is null and (select auth.uid()) = user_id)
);
