-- Phase 2D: remove browser access to the privileged academy bootstrap RPC.
-- Safety: this migration changes function definitions/ACLs only. It does not
-- INSERT, UPDATE, DELETE, TRUNCATE or DROP any academy/student/business rows.

create or replace function public.bootstrap_academy_service(
    p_user_id uuid,
    academy_name text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
    v_user_id uuid := p_user_id;
    v_academy_id uuid;
    v_academy_name text := btrim(coalesce(academy_name, ''));
    v_legacy_responsible_name text;
    v_legacy_support_phone text;
    v_legacy_display_name text;
begin
    if v_user_id is null then
        raise exception 'Authenticated user is required';
    end if;

    if not exists (select 1 from auth.users where id = v_user_id) then
        raise exception 'Authenticated user not found';
    end if;

    if char_length(v_academy_name) not between 1 and 160 then
        raise exception 'Academy name must contain between 1 and 160 characters';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

    select
        profile.responsible_name,
        profile.support_phone,
        profile.display_name
      into
        v_legacy_responsible_name,
        v_legacy_support_phone,
        v_legacy_display_name
      from public.academy_profiles profile
     where profile.user_id = v_user_id
     limit 1;

    select member.academy_id
      into v_academy_id
      from public.academy_members member
     where member.user_id = v_user_id
       and member.is_active = true
     order by member.created_at asc
     limit 1;

    if v_academy_id is not null then
        update public.academies academy
           set responsible_name = coalesce(nullif(btrim(academy.responsible_name), ''), nullif(btrim(v_legacy_responsible_name), ''), ''),
               support_phone = coalesce(nullif(btrim(academy.support_phone), ''), nullif(btrim(v_legacy_support_phone), '')),
               display_name = coalesce(nullif(btrim(academy.display_name), ''), nullif(btrim(v_legacy_display_name), '')),
               updated_at = now()
         where academy.id = v_academy_id
           and (
               btrim(academy.responsible_name) = ''
               or academy.support_phone is null
               or btrim(coalesce(academy.support_phone, '')) = ''
               or academy.display_name is null
               or btrim(coalesce(academy.display_name, '')) = ''
           );
        return v_academy_id;
    end if;

    insert into public.academies
        (name, responsible_name, support_phone, display_name)
    values
        (
            v_academy_name,
            coalesce(nullif(btrim(v_legacy_responsible_name), ''), ''),
            nullif(btrim(v_legacy_support_phone), ''),
            nullif(btrim(v_legacy_display_name), '')
        )
    returning id into v_academy_id;

    insert into public.academy_members(academy_id, user_id, role, is_active)
    values (v_academy_id, v_user_id, 'owner', true);

    update public.classes
       set academy_id = v_academy_id
     where user_id = v_user_id
       and academy_id is null;

    update public.students
       set academy_id = v_academy_id
     where user_id = v_user_id
       and academy_id is null;

    update public.payment_events
       set academy_id = v_academy_id
     where user_id = v_user_id
       and academy_id is null;

    update public.receipts
       set academy_id = v_academy_id
     where user_id = v_user_id
       and academy_id is null;

    return v_academy_id;
end;
$function$;

-- The browser must never execute either privileged bootstrap RPC directly.
revoke execute on function public.bootstrap_academy(text) from public, anon, authenticated;
revoke execute on function public.bootstrap_academy_service(uuid, text) from public, anon, authenticated;

-- Only trusted server-side code may execute the service RPC.
grant execute on function public.bootstrap_academy_service(uuid, text) to service_role;
grant execute on function public.bootstrap_academy(text) to service_role;
