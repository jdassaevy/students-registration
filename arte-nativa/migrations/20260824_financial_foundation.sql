-- Financial foundation v2
-- Adds normalized charges without removing the legacy JSON payment fields.

create table if not exists public.financial_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  person_slot text not null check (person_slot in ('person1', 'person2')),
  charge_type text not null check (charge_type in ('entry', 'monthly', 'other')),
  installment_number integer check (installment_number is null or installment_number > 0),
  competence text not null default '',
  description text not null default '',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  paid_amount numeric(12,2) check (paid_amount is null or paid_amount >= 0),
  paid_at timestamptz,
  payment_method text,
  notes text not null default '',
  source text not null default 'manual' check (source in ('manual', 'legacy', 'automatic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_charges_person2_requires_student_person2
    check (person_slot <> 'person2' or person_slot = 'person2')
);

create index if not exists financial_charges_user_id_idx
  on public.financial_charges(user_id);
create index if not exists financial_charges_student_id_idx
  on public.financial_charges(student_id);
create index if not exists financial_charges_status_idx
  on public.financial_charges(user_id, status);
create index if not exists financial_charges_due_date_idx
  on public.financial_charges(user_id, due_date);

create unique index if not exists financial_charges_legacy_unique_idx
  on public.financial_charges(student_id, person_slot, charge_type, coalesce(installment_number, 0))
  where source = 'legacy';

alter table public.financial_charges enable row level security;

drop policy if exists "Users manage own financial charges" on public.financial_charges;
create policy "Users manage own financial charges" on public.financial_charges
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.financial_charges to authenticated;

create or replace function public.set_financial_charge_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists financial_charges_set_updated_at on public.financial_charges;
create trigger financial_charges_set_updated_at
before update on public.financial_charges
for each row execute function public.set_financial_charge_updated_at();

-- Migrate existing entry charges. Payment dates and due dates did not exist in the old model,
-- so they intentionally remain null instead of inventing historical dates.
insert into public.financial_charges (
  user_id, student_id, person_slot, charge_type, installment_number,
  competence, description, amount, status, paid_amount, source
)
select
  s.user_id,
  s.id,
  p.person_slot,
  'entry',
  null,
  'Inscrição',
  'Inscrição',
  p.entry_value,
  case when p.entry_paid then 'paid' else 'pending' end,
  case when p.entry_paid then p.entry_value else null end,
  'legacy'
from public.students s
cross join lateral (
  values
    ('person1'::text,
      coalesce((s.fees->'person1'->>'entry')::numeric, 0),
      coalesce((s.entry_payments->>'person1')::boolean, s.entry_paid)),
    ('person2'::text,
      coalesce((s.fees->'person2'->>'entry')::numeric, 0),
      coalesce((s.entry_payments->>'person2')::boolean, false))
) as p(person_slot, entry_value, entry_paid)
where (p.person_slot = 'person1' or nullif(trim(s.person2), '') is not null)
  and (p.entry_value > 0 or p.entry_paid)
on conflict do nothing;

-- Migrate the three legacy monthly installments for each existing person.
insert into public.financial_charges (
  user_id, student_id, person_slot, charge_type, installment_number,
  competence, description, amount, status, paid_amount, source
)
select
  s.user_id,
  s.id,
  p.person_slot,
  'monthly',
  m.installment_number,
  'Mensalidade ' || m.installment_number,
  'Mensalidade ' || m.installment_number,
  p.monthly_value,
  case when m.is_paid then 'paid' else 'pending' end,
  case when m.is_paid then p.monthly_value else null end,
  'legacy'
from public.students s
cross join lateral (
  values
    ('person1'::text, coalesce((s.fees->'person1'->>'monthly')::numeric, 0), coalesce(s.payments->'person1', '[false,false,false]'::jsonb)),
    ('person2'::text, coalesce((s.fees->'person2'->>'monthly')::numeric, 0), coalesce(s.payments->'person2', '[false,false,false]'::jsonb))
) as p(person_slot, monthly_value, payment_array)
cross join lateral (
  values
    (1, coalesce((p.payment_array->>0)::boolean, false)),
    (2, coalesce((p.payment_array->>1)::boolean, false)),
    (3, coalesce((p.payment_array->>2)::boolean, false))
) as m(installment_number, is_paid)
where (p.person_slot = 'person1' or nullif(trim(s.person2), '') is not null)
  and (p.monthly_value > 0 or m.is_paid)
on conflict do nothing;
