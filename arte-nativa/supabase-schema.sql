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
  payments jsonb not null default '{"person1":[false,false,false],"person2":[false,false,false]}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists classes_user_id_idx on public.classes(user_id);
create index if not exists students_user_id_idx on public.students(user_id);
create index if not exists students_class_id_idx on public.students(class_id);

alter table public.classes enable row level security;
alter table public.students enable row level security;

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

grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.students to authenticated;
