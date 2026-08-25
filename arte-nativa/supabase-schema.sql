create extension if not exists pgcrypto;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  place text not null default '',
  schedule text not null default '',
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

create index if not exists classes_user_id_idx on public.classes(user_id);
create index if not exists students_user_id_idx on public.students(user_id);
create index if not exists students_class_id_idx on public.students(class_id);
create index if not exists payment_events_user_id_idx on public.payment_events(user_id);
create index if not exists payment_events_student_id_idx on public.payment_events(student_id);
create index if not exists payment_events_paid_at_idx on public.payment_events(paid_at);

alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.payment_events enable row level security;

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

grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.payment_events to authenticated;

-- Migração segura para projetos que já possuem a tabela students.
alter table public.students
  add column if not exists entry_payments jsonb not null
  default '{"person1":false,"person2":false}'::jsonb;

alter table public.students
  add column if not exists fees jsonb not null
  default '{"person1":{"entry":0,"monthly":0},"person2":{"entry":0,"monthly":0}}'::jsonb;

-- Mantém como recebidas as inscrições que já estavam marcadas como pagas.
update public.students
set entry_payments = jsonb_build_object(
  'person1', entry_paid,
  'person2', case when person2 is not null then entry_paid else false end
)
where entry_paid = true
  and entry_payments = '{"person1":false,"person2":false}'::jsonb;
