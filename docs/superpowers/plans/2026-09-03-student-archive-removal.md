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
- Do not change payment amounts, due-date rules, Meta template names or WhatsApp template parameter shapes in this feature. In particular, the known payment-confirmation retry-template mismatch is a separate fix.
- Apply schema/function changes only to Supabase DEV first (`lulvvkrrysfmiqtefwnf`). Do not alter PROD (`gswcruzlvkcoclbcrjvp`) without a later, separate explicit approval.
- Stage frontend code only to `dev-preview` for manual validation. Do not merge to `main` or deploy production without later explicit approvals.

---

## File Structure

**Create**

- `supabase/migrations/20260903203000_student_archive_removal.sql` — schema column, atomic removal RPC, grants.
- `app/js/tests/student-archive-schema.test.mjs` — migration/RPC contract tests.
- `app/js/tests/student-archive-frontend.test.mjs` — active-loader, removal, reporting and Automation Center contracts.
- `app/js/tests/student-archive-backend.test.mjs` — Edge Function active-student guard contracts.

**Modify**

- `app/js/core/script.js` — load only active students and call the removal RPC.
- `app/js/features/reports.js` — exclude archived-student payment events from current revenue history.
- `app/js/features/automation-center.js` — use active students for readiness/history names and suppress retry for archived students.
- `supabase/functions/payment-lifecycle/index.ts` — reject archived students in normal payment flow; keep PDF repair but disable new outbound document sends for archived students.
- `supabase/functions/process-reminders/index.ts` — load only active students.
- `supabase/functions/retry-automation-message/index.ts` — reject archived students before retry side effects.

---

### Task 1: Add `archived_at` and the atomic removal RPC

**Files:**
- Create: `supabase/migrations/20260903203000_student_archive_removal.sql`
- Create: `app/js/tests/student-archive-schema.test.mjs`

**Interfaces:**
- Produces: `public.students.archived_at timestamptz NULL`.
- Produces: `public.remove_student_from_operation(p_student_id uuid) RETURNS text` with only successful values `archived` or `deleted`; inaccessible/inactive records raise SQLSTATE `P0002`.
- Consumes: existing RLS policies on `students`, `receipts` and `payment_events`, all of which authorize active academy members through `is_academy_member(academy_id)`.

- [ ] **Step 1: Write the failing migration contract test**

Create `app/js/tests/student-archive-schema.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../../../supabase/migrations/20260903203000_student_archive_removal.sql', import.meta.url),
  'utf8'
);

test('students gain a nullable archive marker without backfill', () => {
  assert.match(migration, /add column if not exists archived_at timestamptz/i);
  assert.doesNotMatch(migration, /update\s+public\.students\s+set\s+archived_at/i);
});

test('removal RPC runs as the caller and preserves tenant RLS', () => {
  assert.match(migration, /create or replace function public\.remove_student_from_operation\(p_student_id uuid\)/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migration, /grant execute on function public\.remove_student_from_operation\(uuid\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.remove_student_from_operation\(uuid\) from public/i);
  assert.match(migration, /revoke all on function public\.remove_student_from_operation\(uuid\) from anon/i);
});

test('history causes archive while no-history causes hard delete', () => {
  assert.match(migration, /from public\.receipts[\s\S]*student_id\s*=\s*p_student_id/i);
  assert.match(migration, /from public\.payment_events[\s\S]*student_id\s*=\s*p_student_id/i);
  assert.match(migration, /set archived_at\s*=\s*now\(\)/i);
  assert.match(migration, /return 'archived'/i);
  assert.match(migration, /delete from public\.students[\s\S]*id\s*=\s*p_student_id/i);
  assert.match(migration, /return 'deleted'/i);
});
```

- [ ] **Step 2: Run the schema test and confirm RED**

Run:

```bash
node app/js/tests/student-archive-schema.test.mjs
```

Expected: FAIL because `20260903203000_student_archive_removal.sql` does not exist yet.

- [ ] **Step 3: Implement the migration and RPC**

Create `supabase/migrations/20260903203000_student_archive_removal.sql`:

```sql
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

- [ ] **Step 4: Run the schema contract test and full JS suite**

Run:

```bash
node app/js/tests/student-archive-schema.test.mjs
for file in app/js/tests/*.test.js app/js/tests/*.test.mjs; do node "$file"; done
```

Expected: schema test PASS and all existing tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add supabase/migrations/20260903203000_student_archive_removal.sql app/js/tests/student-archive-schema.test.mjs
git commit -m "feat: add student archive removal rpc"
```

---

### Task 2: Make the frontend load active students and use the RPC

**Files:**
- Modify: `app/js/core/script.js`
- Create: `app/js/tests/student-archive-frontend.test.mjs`

**Interfaces:**
- Consumes: `remove_student_from_operation({ p_student_id })` from Task 1.
- Produces: in-memory `couples` contains active students only.
- Produces: archived success copy `Cadastro removido. Histórico financeiro preservado.` and hard-delete success copy `Cadastro excluído.`.

- [ ] **Step 1: Write RED contracts for active loading and removal**

Create `app/js/tests/student-archive-frontend.test.mjs` initially with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync(new URL('../core/script.js', import.meta.url), 'utf8');

test('current student loaders exclude archived rows', () => {
  const activeFilters = script.match(/from\(['"]students['"]\)[\s\S]{0,180}?\.is\(['"]archived_at['"],\s*null\)/g) || [];
  assert.ok(activeFilters.length >= 2, 'both initial and post-local-migration student loads must filter archived_at');
});

test('removeCouple uses the archive-aware RPC', () => {
  assert.match(script, /rpc\(['"]remove_student_from_operation['"],\s*\{\s*p_student_id:\s*id\s*\}\)/);
  assert.doesNotMatch(script, /function removeCouple[\s\S]*?from\(['"]students['"]\)[\s\S]*?\.delete\(\)/);
  assert.match(script, /Cadastro removido\. Histórico financeiro preservado\./);
  assert.match(script, /Cadastro excluído\./);
});
```

- [ ] **Step 2: Run the frontend contract and confirm RED**

Run:

```bash
node app/js/tests/student-archive-frontend.test.mjs
```

Expected: FAIL because current loaders do not filter `archived_at` and `removeCouple` still calls `.delete()`.

- [ ] **Step 3: Filter both current student loads**

In both `loadData()` and the post-local-migration reload inside `migrateLocalData()`, change the `students` query to include:

```js
.from('students')
.select('*')
.is('archived_at', null)
.order('created_at', {ascending: false})
```

Do not change historical receipt/event queries in this task.

- [ ] **Step 4: Replace direct hard-delete in `removeCouple`**

Use this behavior:

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

- [ ] **Step 5: Run the frontend test and full JS suite**

```bash
node app/js/tests/student-archive-frontend.test.mjs
for file in app/js/tests/*.test.js app/js/tests/*.test.mjs; do node "$file"; done
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add app/js/core/script.js app/js/tests/student-archive-frontend.test.mjs
git commit -m "fix: remove students with archive-aware flow"
```

---

### Task 3: Exclude archived students from current financial history/reporting

**Files:**
- Modify: `app/js/features/reports.js`
- Modify: `app/js/tests/student-archive-frontend.test.mjs`

**Interfaces:**
- Consumes: active-only `couples` from Task 2.
- Produces: `reportEvents` contains only events whose `student_id` is still active, while database `payment_events` remain untouched.

- [ ] **Step 1: Add a failing report-event contract**

Append to `student-archive-frontend.test.mjs`:

```js
const reports = fs.readFileSync(new URL('../features/reports.js', import.meta.url), 'utf8');

test('current revenue history excludes events from archived students', () => {
  assert.match(reports, /const activeStudentIds = new Set\(couples\.map\(c => c\.id\)\)/);
  assert.match(reports, /reportEvents = \(data \|\| \[\]\)\.filter\(event => activeStudentIds\.has\(event\.student_id\)\)/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
node app/js/tests/student-archive-frontend.test.mjs
```

Expected: FAIL on the report-event filtering assertion.

- [ ] **Step 3: Filter event history after the existing query succeeds**

In `reports.js` `loadEvents()` replace:

```js
reportEvents = data || [];
```

with:

```js
const activeStudentIds = new Set(couples.map(c => c.id));
reportEvents = (data || []).filter(event => activeStudentIds.has(event.student_id));
```

Keep the database rows unchanged; this is a current-reporting filter only.

- [ ] **Step 4: Run focused + full tests**

```bash
node app/js/tests/student-archive-frontend.test.mjs
for file in app/js/tests/*.test.js app/js/tests/*.test.mjs; do node "$file"; done
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add app/js/features/reports.js app/js/tests/student-archive-frontend.test.mjs
git commit -m "fix: exclude archived students from current reports"
```

---

### Task 4: Make Automation Center treat archived students as historical only

**Files:**
- Modify: `app/js/features/automation-center.js`
- Modify: `app/js/tests/student-archive-frontend.test.mjs`

**Interfaces:**
- Consumes: `students.archived_at` from Task 1.
- Produces: readiness and current student map use active students only.
- Produces: a failed historical automation row for an archived student has no `Reenviar` button.

- [ ] **Step 1: Add failing Automation Center contracts**

Append:

```js
const automation = fs.readFileSync(new URL('../features/automation-center.js', import.meta.url), 'utf8');

test('Automation Center loads active students only', () => {
  const activeFilters = automation.match(/from\(['"]students['"]\)[\s\S]{0,220}?\.is\(['"]archived_at['"],\s*null\)/g) || [];
  assert.ok(activeFilters.length >= 2, 'message-name map and readiness student query must use active students');
});

test('historical messages for archived students cannot expose retry', () => {
  assert.match(
    automation,
    /canRetry\(message\)\s*&&\s*studentsById\.has\(message\.student_id\)/
  );
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node app/js/tests/student-archive-frontend.test.mjs
```

Expected: FAIL because Automation Center currently loads all students and retry ignores active status.

- [ ] **Step 3: Filter both Automation Center student queries**

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

Historical `automation_messages` remain loaded.

- [ ] **Step 4: Suppress retry for archived/missing students**

In `renderActivity()` use:

```js
const retry = canRetry(message) && studentsById.has(message.student_id)
    ? `<button type="button" class="automation-retry" data-retry-message="${message.id}">Reenviar</button>`
    : '<span></span>';
```

Do not change retry template payloads in this feature.

- [ ] **Step 5: Run focused + full tests**

```bash
node app/js/tests/student-archive-frontend.test.mjs
for file in app/js/tests/*.test.js app/js/tests/*.test.mjs; do node "$file"; done
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add app/js/features/automation-center.js app/js/tests/student-archive-frontend.test.mjs
git commit -m "fix: keep archived students out of current automations"
```

---

### Task 5: Enforce archived-state guards in Edge Functions

**Files:**
- Modify: `supabase/functions/payment-lifecycle/index.ts`
- Modify: `supabase/functions/process-reminders/index.ts`
- Modify: `supabase/functions/retry-automation-message/index.ts`
- Create: `app/js/tests/student-archive-backend.test.mjs`

**Interfaces:**
- Consumes: `students.archived_at` from Task 1.
- Produces: normal payment lifecycle and retries can resolve only active students.
- Produces: reminder batch loads only active students.
- Produces: historical monthly-receipt PDF repair can still run, but `repairEligible` is false for archived students so no new WhatsApp document is sent.

- [ ] **Step 1: Write backend guard contracts**

Create `app/js/tests/student-archive-backend.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lifecycle = fs.readFileSync(
  new URL('../../../supabase/functions/payment-lifecycle/index.ts', import.meta.url),
  'utf8'
);
const reminders = fs.readFileSync(
  new URL('../../../supabase/functions/process-reminders/index.ts', import.meta.url),
  'utf8'
);
const retry = fs.readFileSync(
  new URL('../../../supabase/functions/retry-automation-message/index.ts', import.meta.url),
  'utf8'
);

test('normal payment lifecycle resolves active students only', () => {
  assert.match(
    lifecycle,
    /eq\(["']id["'],\s*studentId\)[\s\S]{0,120}?is\(["']archived_at["'],\s*null\)/
  );
});

test('historical PDF repair does not send WhatsApp for archived students', () => {
  assert.match(lifecycle, /repairStudent[\s\S]*?archived_at/);
  assert.match(lifecycle, /repairEligible\s*=\s*!repairStudent\.archived_at\s*&&\s*isWhatsappEligible/);
});

test('reminder batch loads active students only', () => {
  assert.match(
    reminders,
    /from\(["']students["']\)[\s\S]{0,420}?is\(["']archived_at["'],\s*null\)/
  );
});

test('retry resolves active students only before creating a retry log', () => {
  assert.match(
    retry,
    /from\(["']students["']\)[\s\S]{0,420}?is\(["']archived_at["'],\s*null\)[\s\S]*?Student unavailable/
  );
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node app/js/tests/student-archive-backend.test.mjs
```

Expected: FAIL on all active-state guards.

- [ ] **Step 3: Guard normal `payment-lifecycle`**

For the normal `studentId` lookup, keep the existing selected fields and add:

```ts
.eq("id", studentId)
.is("archived_at", null)
.single();
```

This filter must occur before querying/creating `payment_events`, `receipts` or `automation_messages`.

- [ ] **Step 4: Preserve repair but disable new WhatsApp for archived students**

Add `archived_at` to the `repairStudent` select:

```ts
.select("id,class_id,academy_id,archived_at,person1,person2,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent")
```

Change eligibility to:

```ts
const repairEligible = !repairStudent.archived_at && isWhatsappEligible({
  phone: repairPhone,
  consent: repairConsent,
});
```

Do not block `requestMonthlyReceiptPdf(...)`; only outbound WhatsApp eligibility changes.

- [ ] **Step 5: Filter `process-reminders` students**

Change the student query chain to:

```ts
admin.from("students")
  .select("id,user_id,class_id,person1,person2,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent,fees,payments")
  .not("class_id", "is", null)
  .is("archived_at", null)
```

- [ ] **Step 6: Filter retry student resolution**

In `retry-automation-message`, add active filtering before `.single()`:

```ts
.eq("id", source.student_id)
.is("archived_at", null)
.single();
```

Keep the existing `Student unavailable` 409 behavior. Do not alter payment-confirmation parameter counts/template payloads in this task.

- [ ] **Step 7: Run focused + full tests**

```bash
node app/js/tests/student-archive-backend.test.mjs
for file in app/js/tests/*.test.js app/js/tests/*.test.mjs; do node "$file"; done
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add supabase/functions/payment-lifecycle/index.ts supabase/functions/process-reminders/index.ts supabase/functions/retry-automation-message/index.ts app/js/tests/student-archive-backend.test.mjs
git commit -m "fix: block archived students from backend operations"
```

---

### Task 6: Apply and prove the feature in DEV only

**Files:**
- No new production files beyond Tasks 1–5.
- Use branch: `fix/student-archive-removal` for source.
- Stage matching frontend files to `dev-preview` without replacing its DEV `supabase-config.js`.

**Interfaces:**
- DEV Supabase: `lulvvkrrysfmiqtefwnf`.
- DEV Vercel alias: `students-registration-git-f9c575-jdassaevy12345-6044s-projects.vercel.app`.
- PROD remains untouched.

- [ ] **Step 1: Re-run the exact final source suite before any DEV mutation**

```bash
for file in app/js/tests/*.test.js app/js/tests/*.test.mjs; do node "$file"; done
```

Expected: all tests PASS on the exact branch head.

- [ ] **Step 2: Apply only the new migration to DEV**

Use Supabase migration tooling against project `lulvvkrrysfmiqtefwnf` with migration name:

```text
student_archive_removal
```

and the exact SQL from `supabase/migrations/20260903203000_student_archive_removal.sql`.

Do not apply anything to `gswcruzlvkcoclbcrjvp`.

- [ ] **Step 3: Run transactional DB integration checks in DEV**

Run the following as one DEV SQL session. It creates temporary fixtures, exercises RLS/RPC behavior using two existing active academy members, asserts preservation/deletion, then rolls everything back:

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
    raise exception 'DEV needs two active academy members for archive tenant test';
  end if;
  if exists(select 1 from public.students where archived_at is not null) then
    raise exception 'pre-existing DEV student unexpectedly archived before controlled fixture test';
  end if;
end $$;

with inserted as (
  insert into public.students(user_id, academy_id, person1)
  select owner_user_id, owner_academy_id, 'Archive Test Receipt'
  from archive_test_context
  returning id
)
update archive_test_context set receipt_student_id = (select id from inserted);

with inserted as (
  insert into public.students(user_id, academy_id, person1)
  select owner_user_id, owner_academy_id, 'Archive Test Event'
  from archive_test_context
  returning id
)
update archive_test_context set event_student_id = (select id from inserted);

with inserted as (
  insert into public.students(user_id, academy_id, person1)
  select owner_user_id, owner_academy_id, 'Archive Test Clean'
  from archive_test_context
  returning id
)
update archive_test_context set clean_student_id = (select id from inserted);

with inserted as (
  insert into public.students(user_id, academy_id, person1)
  select owner_user_id, owner_academy_id, 'Archive Test Foreign Guard'
  from archive_test_context
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

Expected: no exception; all fixtures are rolled back.

- [ ] **Step 4: Run Supabase security/performance advisors after the DEV migration**

Check both advisor categories. Any new security advisory caused by the function/migration blocks staging until resolved. Existing unrelated advisories should be recorded, not silently conflated with this feature.

- [ ] **Step 5: Deploy only the three changed Edge Functions to DEV**

Deploy these source versions to project `lulvvkrrysfmiqtefwnf`, preserving their current JWT posture:

```text
payment-lifecycle           verify_jwt=true
process-reminders           verify_jwt=false
retry-automation-message    verify_jwt=true
```

Do not deploy any function to PROD.

- [ ] **Step 6: Stage only the matching frontend changes to `dev-preview`**

Copy the final branch versions of:

```text
app/js/core/script.js
app/js/features/reports.js
app/js/features/automation-center.js
```

plus the tests/migration/docs as desired for branch parity, while preserving `dev-preview`'s existing `app/js/core/supabase-config.js` that points at DEV. Verify the served frontend still contains Supabase ref `lulvvkrrysfmiqtefwnf` before sharing the preview.

- [ ] **Step 7: Create two manual DEV fixtures through the UI without WhatsApp**

While logged into DEV, create:

```text
Teste Sem Histórico
Teste Com Histórico
```

Leave WhatsApp blank/without consent for both. For `Teste Com Histórico`, mark exactly one mensalidade as paid so DEV creates a real `payment_event`/receipt without sending WhatsApp.

- [ ] **Step 8: Validate the user-visible behavior in DEV**

Check before deletion that `Teste Com Histórico` contributes to the current Financeiro total. Then:

1. Delete `Teste Com Histórico` — expect `Cadastro removido. Histórico financeiro preservado.`; it disappears from students/classes/current Financeiro/reports.
2. Refresh the browser — it must stay absent.
3. Delete `Teste Sem Histórico` — expect `Cadastro excluído.`; it stays absent after refresh.
4. Open Automations — archived student must not count in readiness/current student lookup and no historical failed row for that student may expose `Reenviar`.

- [ ] **Step 9: Verify manual DEV results in the database**

Query by exact test names:

```sql
select id, person1, archived_at
from public.students
where person1 in ('Teste Com Histórico', 'Teste Sem Histórico');
```

Expected: only `Teste Com Histórico` remains, with `archived_at IS NOT NULL`.

Then verify its history remains:

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

- [ ] **Step 10: Final source verification and checkpoint**

Run the full JS suite once more on the exact feature head. Confirm DEV Vercel deployment is `READY`, frontend is still pointed at DEV Supabase, and changed DEV Edge Function source hashes correspond to the feature source.

Stop here and ask the user to validate DEV. Do **not** open a PR, merge `main`, apply the PROD migration or deploy PROD functions until the user gives the next explicit approval.

---

## Final Self-Review Checklist

- Spec coverage: archive vs hard-delete, current totals, reports, receipts, tenant isolation, payment guard, reminder guard, retry guard, historical PDF repair and DEV-only rollout are each mapped to a task.
- No restore/archive-list UI is introduced.
- No WhatsApp template payload is changed in this plan.
- All new code paths have an explicit RED → GREEN cycle before DEV mutation.
- Production database, Edge Functions and Vercel deployment remain outside this plan's execution boundary until later approval.
