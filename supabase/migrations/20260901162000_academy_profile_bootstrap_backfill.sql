-- Preserve legacy academy identity when a legacy user creates their tenant.
-- This intentionally keeps the academy name supplied by the user as authoritative,
-- while carrying forward responsible/contact/display fields from academy_profiles.

create or replace function public.bootstrap_academy(academy_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_academy_id uuid;
    v_academy_name text := btrim(coalesce(academy_name, ''));
    v_legacy_responsible_name text;
    v_legacy_support_phone text;
    v_legacy_display_name text;
begin
    if v_user_id is null then
        raise exception 'Authentication required';
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
$$;

revoke all on function public.bootstrap_academy(text) from public;
grant execute on function public.bootstrap_academy(text) to authenticated;
