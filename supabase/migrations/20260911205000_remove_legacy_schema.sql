-- Preserve legacy archive timestamps, then remove superseded schema only when safe.

create table if not exists public.student_archive_history (
    student_id uuid not null,
    academy_id uuid not null,
    archived_at timestamptz not null,
    primary key (student_id, archived_at)
);

alter table public.student_archive_history enable row level security;
revoke all on public.student_archive_history from public;
revoke all on public.student_archive_history from anon;
revoke all on public.student_archive_history from authenticated;

do $$
declare
    v_has_archived_at boolean := exists (
        select 1
          from information_schema.columns
         where table_schema = 'public'
           and table_name = 'students'
           and column_name = 'archived_at'
    );
    v_has_financial_charges boolean := to_regclass('public.financial_charges') is not null;
    v_has_installment_count boolean := exists (
        select 1
          from information_schema.columns
         where table_schema = 'public'
           and table_name = 'classes'
           and column_name = 'installment_count'
    );
    v_count bigint := 0;
    v_source_archives bigint := 0;
    v_preserved_archives bigint := 0;
begin
    if v_has_archived_at then
        execute 'select count(*) from public.students where archived_at is not null and academy_id is null' into v_count;
        if v_count <> 0 then
            raise exception 'archived_at contains rows without academy_id; refusing migration';
        end if;

        execute $sql$
            insert into public.student_archive_history(student_id, academy_id, archived_at)
            select id, academy_id, archived_at
              from public.students
             where archived_at is not null
            on conflict (student_id, archived_at) do nothing
        $sql$;

        execute 'select count(*) from public.students where archived_at is not null' into v_source_archives;
        execute $sql$
            select count(*)
              from public.students s
              join public.student_archive_history h
                on h.student_id = s.id
               and h.academy_id = s.academy_id
               and h.archived_at = s.archived_at
             where s.archived_at is not null
        $sql$ into v_preserved_archives;

        if v_source_archives <> v_preserved_archives then
            raise exception 'archived_at history preservation mismatch: source %, preserved %', v_source_archives, v_preserved_archives;
        end if;
    end if;

    if v_has_financial_charges then
        execute 'select count(*) from public.financial_charges' into v_count;
        if v_count <> 0 then
            raise exception 'financial_charges contains data; refusing drop';
        end if;
    end if;

    if v_has_installment_count then
        execute 'select count(*) from public.classes where installment_count is distinct from 3' into v_count;
        if v_count <> 0 then
            raise exception 'installment_count contains non-default values; refusing drop';
        end if;
    end if;
end $$;

alter table public.students
    drop column if exists archived_at;

drop table if exists public.financial_charges;

alter table public.classes
    drop column if exists installment_count;
