# Student Archive Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing student/couple removal action remove a record from current operations and current financial totals while preserving historical receipts/audit data whenever financial history exists.

**Architecture:** Add `students.archived_at` plus an authenticated `SECURITY INVOKER` RPC that atomically chooses hard-delete for no-history students or archive for students with receipts/payment events. Current frontend/reporting/automation queries explicitly exclude archived students, and service-role Edge Functions enforce the same active-student rule so stale clients cannot create new operational side effects.

**Tech Stack:** PostgreSQL/Supabase RLS + RPC, vanilla JavaScript frontend, Supabase Edge Functions (Deno/TypeScript), Node `node:test`/source-contract tests, Vercel preview deployment.

**Spec:** `docs/superpowers/specs/2026-09-03-student-archive-removal-design.md`

## Global Constraints

- Removing a student/couple with history removes them from current operational views and current financial totals.
- Historical receipts, payment events and automation logs remain preserved.
- No `Arquivados` screen and no restore flow.
- A student/couple with no `receipts` and no `payment_events` may be hard-deleted.
- Existing rows remain active because `archived_at` defaults to `NULL`; never backfill existing students as archived.
- Archived students cannot create new payment lifecycle effects, reminder candidates or retry sends.
- Historical monthly receipt PDF repair remains allowed, but must not send a new WhatsApp document for an archived student.
- Preserve existing multi-academy RLS/tenant isolation. The removal RPC uses `SECURITY INVOKER`; do not introduce service-role access in the browser.
- Do not change payment amounts, due-date rules, Meta template names or WhatsApp template parameter shapes. The known payment-confirmation retry-template mismatch is a separate fix.
- Apply schema/function changes only to Supabase DEV `lulvvkrrysfmiqtefwnf` first. Do not alter PROD `gswcruzlvkcoclbcrjvp` without later explicit approval.
- Stage frontend only to `dev-preview` for manual validation. Do not merge to `main` or deploy production without later explicit approvals.

---

## File Structure

**Create**
- `supabase/migrations/20260903203000_student_archive_removal.sql` — archive column, RPC and grants.
- `app/js/tests/student-archive-schema.test.mjs` — migration/RPC contracts.
- `app/js/tests/student-archive-frontend.test.mjs` — active-loader/removal/reports/Automation Center contracts.
- `app/js/tests/student-archive-backend.test.mjs` — Edge Function archive guards.

**Modify**
- `app/js/core/script.js` — active student load + archive-aware remove flow.
- `app/js/features/reports.js` — current revenue excludes archived students.
- `app/js/features/automation-center.js` — active readiness/name map + no retry for archived students.
- `supabase/functions/payment-lifecycle/index.ts` — active-only normal payment flow; historical repair without outbound WhatsApp.
- `supabase/functions/process-reminders/index.ts` — active-only reminder candidates.
- `supabase/functions/retry-automation-message/index.ts` — active-only retry target.

---

### Task 1: Add `archived_at` and the atomic removal RPC

**Files:**
- Create: `supabase/migrations/20260903203000_student_archive_removal.sql`
- Create: `app/js/tests/student-archive-schema.test.mjs`

**Interfaces:**
- Produces: `public.students.archived_at timestamptz NULL`.
- Produces: `public.remove_student_from_operation(p_student_id uuid) RETURNS text`.
- Successful values: `archived` or `deleted`.
- Inaccessible/already-inactive row: SQLSTATE `P0002`.

- [ ] **Step 1: Write the failing migration contract**

```js
// app/js/tests/student-archive-schema.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../../../supabase/migrations/20260903203000_student_archive_removal.sql', import.meta.url),
  'utf8'
);

test('students gain an archive marker without a broad backfill', () => {
  assert.match(migration, /add column if not exists archived_at timestamptz/i);
  const studentUpdates = migration.match(/update\s+public\.students[\s\S]*?;/gi) || [];
  assert.equal(studentUpdates.length, 1, 'only the targeted RPC archive update is allowed');
  assert.match(
    studentUpdates[0],
    /set archived_at\s*=\s*now\(\)[\s\S]*where id\s*=\s*p_student_id/i
  );
});

test('removal RPC keeps caller RLS authoritative', () => {
  assert.match(migration, /create or replace function public\.remove_student_from_operation\(p_student_id uuid\)/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migration, /grant execute on function public\.remove_student_from_operation\(uuid\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.remove_student_from_operation\(uuid\) from public/i);
  assert.match(migration, /revoke all on function public\.remove_student_from_operation\(uuid\) from anon/i);
});

test('history archives and no-history hard deletes', () => {
  assert.match(migration, /from public\.receipts[\s\S]*student_id\s*=\s*p_student_id/i);
  assert.match(migration, /from public\.payment_events[\s\S]*student_id\s*=\s*p_student_id/i);
  assert.match(migration, /return 'archived'/i);
  assert.match(migration, /delete from public\.students[\s\S]*where id\s*=\s*p_student_id/i);
  assert.match(migration, /return 'deleted'/i);
});
```

- [ ] **Step 2: Run the test and prove RED**

```bash
node app/js/tests/student-archive-schema.test.mjs
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add the migration**

```sql
-- supabase/migrations/20260903203000_student_archive_removal.sql
alter table public.students
  add column if not exists archived_at timestamptz;

comment on column public.students.archived_at is
  'Removal timestamp. NULL means the student/couple is active in current operations.';

create or replace function public.remove_student_from_operation(p_student_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_student public.students%rowtype;
  v_has_history boolean;
begin
  select *
    into v_student
    from public.students
   where id = p_student_id
     and archived_at is null
   for update;

  if not found then
    raise exception 'student_not_found_or_inactive'
      using errcode = 'P0002';
  end if;

  select
    exists(select 1 from public.receipts where student_id = p_student_id)
    or exists(select 1 from public.payment_events where student_id = p_student_id)
    into v_has_history;

  if v_has_history then
    update public.students
       set archived_at = now()
     where id = p_student_id;
    return 'archived';
  end if;

  delete from public.students
   where id = p_student_id;
  return 'deleted';
end;
$$;

revoke all on function public.remove_student_from_operation(uuid) from public;
revoke all on function public.remove_student_from_operation(uuid) from anon;
grant execute on function public.remove_student_from_operation(uuid) to authenticated;
```

- [ ] **Step 4: Prove GREEN and run the existing suite**

```bash
node app/js/tests/student-archive-schema.test.mjs
for file in app/js/tests/*.test.js app/js/tests/*.test.mjs; do node "$file"; done
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260903203000_student_archive_removal.sql app/js/tests/student-archive-schema.test.mjs
git commit -m "feat: add student archive removal rpc"
```

---

### Task 2: Load active students and replace direct delete with the RPC

**Files:**
- Modify: `app/js/core/script.js`
- Create: `app/js/tests/student-archive-frontend.test.mjs`

**Interfaces:**
- Consumes: `remove_student_from_operation({p_student_id})`.
- Produces: `couples` contains only `archived_at IS NULL` students.
- Archive copy: `Cadastro removido. Histórico financeiro preservado.`
- Hard-delete copy: `Cadastro excluído.`

- [ ] **Step 1: Write failing frontend contracts**

```js
// app/js/tests/student-archive-frontend.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync(new URL('../core/script.js', import.meta.url), 'utf8');

test('both current student loaders exclude archived rows', () => {
  const filters = script.match(/from\(['"]students['"]\)[\s\S]{0,220}?\.is\(['"]archived_at['"],\s*null\)/g) || [];
  assert.ok(filters.length >= 2);
});

test('removeCouple calls the archive-aware RPC', () => {
  assert.match(script, /rpc\(['"]remove_student_from_operation['"],\s*\{\s*p_student_id:\s*id\s*\}\)/);
  assert.doesNotMatch(script, /function removeCouple[\s\S]*?from\(['"]students['"]\)[\s\S]*?\.delete\(\)/);
  assert.match(script, /Cadastro removido\. Histórico financeiro preservado\./);
  assert.match(script, /Cadastro excluído\./);
});
```

- [ ] **Step 2: Run and prove RED**

```bash
node app/js/tests/student-archive-frontend.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Filter both student loads**

In `loadData()` and the post-local-migration reload in `migrateLocalData()` use:

```js
.from('students')
.select('*')
.is('archived_at', null)
.order('created_at', {ascending: false})
```

- [ ] **Step 4: Replace `removeCouple` mutation**

```js
async function removeCouple(id) {
    const c = couples.find(x => x.id === id);
    if (!c || !confirm(
        `Excluir o cadastro de ${c.person1}${c.person2 ? ` e ${c.person2}` : ''}?`
    )) return;

    const {data, error} = await db.rpc('remove_student_from_operation', {
        p_student_id: id
    });

    if (error || !['archived', 'deleted'].includes(data)) {
        console.warn('student removal failed', error?.message || data);
        return toast('Não foi possível remover o cadastro.');
    }

    couples = couples.filter(x => x.id !== id);
    render();
    toast(
        data === 'archived'
            ? 'Cadastro removido. Histórico financeiro preservado.'
            : 'Cadastro excluído.'
    );
}
```

- [ ] **Step 5: Prove GREEN + regression suite**

```bash
node app/js/tests/student-archive-frontend.test.mjs
for file in app/js/tests/*.test.js app/js/tests/*.test.mjs; do node "$file"; done
```

- [ ] **Step 6: Commit**

```bash
git add app/js/core/script.js app/js/tests/student-archive-frontend.test.mjs
git commit -m "fix: remove students with archive-aware flow"
```

---

### Task 3: Remove archived students from current reporting totals

**Files:**
- Modify: `app/js/features/reports.js`
- Modify: `app/js/tests/student-archive-frontend.test.mjs`

**Interfaces:**
- Consumes: active-only `couples`.
- Produces: `reportEvents` includes only events whose `student_id` is in active `couples`; database event history is untouched.

- [ ] **Step 1: Add RED contract**

```js
const reports = fs.readFileSync(new URL('../features/reports.js', import.meta.url), 'utf8');

test('current revenue excludes archived-student events', () => {
  assert.match(reports, /const activeStudentIds = new Set\(couples\.map\(c => c\.id\)\)/);
  assert.match(reports, /reportEvents = \(data \|\| \[\]\)\.filter\(event => activeStudentIds\.has\(event\.student_id\)\)/);
});
```

- [ ] **Step 2: Prove RED**

```bash
node app/js/tests/student-archive-frontend.test.mjs
```

- [ ] **Step 3: Filter loaded events in `loadEvents()`**

Replace `reportEvents = data || [];` with:

```js
const activeStudentIds = new Set(couples.map(c => c.id));
reportEvents = (data || []).filter(event => activeStudentIds.has(event.student_id));
```

- [ ] **Step 4: Prove GREEN + regression suite**

```bash
node app/js/tests/student-archive-frontend.test.mjs
for file in app/js/tests/*.test.js app/js/tests/*.test.mjs; do node "$file"; done
```

- [ ] **Step 5: Commit**

```bash
git add app/js/features/reports.js app/js/tests/student-archive-frontend.test.mjs
git commit -m "fix: exclude archived students from current reports"
```

---

### Task 4: Keep archived students historical-only in Automation Center

**Files:**
- Modify: `app/js/features/automation-center.js`
- Modify: `app/js/tests/student-archive-frontend.test.mjs`

**Interfaces:**
- Readiness and student-name map consume active students only.
- Historical `automation_messages` remain visible.
- Retry UI requires both `canRetry(message)` and an active `studentsById` entry.

- [ ] **Step 1: Add RED contracts**

```js
const automation = fs.readFileSync(new URL('../features/automation-center.js', import.meta.url), 'utf8');

test('Automation Center student queries are active-only', () => {
  const filters = automation.match(/from\(['"]students['"]\)[\s\S]{0,260}?\.is\(['"]archived_at['"],\s*null\)/g) || [];
  assert.ok(filters.length >= 2);
});

test('archived historical rows cannot expose retry', () => {
  assert.match(automation, /canRetry\(message\)\s*&&\s*studentsById\.has\(message\.student_id\)/);
});
```

- [ ] **Step 2: Prove RED**

```bash
node app/js/tests/student-archive-frontend.test.mjs
```

- [ ] **Step 3: Filter student queries**

In `loadMessages()`:

```js
db.from('students')
  .select('id,person1,person2')
  .is('archived_at', null)
```

In `loadReadiness()`:

```js
db.from('students')
  .select('id,person1_phone,person2_phone')
  .is('archived_at', null)
  .limit(500)
```

- [ ] **Step 4: Gate retry button with the active map**

```js
const retry = canRetry(message) && studentsById.has(message.student_id)
    ? `<button type="button" class="automation-retry" data-retry-message="${message.id}">Reenviar</button>`
    : '<span></span>';
```

Do not alter WhatsApp template payloads.

- [ ] **Step 5: Prove GREEN + regression suite**

```bash
node app/js/tests/student-archive-frontend.test.mjs
for file in app/js/tests/*.test.js app/js/tests/*.test.mjs; do node "$file"; done
```

- [ ] **Step 6: Commit**

```bash
git add app/js/features/automation-center.js app/js/tests/student-archive-frontend.test.mjs
git commit -m "fix: keep archived students out of current automations"
```

---

### Task 5: Enforce archive guards in service-role Edge Functions

**Files:**
- Modify: `supabase/functions/payment-lifecycle/index.ts`
- Modify: `supabase/functions/process-reminders/index.ts`
- Modify: `supabase/functions/retry-automation-message/index.ts`
- Create: `app/js/tests/student-archive-backend.test.mjs`

**Interfaces:**
- Normal payment flow resolves active students only.
- Historical monthly receipt PDF repair still runs; outbound document eligibility is false when `repairStudent.archived_at` is set.
- Reminders resolve active students only.
- Retry resolves active students only before log/send side effects.

- [ ] **Step 1: Write RED backend contracts**

```js
// app/js/tests/student-archive-backend.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lifecycle = fs.readFileSync(new URL('../../../supabase/functions/payment-lifecycle/index.ts', import.meta.url), 'utf8');
const reminders = fs.readFileSync(new URL('../../../supabase/functions/process-reminders/index.ts', import.meta.url), 'utf8');
const retry = fs.readFileSync(new URL('../../../supabase/functions/retry-automation-message/index.ts', import.meta.url), 'utf8');

test('normal payment lifecycle resolves active students only', () => {
  assert.match(lifecycle, /eq\(["']id["'],\s*studentId\)[\s\S]{0,120}?is\(["']archived_at["'],\s*null\)/);
});

test('historical repair disables outbound WhatsApp when archived', () => {
  assert.match(lifecycle, /repairStudent[\s\S]*?archived_at/);
  assert.match(lifecycle, /repairEligible\s*=\s*!repairStudent\.archived_at\s*&&\s*isWhatsappEligible/);
});

test('reminder batch loads active students only', () => {
  assert.match(reminders, /from\(["']students["']\)[\s\S]{0,480}?is\(["']archived_at["'],\s*null\)/);
});

test('retry resolves active students only', () => {
  assert.match(retry, /from\(["']students["']\)[\s\S]{0,480}?is\(["']archived_at["'],\s*null\)[\s\S]*?Student unavailable/);
});
```

- [ ] **Step 2: Prove RED**

```bash
node app/js/tests/student-archive-backend.test.mjs
```

- [ ] **Step 3: Guard normal `payment-lifecycle` before side effects**

On the normal student lookup add:

```ts
.eq("id", studentId)
.is("archived_at", null)
.single();
```

This must remain before any `payment_events`, `receipts` or `automation_messages` creation/deletion.

- [ ] **Step 4: Keep repair PDF maintenance but disable archived WhatsApp**

Add `archived_at` to `repairStudent` select:

```ts
.select("id,class_id,academy_id,archived_at,person1,person2,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent")
```

Then:

```ts
const repairEligible = !repairStudent.archived_at && isWhatsappEligible({
  phone: repairPhone,
  consent: repairConsent,
});
```

Do not block `requestMonthlyReceiptPdf(...)`.

- [ ] **Step 5: Filter `process-reminders`**

```ts
admin.from("students")
  .select("id,user_id,class_id,person1,person2,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent,fees,payments")
  .not("class_id", "is", null)
  .is("archived_at", null)
```

- [ ] **Step 6: Filter retry target**

```ts
.eq("id", source.student_id)
.is("archived_at", null)
.single();
```

Keep the existing `Student unavailable` response. Do not fix/change template parameters in this task.

- [ ] **Step 7: Prove GREEN + regression suite**

```bash
node app/js/tests/student-archive-backend.test.mjs
for file in app/js/tests/*.test.js app/js/tests/*.test.mjs; do node "$file"; done
```

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/payment-lifecycle/index.ts supabase/functions/process-reminders/index.ts supabase/functions/retry-automation-message/index.ts app/js/tests/student-archive-backend.test.mjs
git commit -m "fix: block archived students from backend operations"
```

---

### Task 6: Apply and prove the feature in DEV only

**Files/targets:**
- Source branch: `fix/student-archive-removal`.
- Supabase DEV: `lulvvkrrysfmiqtefwnf`.
- Vercel DEV alias: `students-registration-git-f9c575-jdassaevy12345-6044s-projects.vercel.app`.
- PROD remains untouched.

- [ ] **Step 1: Run exact-head tests before any DEV mutation**

```bash
for file in app/js/tests/*.test.js app/js/tests/*.test.mjs; do node "$file"; done
```

Expected: all PASS.

- [ ] **Step 2: Apply the migration to DEV only**

Apply exact file `supabase/migrations/20260903203000_student_archive_removal.sql` with migration name `student_archive_removal` to project `lulvvkrrysfmiqtefwnf`.

- [ ] **Step 3: Run transactional RPC/RLS integration checks in DEV**

The DEV database currently has at least two active academy members, so use existing member identities without creating accounts. Run as one session:

```sql
begin;

create temporary table archive_test_context (
  owner_user_id uuid,
  owner_academy_id uuid,
  outsider_user_id uuid,
  outsider_academy_id uuid,
  receipt_student_id uuid,
  event_student_id uuid,
  clean_student_id uuid,
  foreign_student_id uuid
) on commit drop;

grant select on archive_test_context to authenticated;

insert into archive_test_context(owner_user_id, owner_academy_id, outsider_user_id, outsider_academy_id)
select owner.user_id, owner.academy_id, outsider.user_id, outsider.academy_id
from (
  select user_id, academy_id
  from public.academy_members
  where is_active = true
  order by created_at
  limit 1
) owner
cross join lateral (
  select user_id, academy_id
  from public.academy_members
  where is_active = true
    and academy_id <> owner.academy_id
  order by created_at
  limit 1
) outsider;

do $$
begin
  if (select count(*) from archive_test_context) <> 1 then
    raise exception 'DEV needs two active academy members for tenant test';
  end if;
  if exists(select 1 from public.students where archived_at is not null) then
    raise exception 'unexpected pre-existing archived DEV row before first controlled archive test';
  end if;
end $$;

with inserted as (
  insert into public.students(user_id, academy_id, person1)
  select owner_user_id, owner_academy_id, 'Archive Test Receipt' from archive_test_context
  returning id
)
update archive_test_context set receipt_student_id = (select id from inserted);

with inserted as (
  insert into public.students(user_id, academy_id, person1)
  select owner_user_id, owner_academy_id, 'Archive Test Event' from archive_test_context
  returning id
)
update archive_test_context set event_student_id = (select id from inserted);

with inserted as (
  insert into public.students(user_id, academy_id, person1)
  select owner_user_id, owner_academy_id, 'Archive Test Clean' from archive_test_context
  returning id
)
update archive_test_context set clean_student_id = (select id from inserted);

with inserted as (
  insert into public.students(user_id, academy_id, person1)
  select owner_user_id, owner_academy_id, 'Archive Test Foreign Guard' from archive_test_context
  returning id
)
update archive_test_context set foreign_student_id = (select id from inserted);

insert into public.receipts(user_id, academy_id, student_id, person, kind, installment, amount, paid_at)
select owner_user_id, owner_academy_id, receipt_student_id, 'person1', 'monthly', 1, 150, now()
from archive_test_context;

insert into public.payment_events(user_id, academy_id, student_id, person, kind, installment, amount)
select owner_user_id, owner_academy_id, event_student_id, 'person1', 'monthly', 1, 150
from archive_test_context;

select set_config('request.jwt.claim.sub', outsider_user_id::text, true)
from archive_test_context;
set local role authenticated;

do $$
begin
  begin
    perform public.remove_student_from_operation(
      (select foreign_student_id from archive_test_context limit 1)
    );
    raise exception 'cross-tenant removal unexpectedly succeeded';
  exception
    when sqlstate 'P0002' then null;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', owner_user_id::text, true)
from archive_test_context;
set local role authenticated;

do $$
declare
  receipt_result text;
  event_result text;
  clean_result text;
begin
  receipt_result := public.remove_student_from_operation(
    (select receipt_student_id from archive_test_context limit 1)
  );
  event_result := public.remove_student_from_operation(
    (select event_student_id from archive_test_context limit 1)
  );
  clean_result := public.remove_student_from_operation(
    (select clean_student_id from archive_test_context limit 1)
  );

  if receipt_result <> 'archived' then raise exception 'receipt student must archive'; end if;
  if event_result <> 'archived' then raise exception 'event student must archive'; end if;
  if clean_result <> 'deleted' then raise exception 'clean student must hard-delete'; end if;
end $$;

reset role;

do $$
begin
  if not exists (
    select 1 from public.students s, archive_test_context c
    where s.id = c.receipt_student_id and s.archived_at is not null
  ) then raise exception 'receipt student archive marker missing'; end if;

  if not exists (
    select 1 from public.receipts r, archive_test_context c
    where r.student_id = c.receipt_student_id
  ) then raise exception 'receipt history was lost'; end if;

  if not exists (
    select 1 from public.students s, archive_test_context c
    where s.id = c.event_student_id and s.archived_at is not null
  ) then raise exception 'event student archive marker missing'; end if;

  if not exists (
    select 1 from public.payment_events e, archive_test_context c
    where e.student_id = c.event_student_id
  ) then raise exception 'payment event history was lost'; end if;

  if exists (
    select 1 from public.students s, archive_test_context c
    where s.id = c.clean_student_id
  ) then raise exception 'clean student was not hard-deleted'; end if;

  if not exists (
    select 1 from public.students s, archive_test_context c
    where s.id = c.foreign_student_id and s.archived_at is null
  ) then raise exception 'cross-tenant target was mutated'; end if;
end $$;

rollback;
```

Expected: no exception and all fixtures roll back.

- [ ] **Step 4: Run DEV Supabase advisors**

Check security and performance advisors. A new advisory caused by this migration blocks staging until fixed; unrelated pre-existing notices are recorded separately.

- [ ] **Step 5: Deploy only changed Edge Functions to DEV**

Preserve current JWT posture:

```text
payment-lifecycle           verify_jwt=true
process-reminders           verify_jwt=false
retry-automation-message    verify_jwt=true
```

Deploy only to `lulvvkrrysfmiqtefwnf`.

- [ ] **Step 6: Stage frontend to `dev-preview` without changing DEV config**

Copy final feature versions of:

```text
app/js/core/script.js
app/js/features/reports.js
app/js/features/automation-center.js
```

Preserve `dev-preview`'s `app/js/core/supabase-config.js`. Before sharing the URL, verify the served config still targets `lulvvkrrysfmiqtefwnf`.

- [ ] **Step 7: Create controlled manual fixtures through DEV UI**

Create `Teste Sem Histórico` and `Teste Com Histórico`, both without WhatsApp/consent. On `Teste Com Histórico`, mark exactly one mensalidade paid so a real DEV receipt/payment event exists without a WhatsApp send.

- [ ] **Step 8: Validate user-visible behavior**

1. Confirm `Teste Com Histórico` contributes to current Financeiro before removal.
2. Remove it: expect `Cadastro removido. Histórico financeiro preservado.` and immediate disappearance from students/classes/current Financeiro/reports.
3. Refresh: it stays absent.
4. Remove `Teste Sem Histórico`: expect `Cadastro excluído.` and it stays absent after refresh.
5. Open Automações: archived student does not count in readiness/current student map, and no historical failed row for it exposes `Reenviar`.

- [ ] **Step 9: Verify manual results in DEV DB**

```sql
select id, person1, archived_at
from public.students
where person1 in ('Teste Com Histórico', 'Teste Sem Histórico');
```

Expected: only `Teste Com Histórico`, with non-null `archived_at`.

```sql
select s.person1,
       count(distinct r.id) as receipts,
       count(distinct e.id) as payment_events
from public.students s
left join public.receipts r on r.student_id = s.id
left join public.payment_events e on e.student_id = s.id
where s.person1 = 'Teste Com Histórico'
group by s.person1;
```

Expected: at least one receipt or payment event remains.

- [ ] **Step 10: Final checkpoint**

Re-run the full JS suite on the exact feature head. Confirm DEV Vercel deployment is `READY`, served frontend still targets DEV Supabase, and DEV Edge Function source hashes match the feature source. Stop and ask the user to validate DEV.

Do not open a PR, merge `main`, apply the PROD migration, deploy PROD functions, or mutate production data without the next explicit approval.

---

## Self-Review Result

- Spec coverage: archive/hard-delete, current totals, reports, receipt preservation, tenant isolation, payment guard, reminder guard, retry guard, historical PDF repair and DEV-only rollout all have explicit tasks.
- Placeholder scan: no `TODO`, `TBD`, vague “implement later”, or undefined interface remains.
- Type/name consistency: `archived_at`, `p_student_id`, `remove_student_from_operation`, `archived`, `deleted`, and SQLSTATE `P0002` are consistent across migration, frontend and validation steps.
- Scope guard: no archived UI, restore flow or WhatsApp template correction is bundled into this feature.
