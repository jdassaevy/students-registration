-- Phase 3D: reduce direct browser EXECUTE privileges on trigger helpers.
-- No business-row data is inserted, updated or deleted by this migration.

alter function public.touch_automation_settings_updated_at()
set search_path = pg_catalog, public;

revoke execute on function public.touch_automation_settings_updated_at()
from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.set_financial_charge_updated_at()') is not null then
    execute 'alter function public.set_financial_charge_updated_at() set search_path = pg_catalog, public';
    execute 'revoke execute on function public.set_financial_charge_updated_at() from public, anon, authenticated';
  end if;
end
$$;
