create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table private.rate_limit_counters (
  user_id uuid not null,
  endpoint text not null check (endpoint in (
    'payment-lifecycle',
    'payment-receipt',
    'send-whatsapp',
    'retry-automation-message'
  )),
  window_start timestamptz not null,
  request_count bigint not null check (request_count >= 1),
  primary key (user_id, endpoint, window_start)
);

revoke all on private.rate_limit_counters from public, anon, authenticated;

create or replace function public.check_rate_limit(
  p_user_id uuid,
  p_endpoint text,
  p_limit integer
)
returns table (
  allowed boolean,
  limit_value integer,
  remaining integer,
  retry_after_seconds integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz := date_trunc('minute', v_now);
  v_reset_at timestamptz := date_trunc('minute', v_now) + interval '1 minute';
  v_count bigint;
begin
  if p_user_id is null then raise exception 'invalid user'; end if;
  if p_endpoint not in ('payment-lifecycle','payment-receipt','send-whatsapp','retry-automation-message') then
    raise exception 'invalid endpoint';
  end if;
  if p_limit is null or p_limit <= 0 then raise exception 'invalid limit'; end if;

  insert into private.rate_limit_counters(user_id, endpoint, window_start, request_count)
  values (p_user_id, p_endpoint, v_window_start, 1)
  on conflict (user_id, endpoint, window_start)
  do update set request_count = least(
    private.rate_limit_counters.request_count + 1,
    p_limit::bigint + 1
  )
  returning request_count into v_count;

  return query select
    v_count <= p_limit,
    p_limit,
    greatest(p_limit::bigint - v_count, 0)::integer,
    greatest(ceil(extract(epoch from (v_reset_at - clock_timestamp())))::integer, 1),
    v_reset_at;
end;
$$;

revoke execute on function public.check_rate_limit(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, integer) to service_role;

select cron.schedule(
  'phase2b-rate-limit-cleanup',
  '17 * * * *',
  $$delete from private.rate_limit_counters
    where window_start < now() - interval '48 hours';$$
);
