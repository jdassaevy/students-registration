create or replace function public.find_duplicate_active_receipts()
returns table (
  student_id uuid,
  person text,
  kind text,
  installment integer,
  duplicate_count bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    r.student_id,
    r.person,
    r.kind,
    r.installment,
    count(*) as duplicate_count
  from public.receipts r
  where r.status = 'active'
  group by r.student_id, r.person, r.kind, r.installment
  having count(*) > 1;
$$;

grant execute on function public.find_duplicate_active_receipts() to authenticated;
