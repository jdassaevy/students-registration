alter table public.students
  add column if not exists archived_at timestamptz;

comment on column public.students.archived_at is
  'Removal timestamp. NULL means the student/couple is active in current operations.';

create or replace function public.remove_student_from_operation(p_student_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_student public.students%rowtype;
  v_has_history boolean;
begin
  select *
    into v_student
    from public.students
   where id = p_student_id
     and archived_at is null
   for update;

  if not found then
    raise exception 'student_not_found_or_inactive'
      using errcode = 'P0002';
  end if;

  select
    exists(select 1 from public.receipts where student_id = p_student_id)
    or exists(select 1 from public.payment_events where student_id = p_student_id)
    into v_has_history;

  if v_has_history then
    update public.students
       set archived_at = now()
     where id = p_student_id;
    return 'archived';
  end if;

  delete from public.students
   where id = p_student_id;
  return 'deleted';
end;
$$;

revoke all on function public.remove_student_from_operation(uuid) from public;
revoke all on function public.remove_student_from_operation(uuid) from anon;
grant execute on function public.remove_student_from_operation(uuid) to authenticated;
