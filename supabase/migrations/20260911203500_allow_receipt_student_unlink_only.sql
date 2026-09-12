-- Receipt history is immutable, except that deleting a student must be able
-- to clear receipts.student_id through ON DELETE SET NULL. Relinking is forbidden.

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

revoke execute on function public.protect_receipt_audit_fields() from public;
revoke execute on function public.protect_receipt_audit_fields() from anon;
revoke execute on function public.protect_receipt_audit_fields() from authenticated;
