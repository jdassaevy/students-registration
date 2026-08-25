-- Multi-academy security and performance hardening.

-- Trigger-only SECURITY DEFINER functions must not be callable from the API.
revoke execute on function public.assign_tenant_academy_id() from public, anon, authenticated;
revoke execute on function public.create_legacy_academy_profile_for_owner() from public, anon, authenticated;

-- bootstrap_academy is an intentional authenticated RPC, never anonymous.
revoke execute on function public.bootstrap_academy(text, text, text) from public, anon;
grant execute on function public.bootstrap_academy(text, text, text) to authenticated;

-- RLS helper functions are only needed for authenticated sessions.
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.is_academy_member(uuid) from public, anon;
revoke execute on function public.is_academy_owner(uuid) from public, anon;
revoke execute on function public.has_active_support_access(uuid) from public, anon;
revoke execute on function public.has_active_support_for_user(uuid) from public, anon;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_academy_member(uuid) to authenticated;
grant execute on function public.is_academy_owner(uuid) to authenticated;
grant execute on function public.has_active_support_access(uuid) to authenticated;
grant execute on function public.has_active_support_for_user(uuid) to authenticated;

-- Cover foreign keys used by operational queries.
create index if not exists automation_messages_user_id_idx on public.automation_messages(user_id);
create index if not exists automation_messages_student_id_idx on public.automation_messages(student_id);
create index if not exists automation_messages_class_id_idx on public.automation_messages(class_id);
create index if not exists automation_messages_receipt_id_idx on public.automation_messages(receipt_id);
create index if not exists classes_user_id_idx on public.classes(user_id);
create index if not exists students_user_id_idx on public.students(user_id);
create index if not exists students_class_id_idx on public.students(class_id);
create index if not exists payment_events_user_id_idx on public.payment_events(user_id);
create index if not exists payment_events_class_id_idx on public.payment_events(class_id);
create index if not exists receipts_user_id_idx on public.receipts(user_id);
create index if not exists receipts_class_id_idx on public.receipts(class_id);

-- Avoid per-row auth.uid() re-evaluation in RLS plans.
drop policy if exists "Profiles visible to self and platform admin" on public.profiles;
create policy "Profiles visible to self and platform admin"
on public.profiles for select to authenticated
using(user_id = (select auth.uid()) or public.is_platform_admin());

drop policy if exists "Users or audited support update profile" on public.profiles;
create policy "Users or audited support update profile"
on public.profiles for update to authenticated
using(user_id = (select auth.uid()) or public.has_active_support_for_user(user_id))
with check(user_id = (select auth.uid()) or public.has_active_support_for_user(user_id));

drop policy if exists "Memberships visible to participants" on public.academy_members;
create policy "Memberships visible to participants"
on public.academy_members for select to authenticated
using(user_id = (select auth.uid()) or public.is_academy_owner(academy_id) or public.is_platform_admin());

drop policy if exists "Platform admins read support logs" on public.support_access_logs;
create policy "Platform admins read support logs"
on public.support_access_logs for select to authenticated
using(public.is_platform_admin() and admin_user_id = (select auth.uid()));

drop policy if exists "Platform admins start support access" on public.support_access_logs;
create policy "Platform admins start support access"
on public.support_access_logs for insert to authenticated
with check(public.is_platform_admin() and admin_user_id = (select auth.uid()) and ended_at is null);

drop policy if exists "Platform admins close support access" on public.support_access_logs;
create policy "Platform admins close support access"
on public.support_access_logs for update to authenticated
using(public.is_platform_admin() and admin_user_id = (select auth.uid()))
with check(public.is_platform_admin() and admin_user_id = (select auth.uid()));
