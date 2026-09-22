-- Phase 3C: make financial audit tables read-only to browser-authenticated users.
-- No business-row INSERT/UPDATE/DELETE is performed by this migration.
-- payment-lifecycle/payment-receipt use service_role for controlled writes.

revoke insert, update, delete on public.payment_events from authenticated;
revoke insert, update on public.receipts from authenticated;

grant select on public.payment_events to authenticated;
grant select on public.receipts to authenticated;
