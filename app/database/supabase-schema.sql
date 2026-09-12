-- Canonical reference schema for new/local environments.
-- Existing deployments MUST use supabase/migrations in timestamp order.
-- This file is documentation/bootstrap reference; migrations are authoritative.

create extension if not exists pgcrypto;

create table if not exists public.academies (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(btrim(name)) between 1 and 160),
    responsible_name text not null default '',
    support_phone text,
    display_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.academy_members (
    academy_id uuid not null references public.academies(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'owner' check (role = 'owner'),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    primary key (academy_id, user_id)
);

create table if not exists public.academy_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    academy_name text not null default '',
    responsible_name text not null default '',
    support_phone text,
    display_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.classes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    academy_id uuid references public.academies(id) on delete cascade,
    name text not null check (char_length(name) between 1 and 120),
    place text not null default '',
    schedule text not null default '',
    start_date date,
    created_at timestamptz not null default now()
);

create table if not exists public.students (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    academy_id uuid references public.academies(id) on delete cascade,
    class_id uuid references public.classes(id) on delete set null,
    person1 text not null check (char_length(person1) between 1 and 160),
    person2 text,
    entry_paid boolean not null default false,
    entry_payments jsonb not null default '{"person1":false,"person2":false}'::jsonb,
    fees jsonb not null default '{"person1":{"entry":0,"monthly":0},"person2":{"entry":0,"monthly":0}}'::jsonb,
    payments jsonb not null default '{"person1":[false,false,false],"person2":[false,false,false]}'::jsonb,
    person1_phone text,
    person2_phone text,
    person1_whatsapp_consent boolean not null default false,
    person2_whatsapp_consent boolean not null default false,
    person1_whatsapp_consent_at timestamptz,
    person2_whatsapp_consent_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.payment_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    academy_id uuid references public.academies(id) on delete cascade,
    student_id uuid not null references public.students(id) on delete cascade,
    class_id uuid references public.classes(id) on delete set null,
    person text not null check (person in ('person1', 'person2')),
    kind text not null check (kind in ('entry', 'monthly')),
    installment integer not null default 0 check (installment between 0 and 3),
    amount numeric(12,2) not null default 0 check (amount >= 0),
    paid_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (student_id, person, kind, installment)
);

create table if not exists public.receipts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    academy_id uuid references public.academies(id) on delete cascade,
    student_id uuid references public.students(id) on delete set null,
    class_id uuid references public.classes(id) on delete set null,
    person text not null check (person in ('person1', 'person2')),
    kind text not null check (kind in ('entry', 'monthly')),
    installment integer not null default 0 check (installment between 0 and 3),
    amount numeric(12,2) not null check (amount >= 0),
    paid_at timestamptz not null,
    receipt_number text not null unique default (
        'DL-' || to_char(now(), 'YYYYMMDD') || '-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
    ),
    status text not null default 'active' check (status in ('active', 'voided')),
    storage_path text,
    voided_at timestamptz,
    created_at timestamptz not null default now()
);

create unique index if not exists receipts_one_active_payment_idx
    on public.receipts(student_id, person, kind, installment)
    where status = 'active';

create table if not exists public.automation_settings (
    user_id uuid primary key references auth.users(id) on delete cascade,
    reminders_enabled boolean not null default true,
    payment_confirmation_enabled boolean not null default true,
    receipt_delivery_enabled boolean not null default true,
    void_notification_enabled boolean not null default true,
    updated_at timestamptz not null default now()
);

create table if not exists public.automation_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    academy_id uuid not null references public.academies(id) on delete restrict,
    student_id uuid references public.students(id) on delete set null,
    class_id uuid references public.classes(id) on delete set null,
    receipt_id uuid references public.receipts(id) on delete set null,
    person text check (person in ('person1', 'person2')),
    automation_type text not null check (automation_type in (
        'reminder_before_due', 'due_today', 'overdue',
        'payment_confirmation', 'receipt_document', 'payment_voided'
    )),
    idempotency_key text,
    planned_at timestamptz,
    executed_at timestamptz,
    provider_message_id text,
    status text not null default 'pending' check (status in (
        'pending', 'sent', 'delivered', 'read', 'failed', 'skipped'
    )),
    error_code text,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists automation_messages_academy_id_idx
    on public.automation_messages(academy_id);

-- Historical snapshot retained when the old students.archived_at column was retired.
-- No direct client grants: this is internal audit history only.
create table if not exists public.student_archive_history (
    student_id uuid not null,
    academy_id uuid not null,
    archived_at timestamptz not null,
    primary key (student_id, archived_at)
);

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

create or replace function public.protect_receipt_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    if old.receipt_number is distinct from new.receipt_number
       or (
            old.student_id is distinct from new.student_id
            and not (old.student_id is not null and new.student_id is null)
       )
       or old.person is distinct from new.person
       or old.kind is distinct from new.kind
       or old.installment is distinct from new.installment
       or old.amount is distinct from new.amount
       or old.paid_at is distinct from new.paid_at then
        raise exception 'Receipt audit fields are immutable';
    end if;

    if old.status = 'voided' and new.status is distinct from 'voided' then
        raise exception 'Voided receipt cannot be reactivated';
    end if;

    if old.status = 'active' and new.status = 'voided' and new.voided_at is null then
        new.voided_at := now();
    end if;

    return new;
end;
$$;

drop trigger if exists protect_receipt_audit_fields on public.receipts;
create trigger protect_receipt_audit_fields
before update on public.receipts
for each row execute function public.protect_receipt_audit_fields();

alter table public.academies enable row level security;
alter table public.academy_members enable row level security;
alter table public.academy_profiles enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.payment_events enable row level security;
alter table public.receipts enable row level security;
alter table public.automation_settings enable row level security;
alter table public.automation_messages enable row level security;
alter table public.student_archive_history enable row level security;

create policy "No client access to archive history"
on public.student_archive_history for all to authenticated
using (false)
with check (false);

create policy "Members read own academy"
on public.academies for select to authenticated
using (public.is_academy_member(id));

create policy "Owners update own academy"
on public.academies for update to authenticated
using (public.is_academy_owner(id))
with check (public.is_academy_owner(id));

create policy "Members read own academy memberships"
on public.academy_members for select to authenticated
using (auth.uid() = user_id and is_active = true);

create policy "Users manage own academy profile"
on public.academy_profiles for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Academy members manage classes"
on public.classes for all to authenticated
using (public.is_academy_member(academy_id))
with check (public.is_academy_member(academy_id));

create policy "Academy members manage students"
on public.students for all to authenticated
using (public.is_academy_member(academy_id))
with check (public.is_academy_member(academy_id));

create policy "Academy members manage payment events"
on public.payment_events for all to authenticated
using (public.is_academy_member(academy_id))
with check (public.is_academy_member(academy_id));

create policy "Academy members read receipts"
on public.receipts for select to authenticated
using (public.is_academy_member(academy_id));

create policy "Academy members insert receipts"
on public.receipts for insert to authenticated
with check (public.is_academy_member(academy_id));

create policy "Academy members update receipts"
on public.receipts for update to authenticated
using (public.is_academy_member(academy_id))
with check (public.is_academy_member(academy_id));

create policy "Users manage own automation settings"
on public.automation_settings for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Academy members read automation messages"
on public.automation_messages for select to authenticated
using (public.is_academy_member(academy_id));

-- Defense in depth: anonymous clients receive no direct application-table privileges.
revoke all on public.academies from anon;
revoke all on public.academy_members from anon;
revoke all on public.academy_profiles from anon;
revoke all on public.classes from anon;
revoke all on public.students from anon;
revoke all on public.payment_events from anon;
revoke all on public.receipts from anon;
revoke all on public.automation_settings from anon;
revoke all on public.automation_messages from anon;
revoke all on public.student_archive_history from anon;

revoke all on public.academies from authenticated;
revoke all on public.academy_members from authenticated;
revoke all on public.academy_profiles from authenticated;
revoke all on public.classes from authenticated;
revoke all on public.students from authenticated;
revoke all on public.payment_events from authenticated;
revoke all on public.receipts from authenticated;
revoke all on public.automation_settings from authenticated;
revoke all on public.automation_messages from authenticated;
revoke all on public.student_archive_history from authenticated;

grant select, update on public.academies to authenticated;
grant select on public.academy_members to authenticated;
grant select, insert, update, delete on public.academy_profiles to authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.payment_events to authenticated;
grant select, insert, update on public.receipts to authenticated;
grant select, insert, update on public.automation_settings to authenticated;
grant select on public.automation_messages to authenticated;

revoke execute on function public.is_academy_member(uuid) from public, anon;
revoke execute on function public.is_academy_owner(uuid) from public, anon;
revoke execute on function public.protect_receipt_audit_fields() from public, anon, authenticated;
grant execute on function public.is_academy_member(uuid) to authenticated;
grant execute on function public.is_academy_owner(uuid) to authenticated;
