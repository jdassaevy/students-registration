-- Make automation history explicitly tenant-scoped.

alter table public.automation_messages
    add column if not exists academy_id uuid;

-- Refuse to guess. Existing history must resolve deterministically from the
-- linked student or receipt, and both must agree when both links exist.
do $$
begin
    if exists (
        select 1
          from public.automation_messages am
          left join public.students s on s.id = am.student_id
          left join public.receipts r on r.id = am.receipt_id
         where am.academy_id is null
           and coalesce(s.academy_id, r.academy_id) is null
    ) then
        raise exception 'Unresolved automation messages exist; refusing academy backfill';
    end if;

    if exists (
        select 1
          from public.automation_messages am
          join public.students s on s.id = am.student_id
          join public.receipts r on r.id = am.receipt_id
         where s.academy_id is distinct from r.academy_id
    ) then
        raise exception 'Conflicting automation messages exist; refusing academy backfill';
    end if;
end $$;

update public.automation_messages am
   set academy_id = s.academy_id
  from public.students s
 where s.id = am.student_id
   and am.academy_id is null;

update public.automation_messages am
   set academy_id = r.academy_id
  from public.receipts r
 where r.id = am.receipt_id
   and am.academy_id is null;

alter table public.automation_messages
    alter column academy_id set not null;

alter table public.automation_messages
    drop constraint if exists automation_messages_academy_id_fkey;

alter table public.automation_messages
    add constraint automation_messages_academy_id_fkey
    foreign key (academy_id)
    references public.academies(id)
    on delete restrict;

create index if not exists automation_messages_academy_id_idx
    on public.automation_messages(academy_id);

alter table public.automation_messages enable row level security;

drop policy if exists "Users read own automation messages" on public.automation_messages;
drop policy if exists "Academy members read automation messages" on public.automation_messages;

create policy "Academy members read automation messages"
on public.automation_messages
for select
to authenticated
using (public.is_academy_member(academy_id));

revoke all on public.automation_messages from anon;
revoke all on public.automation_messages from authenticated;
grant select on public.automation_messages to authenticated;
