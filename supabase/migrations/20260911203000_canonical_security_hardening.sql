-- Canonical tenant-security hardening.
-- DDL/permissions only: no business-row INSERT/UPDATE/DELETE in this migration.

alter table public.academies enable row level security;
alter table public.academy_members enable row level security;
alter table public.academy_profiles enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.payment_events enable row level security;
alter table public.receipts enable row level security;
alter table public.automation_settings enable row level security;
alter table public.automation_messages enable row level security;

-- Tenant-owned business resources: membership is the only authorization path.
drop policy if exists "Users manage own classes" on public.classes;
drop policy if exists "Academy members manage classes" on public.classes;
create policy "Academy members manage classes"
on public.classes
for all
to authenticated
using (public.is_academy_member(academy_id))
with check (public.is_academy_member(academy_id));

drop policy if exists "Users manage own students" on public.students;
drop policy if exists "Academy members manage students" on public.students;
create policy "Academy members manage students"
on public.students
for all
to authenticated
using (public.is_academy_member(academy_id))
with check (public.is_academy_member(academy_id));

drop policy if exists "Users manage own payment events" on public.payment_events;
drop policy if exists "Academy members manage payment events" on public.payment_events;
create policy "Academy members manage payment events"
on public.payment_events
for all
to authenticated
using (public.is_academy_member(academy_id))
with check (public.is_academy_member(academy_id));

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
using (public.is_academy_member(academy_id));

create policy "Academy members insert receipts"
on public.receipts
for insert
to authenticated
with check (public.is_academy_member(academy_id));

create policy "Academy members update receipts"
on public.receipts
for update
to authenticated
using (public.is_academy_member(academy_id))
with check (public.is_academy_member(academy_id));

-- Atomic class deletion, scoped strictly to an active academy membership.
create or replace function public.delete_class_with_students(target_class_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_academy_id uuid;
    v_deleted_students integer := 0;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    select c.academy_id
      into v_academy_id
      from public.classes c
     where c.id = target_class_id
     for update;

    if not found then
        return 0;
    end if;

    if v_academy_id is null or not public.is_academy_member(v_academy_id) then
        raise exception 'Forbidden' using errcode = '42501';
    end if;

    delete from public.students s
     where s.class_id = target_class_id
       and s.academy_id = v_academy_id;

    get diagnostics v_deleted_students = row_count;

    delete from public.classes c
     where c.id = target_class_id
       and c.academy_id = v_academy_id;

    return v_deleted_students;
end;
$$;

-- Receipt audit fields stay immutable; nullable student_id is intentional so
-- receipt history survives student deletion.
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

-- Defense in depth: anonymous clients have no direct application-table grants.
revoke all on public.academies from anon;
revoke all on public.academy_members from anon;
revoke all on public.academy_profiles from anon;
revoke all on public.classes from anon;
revoke all on public.students from anon;
revoke all on public.payment_events from anon;
revoke all on public.receipts from anon;
revoke all on public.automation_settings from anon;
revoke all on public.automation_messages from anon;

-- Rebuild the authenticated grant matrix from zero so future default grants do
-- not silently widen access.
revoke all on public.academies from authenticated;
revoke all on public.academy_members from authenticated;
revoke all on public.academy_profiles from authenticated;
revoke all on public.classes from authenticated;
revoke all on public.students from authenticated;
revoke all on public.payment_events from authenticated;
revoke all on public.receipts from authenticated;
revoke all on public.automation_settings from authenticated;
revoke all on public.automation_messages from authenticated;

grant select, update on public.academies to authenticated;
grant select on public.academy_members to authenticated;
grant select, insert, update, delete on public.academy_profiles to authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.payment_events to authenticated;
grant select, insert, update on public.receipts to authenticated;
grant select, insert, update on public.automation_settings to authenticated;
grant select on public.automation_messages to authenticated;

-- SECURITY DEFINER helpers are callable only where the application/RLS needs them.
revoke execute on function public.bootstrap_academy(text) from public;
revoke execute on function public.bootstrap_academy(text) from anon;
grant execute on function public.bootstrap_academy(text) to authenticated;

revoke execute on function public.is_academy_member(uuid) from public;
revoke execute on function public.is_academy_member(uuid) from anon;
grant execute on function public.is_academy_member(uuid) to authenticated;

revoke execute on function public.is_academy_owner(uuid) from public;
revoke execute on function public.is_academy_owner(uuid) from anon;
grant execute on function public.is_academy_owner(uuid) to authenticated;

revoke execute on function public.delete_class_with_students(uuid) from public;
revoke execute on function public.delete_class_with_students(uuid) from anon;
grant execute on function public.delete_class_with_students(uuid) to authenticated;

revoke execute on function public.protect_receipt_audit_fields() from public;
revoke execute on function public.protect_receipt_audit_fields() from anon;
revoke execute on function public.protect_receipt_audit_fields() from authenticated;
