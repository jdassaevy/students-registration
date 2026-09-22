# Reliability Runbook

Last reviewed: 2026-09-22

This runbook is read-only by default. Do not delete, rewrite, retry, or repair user data while diagnosing an incident.

## 1. Request correlation

All Supabase Edge Functions return an `X-Request-ID` response header.

When a user reports an error:

1. capture the request ID if available;
2. search Edge Function logs for that request ID;
3. inspect only technical event fields: endpoint, event, status, code, duration and aggregate counts;
4. do not add names, phone numbers, receipt numbers, provider message IDs, request bodies, Authorization headers or secrets to logs.

## 2. Automation failure summary

Read-only:

```sql
select
  status,
  automation_type,
  coalesce(error_code, '(none)') as error_code,
  count(*) as total,
  min(created_at) as first_seen,
  max(updated_at) as last_seen
from public.automation_messages
group by status, automation_type, error_code
order by automation_type, status, error_code;
```

Configuration-class Meta failures such as `132001` must not be blindly retried. Correct the provider configuration first and preserve the failed row as audit history.

## 3. Cron health

List configured jobs:

```sql
select jobid, jobname, schedule, active
from cron.job
order by jobid;
```

Recent failures:

```sql
select runid, jobid, status, return_message, start_time, end_time
from cron.job_run_details
where start_time > now() - interval '48 hours'
  and status not in ('succeeded', 'running')
order by start_time desc
limit 100;
```

The reminder processor must not be assumed to run automatically unless a dedicated scheduler is present and validated.

## 4. Tenant integrity

Read-only:

```sql
select
  (select count(*) from public.classes where academy_id is null) as classes_missing_academy,
  (select count(*) from public.students where academy_id is null) as students_missing_academy,
  (select count(*) from public.payment_events where academy_id is null) as payments_missing_academy,
  (select count(*) from public.receipts where academy_id is null) as receipts_missing_academy,
  (select count(*)
     from public.students s
     join public.classes c on c.id = s.class_id
    where s.academy_id is distinct from c.academy_id) as student_class_mismatch,
  (select count(*)
     from public.payment_events p
     join public.students s on s.id = p.student_id
    where p.academy_id is distinct from s.academy_id) as payment_student_mismatch,
  (select count(*)
     from public.receipts r
     join public.students s on s.id = r.student_id
    where r.academy_id is distinct from s.academy_id) as receipt_student_mismatch,
  (select count(*)
     from public.automation_messages am
     left join public.students s on s.id = am.student_id
    where am.student_id is not null
      and am.academy_id is distinct from s.academy_id) as automation_student_mismatch;
```

Any non-zero result is a stop condition. Investigate before performing writes.

## 5. Safe rollout baseline

Before a database or Edge Function production change, record:

```sql
select
  (select count(*) from public.academies) as academies,
  (select count(*) from public.classes) as classes,
  (select count(*) from public.students) as students,
  (select count(*) from public.payment_events) as payment_events,
  (select count(*) from public.receipts) as receipts,
  (select count(*) from public.automation_messages) as automation_messages;
```

Repeat immediately after rollout and combine it with the tenant-integrity query.

A count change is not automatically corruption, because legitimate traffic may occur during a rollout, but unexplained destructive decreases are a stop condition.

## 6. Data-preservation rule

Reliability fixes must prefer:

- read-only diagnosis;
- isolated DEV tests;
- transaction rollback for synthetic tests;
- additive changes;
- preserving failed automation rows and receipt history;
- explicit preflight/postflight counts and tenant checks.

Never use `TRUNCATE`, bulk `DELETE`, destructive reset, or data-rebuilding SQL as an incident shortcut.
