# Academy Profile and Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move institutional academy identity into the academy tenant, expose it in a tenant-aware “Meu Perfil” screen, and make receipts/WhatsApp consume that tenant-owned identity.

**Architecture:** `public.academies` becomes the single source of truth for official academy name, responsible person, support phone and optional display name. The browser reads/writes only the active `currentAcademyId` through RLS, while the payment lifecycle resolves identity from `student.academy_id` and verifies active academy membership before generating receipts or notifications.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Supabase Auth/Postgres/RLS/Edge Functions, Deno, `pdf-lib`, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-29-academy-profile-and-receipts-design.md`

## Global Constraints

- Branch: `feat/academy-profile-and-receipts`, based on `main`.
- Do not delete `academy_profiles` in this phase.
- Do not add academy logo, user management, subscriptions, password change, email change or extra roles.
- `academies.name` is the official academy name and receipt header source.
- WhatsApp may use `display_name || name`.
- Profile reads/writes must use `currentAcademyId`, never `currentUser.id`.
- Database RLS remains authoritative; frontend academy scoping is defense-in-depth.
- Missing active academy fails closed.
- UI must follow `docs/ui-motion-standard.md`: real skeleton only during remote load, no fake delays, real save loading state, transform/opacity/filter motion only, and `prefers-reduced-motion` support.
- All production changes use TDD: RED first, minimal GREEN, then regression.
- Use the existing Supabase DEV project for database/integration testing; do not apply migrations or functions to production without explicit user approval.
- Do not merge to `main` until DEV validation, full automated regression and explicit user approval.

---

## File Structure

- `supabase/migrations/20260901123000_academy_profile_identity.sql` — additive academy identity columns, legacy backfill and owner-only update RLS.
- `app/js/tests/academy-profile-schema.test.mjs` — static migration contract tests.
- `app/js/features/academy-profile.js` — focused “Meu Perfil” data/UI controller using active academy context.
- `app/css/academy-profile.css` — profile layout, skeleton, loading and reduced-motion rules.
- `app/js/tests/academy-profile.test.mjs` — profile data flow and fail-closed contract.
- `app/js/tests/academy-profile-motion.test.mjs` — loading/motion accessibility contract.
- `app/index.html` — loads profile stylesheet/script and exposes a profile entry point without reusing legacy `academy_profiles` UI.
- `supabase/functions/payment-lifecycle/index.ts` — membership-aware authorization and tenant-owned academy identity lookup.
- `app/js/tests/payment-lifecycle-academy-identity.test.mjs` — source/authorization contract for the Edge Function.
- `docs/validation/2026-09-01-academy-profile-and-receipts-validation.md` — DEV and final gate evidence.

The existing `app/js/features/academy-settings.js` remains legacy code during this phase. Do not add new institutional profile writes to it; the new profile surface is implemented separately so institutional identity is not mixed with student WhatsApp-contact behavior.

---

### Task 1: Academy Identity Migration and RLS

**Files:**
- Create: `supabase/migrations/20260901123000_academy_profile_identity.sql`
- Create: `app/js/tests/academy-profile-schema.test.mjs`

**Interfaces:**
- Consumes: existing `public.academies`, `public.academy_members`, `public.academy_profiles`, and `public.is_academy_member(uuid)` from Stage 1.
- Produces: `academies.responsible_name`, `academies.support_phone`, `academies.display_name`, and owner-only update access to the active academy.

- [ ] **Step 1: Write the failing migration contract test**

Create `app/js/tests/academy-profile-schema.test.mjs` that reads the migration text and asserts the required additive schema, backfill and RLS rules:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL('../../../supabase/migrations/20260901123000_academy_profile_identity.sql', import.meta.url),
  'utf8'
).toLowerCase();

test('academy identity migration adds tenant-owned profile fields', () => {
  assert.match(sql, /add column if not exists responsible_name text/);
  assert.match(sql, /add column if not exists support_phone text/);
  assert.match(sql, /add column if not exists display_name text/);
});

test('legacy academy_profiles values are backfilled without overwriting populated academy fields', () => {
  assert.match(sql, /from public\.academy_members/);
  assert.match(sql, /join public\.academy_profiles/);
  assert.match(sql, /coalesce\(nullif\(btrim\(academy\.responsible_name\), ''\), profile\.responsible_name/);
  assert.doesNotMatch(sql, /drop table[^;]*academy_profiles/);
});

test('only active owners can update academy institutional fields', () => {
  assert.match(sql, /role = 'owner'/);
  assert.match(sql, /is_active = true/);
  assert.match(sql, /for update/);
  assert.match(sql, /grant update/);
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test app/js/tests/academy-profile-schema.test.mjs
```

Expected: FAIL because the migration file does not exist yet.

- [ ] **Step 3: Implement the additive migration**

Create the migration with these core statements:

```sql
alter table public.academies
  add column if not exists responsible_name text not null default '',
  add column if not exists support_phone text,
  add column if not exists display_name text;

update public.academies academy
set
  responsible_name = coalesce(nullif(btrim(academy.responsible_name), ''), profile.responsible_name, ''),
  support_phone = coalesce(nullif(btrim(academy.support_phone), ''), profile.support_phone),
  display_name = coalesce(nullif(btrim(academy.display_name), ''), profile.display_name),
  updated_at = now()
from public.academy_members member
join public.academy_profiles profile on profile.user_id = member.user_id
where member.academy_id = academy.id
  and member.role = 'owner'
  and member.is_active = true
  and (
    btrim(academy.responsible_name) = ''
    or academy.support_phone is null
    or btrim(coalesce(academy.support_phone, '')) = ''
    or academy.display_name is null
    or btrim(coalesce(academy.display_name, '')) = ''
  );
```

Add an owner predicate helper or equivalent RLS expression. If using a helper, keep it read-only/security-definer and target-specific:

```sql
create or replace function public.is_academy_owner(target_academy uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_academy is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.academy_members member
      where member.academy_id = target_academy
        and member.user_id = auth.uid()
        and member.role = 'owner'
        and member.is_active = true
    );
$$;
```

Then add/update policy and grants:

```sql
drop policy if exists "Owners update own academy" on public.academies;
create policy "Owners update own academy"
on public.academies
for update
to authenticated
using (public.is_academy_owner(id))
with check (public.is_academy_owner(id));

grant update (name, responsible_name, support_phone, display_name, updated_at)
on public.academies to authenticated;
```

Do not drop or rewrite `academy_profiles` rows.

- [ ] **Step 4: Run GREEN and Stage 1 schema regressions**

Run:

```bash
node --test app/js/tests/academy-profile-schema.test.mjs app/js/tests/multi-academy-schema.test.mjs
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add supabase/migrations/20260901123000_academy_profile_identity.sql app/js/tests/academy-profile-schema.test.mjs
git commit -m "feat: add tenant-owned academy identity"
```

---

### Task 2: Tenant-Aware “Meu Perfil”

**Files:**
- Create: `app/js/features/academy-profile.js`
- Create: `app/css/academy-profile.css`
- Create: `app/js/tests/academy-profile.test.mjs`
- Create: `app/js/tests/academy-profile-motion.test.mjs`
- Modify: `app/index.html`

**Interfaces:**
- Consumes: `window.currentAcademyId`, global Supabase client `db`, authenticated `currentUser`, existing `toast`, existing dialog helpers when available, and existing phone normalization semantics.
- Produces: `window.AcademyProfile.open()`, `window.AcademyProfile.load()`, tenant-scoped academy profile reads/writes, and `academy-profile-updated` browser event carrying academy data.

- [ ] **Step 1: Write RED profile behavior tests**

Create a VM-based test harness similar to `academy-data-context.test.mjs`. Assert:

```js
test('profile loads the active academy by currentAcademyId', async () => {
  const h = harness({ academyId: 'academy-a', email: 'owner@example.com' });
  await h.context.window.AcademyProfile.load();
  assert.deepEqual(h.calls.filter(x => x[0] === 'academies'), [
    ['academies', 'from'],
    ['academies', 'select', 'id,name,responsible_name,support_phone,display_name'],
    ['academies', 'eq', 'id', 'academy-a'],
    ['academies', 'single']
  ]);
});

test('profile fails closed without an active academy', async () => {
  const h = harness({ academyId: null });
  await assert.rejects(() => h.context.window.AcademyProfile.load(), /academia ativa/i);
});

test('profile save updates only the active academy', async () => {
  const h = harness({ academyId: 'academy-a' });
  await h.context.window.AcademyProfile.save({
    name: 'Arte Nativa',
    responsibleName: 'Jackson de Mattia',
    supportPhone: '5548999999999',
    displayName: ''
  });
  assert.equal(JSON.stringify(h.lastUpdate), JSON.stringify({
    name: 'Arte Nativa',
    responsible_name: 'Jackson de Mattia',
    support_phone: '5548999999999',
    display_name: null
  }));
  assert.deepEqual(h.lastEq, ['id', 'academy-a']);
});
```

Also assert account email is rendered read-only and save does not call Supabase when academy name is blank or phone normalization fails.

- [ ] **Step 2: Run RED**

```bash
node --test app/js/tests/academy-profile.test.mjs
```

Expected: FAIL because `academy-profile.js` does not exist.

- [ ] **Step 3: Implement focused profile controller**

Create a small module with a strict active-academy guard:

```js
(() => {
  const academyId = () => {
    const value = String(window.currentAcademyId || '').trim();
    if (!value) throw new Error('A academia ativa não foi resolvida.');
    return value;
  };

  async function load() {
    const id = academyId();
    const { data, error } = await db
      .from('academies')
      .select('id,name,responsible_name,support_phone,display_name')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async function save(values) {
    const id = academyId();
    const name = String(values.name || '').trim();
    if (!name) throw new Error('Informe o nome da academia.');
    const supportPhone = normalizeProfilePhone(values.supportPhone);
    if (String(values.supportPhone || '').trim() && !supportPhone) {
      throw new Error('Informe um telefone válido.');
    }
    const payload = {
      name,
      responsible_name: String(values.responsibleName || '').trim(),
      support_phone: supportPhone,
      display_name: String(values.displayName || '').trim() || null
    };
    const { data, error } = await db
      .from('academies')
      .update(payload)
      .eq('id', id)
      .select('id,name,responsible_name,support_phone,display_name')
      .single();
    if (error) throw error;
    return data;
  }

  window.AcademyProfile = { load, save, open };
})();
```

Implement `open()` with a dedicated modal/card titled **Meu Perfil**, sections **Dados da academia** and **Conta**, and read-only email from the authenticated user.

- [ ] **Step 4: Add real loading/skeleton and motion contracts**

Create `academy-profile-motion.test.mjs` asserting:

```js
assert.match(css, /academy-profile-skeleton/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /transform/);
assert.match(css, /opacity/);
assert.doesNotMatch(css, /transition[^;]*(width|height|top|left)/i);
```

The form must expose `aria-busy="true"` while saving and disable duplicate submission. Skeleton is visible only while `load()` is pending; no timeout/fake delay.

- [ ] **Step 5: Integrate profile entry point in `index.html`**

Add stylesheet:

```html
<link rel="stylesheet" href="./css/academy-profile.css">
```

Add a `Meu Perfil` account button beside email/logout and load the profile script after core academy context and before unrelated feature scripts:

```html
<button type="button" class="btn btn-account" id="academyProfileBtn">Meu Perfil</button>
...
<script src="./js/features/academy-profile.js?v=1"></script>
```

Do not load the old institutional settings flow as the profile source.

- [ ] **Step 6: Run focused frontend regression**

```bash
node --test \
  app/js/tests/academy-profile.test.mjs \
  app/js/tests/academy-profile-motion.test.mjs \
  app/js/tests/index-integrity.test.mjs \
  app/js/tests/academy-context.test.mjs
```

Expected: PASS, 0 failures.

- [ ] **Step 7: Commit Task 2**

```bash
git add app/index.html app/css/academy-profile.css app/js/features/academy-profile.js app/js/tests/academy-profile.test.mjs app/js/tests/academy-profile-motion.test.mjs
git commit -m "feat: add tenant-aware academy profile"
```

---

### Task 3: Receipt and WhatsApp Identity from the Academy Tenant

**Files:**
- Modify: `supabase/functions/payment-lifecycle/index.ts`
- Create: `app/js/tests/payment-lifecycle-academy-identity.test.mjs`
- Test existing: `app/js/tests/payment-lifecycle-academy-data.test.mjs` if present after repository inspection; otherwise keep existing payment lifecycle tests in the full regression set.

**Interfaces:**
- Consumes: `student.academy_id`, `academy_members`, `academies.name`, `academies.display_name`, `academies.responsible_name`, `academies.support_phone`.
- Produces: membership-authorized lifecycle processing, official receipt identity from `academies`, and WhatsApp identity using `display_name || name`.

- [ ] **Step 1: Write RED Edge Function contract tests**

Read `supabase/functions/payment-lifecycle/index.ts` as text and assert:

```js
test('payment lifecycle authorizes through active academy membership', () => {
  assert.match(source, /from\("academy_members"\)/);
  assert.match(source, /eq\("academy_id", student\.academy_id\)/);
  assert.match(source, /eq\("user_id", user\.id\)/);
  assert.match(source, /eq\("is_active", true\)/);
});

test('payment lifecycle loads identity from academies instead of academy_profiles', () => {
  assert.match(source, /from\("academies"\)/);
  assert.match(source, /eq\("id", student\.academy_id\)/);
  assert.doesNotMatch(source, /from\("academy_profiles"\)/);
});

test('receipt uses official academy name while messaging can use display name', () => {
  assert.match(source, /academyName:\s*academy\.name/);
  assert.match(source, /academy\?\.display_name\s*\|\|\s*academy\?\.name/);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test app/js/tests/payment-lifecycle-academy-identity.test.mjs
```

Expected: FAIL because lifecycle still queries `academy_profiles` and authorizes with `student.user_id`.

- [ ] **Step 3: Replace user-only authorization with membership authorization**

After loading the student, require `student.academy_id` and an active membership:

```ts
if (!student.academy_id) return json({ error: "Academy not resolved" }, 409);

const { data: membership, error: membershipError } = await admin
  .from("academy_members")
  .select("academy_id,role,is_active")
  .eq("academy_id", student.academy_id)
  .eq("user_id", user.id)
  .eq("is_active", true)
  .maybeSingle();

if (membershipError) throw membershipError;
if (!membership) return json({ error: "Forbidden" }, 403);
```

Remove the authoritative dependency on:

```ts
if (student.user_id !== user.id) return json({ error: "Forbidden" }, 403);
```

The legacy `user_id` column remains stored; it simply stops being the authorization authority for academy-owned payment data.

- [ ] **Step 4: Load tenant-owned academy identity**

Replace the `academy_profiles` query with:

```ts
const { data: academy, error: academyError } = await admin
  .from("academies")
  .select("id,name,display_name,responsible_name,support_phone")
  .eq("id", student.academy_id)
  .single();

if (academyError || !academy) return json({ error: "Academy not found" }, 404);

const officialAcademyName = academy.name;
const messagingAcademyName = academy.display_name || academy.name;
```

Pass receipt data explicitly:

```ts
const pdfBytes = await generateReceiptPdf({
  receiptNumber: receipt.receipt_number,
  academyName: officialAcademyName,
  responsibleName: academy.responsible_name,
  supportPhone: academy.support_phone,
  studentName,
  className: clazz?.name || "Sem turma",
  paymentLabel: label,
  amount: receiptAmount,
  paidAt: receipt.paid_at,
  status: "active",
});
```

Use `messagingAcademyName` in WhatsApp template parameters.

- [ ] **Step 5: Run payment/receipt regressions**

```bash
node --test \
  app/js/tests/payment-lifecycle-academy-identity.test.mjs \
  app/js/tests/payment-automation-trigger.test.js \
  app/js/tests/receipts.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 6: Commit Task 3**

```bash
git add supabase/functions/payment-lifecycle/index.ts app/js/tests/payment-lifecycle-academy-identity.test.mjs
git commit -m "feat: use academy tenant identity in receipts"
```

---

### Task 4: DEV Database and Preview Integration

**Files:**
- Create/Modify: `docs/validation/2026-09-01-academy-profile-and-receipts-validation.md`
- No production database mutation.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: concrete DEV evidence for migration, RLS, profile persistence, receipt identity and tenant isolation.

- [ ] **Step 1: Apply the new migration only to `students-registration-dev`**

Use the exact branch migration file. Record migration result and verify columns/policies/functions exist.

Expected DEV schema:

```text
academies
- id
- name
- responsible_name
- support_phone
- display_name
- created_at
- updated_at
```

- [ ] **Step 2: Verify legacy backfill behavior in DEV**

Seed or use one controlled legacy `academy_profiles` row and an academy with empty institutional fields. After migration verify:

```text
academy_profiles row still exists
academy IDs unchanged
responsible_name copied only when destination empty
support_phone copied only when destination empty
non-empty academy values preserved
```

Record PASS/FAIL in the validation document.

- [ ] **Step 3: Verify owner and cross-academy RLS**

With Academy A and Academy B fixtures:

```text
A owner SELECT A profile -> allowed
A owner UPDATE A profile -> allowed
A owner UPDATE B profile by known UUID -> 0 rows / denied
B owner UPDATE A profile by known UUID -> 0 rows / denied
```

Also verify a missing/foreign membership cannot process an A receipt through the Edge Function.

- [ ] **Step 4: Deploy the branch Edge Function to DEV only**

Deploy `payment-lifecycle` from this branch to `students-registration-dev`. Do not deploy to production.

- [ ] **Step 5: Create a safe Vercel preview wired to DEV**

Use a preview-only branch/config as in Stage 1. Confirm the feature branch itself does not permanently replace production Supabase config.

- [ ] **Step 6: Manual profile/receipt validation**

In the DEV preview:

```text
Open Meu Perfil
Edit academy name/responsible/phone/display name
Save
Reload browser
Confirm values persist
Mark a monthly payment paid
Open generated PDF
Confirm official academy name appears in header
Confirm responsible appears
Confirm support phone appears
Confirm receipt remains linked to the same academy_id
```

Do not mark this task PASS until the user confirms the preview behavior.

- [ ] **Step 7: Commit validation evidence only after actual checks**

```bash
git add docs/validation/2026-09-01-academy-profile-and-receipts-validation.md
git commit -m "docs: validate academy profile and receipt identity"
```

---

### Task 5: Full Regression and Merge Gate

**Files:**
- Modify validation document only if new evidence is produced.
- Temporary CI workflow is allowed only on the feature branch and must be removed before merge.

**Interfaces:**
- Consumes: all completed tasks and user manual preview approval.
- Produces: a merge-ready branch, not a production deployment.

- [ ] **Step 1: Run the entire Node test suite on the exact branch head**

```bash
node --test app/js/tests/*.test.js app/js/tests/*.test.mjs
```

Expected: 0 failures.

If local network/runtime prevents this, use a temporary GitHub Actions workflow on this feature branch, record the exact run result, then remove the workflow before merge.

- [ ] **Step 2: Run syntax checks for changed browser/Edge files where supported**

```bash
node --check app/js/features/academy-profile.js
```

For the Deno TypeScript function, use existing repository-compatible validation or static contract tests; do not invent a production deploy as a syntax check.

- [ ] **Step 3: Review scope against the spec**

Confirm the final diff contains only:

```text
academy identity migration/RLS
Meu Perfil profile UI/data flow
receipt/payment lifecycle identity authorization
profile/receipt tests
validation documentation
```

Confirm it does **not** contain logo upload, account management, subscriptions, extra roles or deletion of `academy_profiles`.

- [ ] **Step 4: Reconfirm production rollout is still separate**

Before any production database/function change, explicitly note whether production has the Stage 1 multi-academy migration and this new migration applied. Never assume Git merge equals database migration.

- [ ] **Step 5: Ask for explicit merge approval**

Only after automated GREEN + DEV PASS + user manual PASS. Then create/merge a PR to `main` using the verified head SHA.

---

## Self-Review Results

- **Spec coverage:** migration, tenant ownership, legacy backfill, owner RLS, Meu Perfil, account email read-only, loading/motion, receipt identity, membership authorization, WhatsApp naming, DEV isolation, rollback compatibility and merge gate all map to explicit tasks.
- **Placeholder scan:** no TBD/TODO/“similar to” implementation steps remain.
- **Type/name consistency:** database fields consistently use `name`, `responsible_name`, `support_phone`, `display_name`; browser form mapping consistently uses `responsibleName`, `supportPhone`, `displayName`; receipt official name and messaging display name are intentionally distinct.
- **Production safety:** migrations/functions are DEV-first and production changes require separate explicit approval.
