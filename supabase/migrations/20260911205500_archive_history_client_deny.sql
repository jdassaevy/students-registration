-- Make the audit-only table's deny-all client posture explicit for RLS linters.
alter table public.student_archive_history enable row level security;

drop policy if exists "No client access to archive history" on public.student_archive_history;
create policy "No client access to archive history"
on public.student_archive_history
for all
to authenticated
using (false)
with check (false);

revoke all on public.student_archive_history from public;
revoke all on public.student_archive_history from anon;
revoke all on public.student_archive_history from authenticated;
