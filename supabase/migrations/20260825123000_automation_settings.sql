create table if not exists public.automation_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminders_enabled boolean not null default true,
  payment_confirmation_enabled boolean not null default true,
  receipt_delivery_enabled boolean not null default true,
  void_notification_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.automation_settings enable row level security;

drop policy if exists "Users manage own automation settings" on public.automation_settings;
create policy "Users manage own automation settings" on public.automation_settings
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.automation_settings to authenticated;

create or replace function public.touch_automation_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_automation_settings_updated_at on public.automation_settings;
create trigger touch_automation_settings_updated_at
before update on public.automation_settings
for each row execute function public.touch_automation_settings_updated_at();
