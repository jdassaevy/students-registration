create extension if not exists pgcrypto;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  place text not null default '',
  schedule text not null default '',
  start_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
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

create table if not exists public.academy_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  academy_name text not null default '',
  responsible_name text not null default '',
  support_phone text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  class_id uuid references public.classes(id) on delete set null,
  person text not null check (person in ('person1','person2')),
  kind text not null check (kind in ('entry','monthly')),
  installment integer not null default 0 check (installment between 0 and 3),
  amount numeric(12,2) not null check (amount >= 0),
  paid_at timestamptz not null,
  receipt_number text not null unique default ('DL-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  status text not null default 'active' check (status in ('active','voided')),
  storage_path text,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists receipts_one_active_payment_idx
on public.receipts(student_id, person, kind, installment)
where status = 'active';

create index if not exists classes_user_id_idx on public.classes(user_id);
create index if not exists students_user_id_idx on public.students(user_id);
create index if not exists students_class_id_idx on public.students(class_id);
create index if not exists payment_events_user_id_idx on public.payment_events(user_id);
create index if not exists payment_events_student_id_idx on public.payment_events(student_id);
create index if not exists payment_events_paid_at_idx on public.payment_events(paid_at);
create index if not exists receipts_user_id_idx on public.receipts(user_id);
create index if not exists receipts_student_id_idx on public.receipts(student_id);
create index if not exists receipts_created_at_idx on public.receipts(created_at);

alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.payment_events enable row level security;
alter table public.academy_profiles enable row level security;
alter table public.receipts enable row level security;

drop policy if exists "Users manage own classes" on public.classes;
create policy "Users manage own classes" on public.classes
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own students" on public.students;
create policy "Users manage own students" on public.students
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own payment events" on public.payment_events;
create policy "Users manage own payment events" on public.payment_events
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own academy profile" on public.academy_profiles;
create policy "Users manage own academy profile" on public.academy_profiles
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users read own receipts" on public.receipts;
create policy "Users read own receipts" on public.receipts
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own receipts" on public.receipts;
create policy "Users insert own receipts" on public.receipts
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own receipts" on public.receipts;
create policy "Users update own receipts" on public.receipts
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.payment_events to authenticated;
grant select, insert, update, delete on public.academy_profiles to authenticated;
grant select, insert, update on public.receipts to authenticated;

create or replace function public.protect_receipt_audit_fields()
returns trigger
language plpgsql
as $$
begin
  if old.receipt_number <> new.receipt_number
     or old.student_id <> new.student_id
     or old.person <> new.person
     or old.kind <> new.kind
     or old.installment <> new.installment
     or old.amount <> new.amount
     or old.paid_at <> new.paid_at then
    raise exception 'Receipt audit fields are immutable';
  end if;
  if old.status = 'voided' and new.status <> 'voided' then
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

-- Migrações seguras para projetos existentes.
alter table public.classes add column if not exists start_date date;
alter table public.students add column if not exists entry_payments jsonb not null default '{"person1":false,"person2":false}'::jsonb;
alter table public.students add column if not exists fees jsonb not null default '{"person1":{"entry":0,"monthly":0},"person2":{"entry":0,"monthly":0}}'::jsonb;
alter table public.students add column if not exists person1_phone text;
alter table public.students add column if not exists person2_phone text;
alter table public.students add column if not exists person1_whatsapp_consent boolean not null default false;
alter table public.students add column if not exists person2_whatsapp_consent boolean not null default false;
alter table public.students add column if not exists person1_whatsapp_consent_at timestamptz;
alter table public.students add column if not exists person2_whatsapp_consent_at timestamptz;

update public.students
set entry_payments = jsonb_build_object(
  'person1', entry_paid,
  'person2', case when person2 is not null then entry_paid else false end
)
where entry_paid = true
  and entry_payments = '{"person1":false,"person2":false}'::jsonb;
