create table if not exists public.automation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  receipt_id uuid references public.receipts(id) on delete set null,
  person text check (person in ('person1','person2')),
  automation_type text not null check (automation_type in (
    'reminder_before_due',
    'due_today',
    'overdue',
    'payment_confirmation',
    'receipt_document',
    'payment_voided'
  )),
  idempotency_key text,
  planned_at timestamptz,
  executed_at timestamptz,
  provider_message_id text,
  status text not null default 'pending' check (status in ('pending','sent','delivered','read','failed','skipped')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists automation_messages_idempotency_idx
  on public.automation_messages(user_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists automation_messages_user_id_idx on public.automation_messages(user_id);
create index if not exists automation_messages_student_id_idx on public.automation_messages(student_id);
create index if not exists automation_messages_provider_id_idx on public.automation_messages(provider_message_id);
create index if not exists automation_messages_status_idx on public.automation_messages(status);

alter table public.automation_messages enable row level security;

drop policy if exists "Users read own automation messages" on public.automation_messages;
create policy "Users read own automation messages" on public.automation_messages
for select to authenticated
using ((select auth.uid()) = user_id);

grant select on public.automation_messages to authenticated;
