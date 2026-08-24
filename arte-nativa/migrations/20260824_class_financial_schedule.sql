alter table public.classes add column if not exists start_date date;
alter table public.classes add column if not exists installment_count integer not null default 3 check (installment_count > 0 and installment_count <= 36);
create index if not exists classes_user_start_date_idx on public.classes(user_id, start_date);