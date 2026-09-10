-- Delete a class and every student registration linked to it atomically.
-- Receipts and automation logs are intentionally preserved by their existing
-- ON DELETE SET NULL foreign keys; payment_events follow the student cascade.

create or replace function public.delete_class_with_students(target_class_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_academy_id uuid;
    v_owner_id uuid;
    v_deleted_students integer := 0;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    select c.academy_id, c.user_id
      into v_academy_id, v_owner_id
      from public.classes c
     where c.id = target_class_id
     for update;

    if not found then
        return 0;
    end if;

    if not (
        public.is_academy_member(v_academy_id)
        or (v_academy_id is null and v_owner_id = v_user_id)
    ) then
        raise exception 'Forbidden' using errcode = '42501';
    end if;

    delete from public.students s
     where s.class_id = target_class_id
       and (
            (v_academy_id is not null and s.academy_id = v_academy_id)
            or (
                v_academy_id is null
                and s.academy_id is null
                and s.user_id = v_user_id
            )
       );

    get diagnostics v_deleted_students = row_count;

    delete from public.classes c
     where c.id = target_class_id
       and (
            (v_academy_id is not null and c.academy_id = v_academy_id)
            or (
                v_academy_id is null
                and c.academy_id is null
                and c.user_id = v_user_id
            )
       );

    return v_deleted_students;
end;
$$;

revoke all on function public.delete_class_with_students(uuid) from public;
revoke all on function public.delete_class_with_students(uuid) from anon;
grant execute on function public.delete_class_with_students(uuid) to authenticated;
