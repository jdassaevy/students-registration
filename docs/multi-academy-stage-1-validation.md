# Multi-academy Stage 1 Validation

**Date:** 2026-08-29  
**Git branch:** `feat/multi-academy-foundation`  
**Base:** `main` (`dc235341f0218861e10ee23e3dc84a06d9895874`)  
**Production Supabase:** `gswcruzlvkcoclbcrjvp`  
**Validation Supabase:** `students-registration-dev` (`lulvvkrrysfmiqtefwnf`)  
**UI validation branch:** `test/multi-academy-stage1-preview`

## Gate status

**Overall:** PENDING UI regression only — do not merge to `main` yet.

Database migration, legacy preservation and bidirectional A/B tenant isolation are now validated on the separate DEV project. Production remained untouched.

The code review found and fixed two Stage 1 gaps before live validation:

1. `payment-lifecycle` was creating new `payment_events` and `receipts` without `academy_id`. It now reads `students.academy_id` and propagates it to both inserts.
2. `bootstrap_academy()` had a unique active-membership guard but concurrent calls could still race and make one caller fail. It now serializes bootstrap calls per authenticated user with `pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0))` before checking the active membership.

## Environment checks

| Check | Status | Evidence / notes |
| --- | --- | --- |
| Production remained untouched | PASS | Production still has the legacy schema; no Stage 1 DDL was applied during validation. |
| Existing DEV old multi-academy schema removed | PASS | The DEV `public` schema was reset because its data was explicitly approved as disposable. `auth` remained separate. |
| DEV rebuilt from current `main` baseline | PASS | Core schema, receipts storage configuration and automation schema were recreated from the current `main` definitions. |
| Stage 1 migration applies cleanly over current-main baseline | PASS | `academies`, `academy_members`, all four `academy_id` columns and both tenant RPCs were created successfully. |
| Separate UI preview uses DEV instead of production | PASS | `test/multi-academy-stage1-preview` changes only `supabase-config.js` to the DEV project; the feature branch keeps production config unchanged. |
| DEV `payment-lifecycle` matches feature branch | PASS | Edge Function version 4 deployed ACTIVE with JWT verification enabled. |

## Automated / contract validation

| Case | Status | Notes |
| --- | --- | --- |
| Full Node suite | PASS | GitHub Actions run `33260664671`, Node 22.23.2: **49 tests, 49 pass, 0 fail, 0 skipped, 0 cancelled**. Temporary CI workflow was removed afterwards. |
| Schema contract: tenant tables, `academy_id`, RLS, legacy preservation | PASS | Migration does not drop `user_id` or `academy_profiles`. |
| Single active academy per user | PASS | Partial unique index on `academy_members(user_id) where is_active = true`. |
| Bootstrap retry idempotency | PASS live DB | A second bootstrap call for Academy A returned the same academy UUID and kept one active membership. |
| Concurrent bootstrap hardening | PASS contract | Advisory transaction lock exists before membership lookup. |
| New payment events inherit academy | PASS contract + deployed DEV function | `student.academy_id` is propagated into `payment_events`. |
| New receipts inherit academy | PASS contract + deployed DEV function | `student.academy_id` is propagated into `receipts`. |

## New Academy A / Academy B database validation

Three internal Auth fixture users were created only in DEV (Academy A, Academy B and legacy). They do not use real email delivery.

| Case | Status |
| --- | --- |
| Bootstrap Academy A | PASS |
| Bootstrap Academy B | PASS |
| Exactly one active owner membership per user | PASS |
| New class has correct academy | PASS |
| New student has correct academy | PASS |
| New payment event has correct academy | PASS |
| New receipt has correct academy | PASS |
| Registration form with academy name | PENDING manual preview |
| Real signup/confirmation/login path | PENDING manual preview |

## Legacy account validation

A legacy fixture was created before bootstrap with one class, one student, one payment event and one receipt, all with `academy_id = null`.

**Before bootstrap:** counts `1/1/1/1`; payment-event total `100.00`; receipt total `100.00`.

**After bootstrap:** counts `1/1/1/1`; totals still `100.00`; all four original UUIDs still exist; all tenant columns are populated; exactly one active `owner` membership exists.

| Case | Status |
| --- | --- |
| Bootstrap creates one academy + owner membership | PASS |
| Existing class ID unchanged | PASS |
| Existing student ID unchanged | PASS |
| Existing payment-event ID unchanged | PASS |
| Existing receipt ID unchanged | PASS |
| Counts unchanged | PASS |
| Financial values unchanged | PASS |
| Previously-null tenant rows receive academy ID | PASS |
| Legacy onboarding UI blocks app until academy name | PASS automated contract / PENDING manual preview |

## A/B RLS isolation matrix

Tests were run using `role authenticated` and simulated JWT `sub`, never service-role access.

Both directions were executed: **A → B** and **B → A**. Each user also had a positive control proving their own class/student remained visible.

| Operation against the other academy | Expected | Status |
| --- | --- | --- |
| SELECT class by known UUID | No row visible | PASS both directions |
| SELECT student by known UUID | No row visible | PASS both directions |
| SELECT payment event by known UUID | No row visible | PASS both directions |
| SELECT receipt by known UUID | No row visible | PASS both directions |
| UPDATE class by known UUID | 0 rows | PASS both directions |
| UPDATE student by known UUID | 0 rows | PASS both directions |
| DELETE class by known UUID | 0 rows | PASS both directions |
| DELETE student by known UUID | 0 rows | PASS both directions |
| INSERT class with foreign `academy_id` | RLS denial | PASS both directions |
| INSERT student with foreign `academy_id` | RLS denial | PASS both directions |
| Own class/student remain visible | 1 row each | PASS |

## Supabase advisors

No new advisor finding invalidated the tenant-isolation design.

Security warnings observed:
- `bootstrap_academy` and `is_academy_member` are `SECURITY DEFINER` functions executable by `authenticated`; this is intentional for Stage 1 and both validate `auth.uid()`/membership. Their `search_path` is fixed to `public`.
- `protect_receipt_audit_fields` has mutable `search_path`; this function is inherited from `main` and is not introduced by Stage 1.
- leaked-password protection is disabled on the DEV Auth project; this is an environment/account setting, not a Stage 1 schema regression.

Performance advisor notes are informational (mostly existing unindexed FKs / unused indexes on the fresh test dataset) and do not block Stage 1 correctness.

## Manual UI regression surface

A Vercel preview exists on `test/multi-academy-stage1-preview`, isolated to the DEV Supabase project. These items still require browser interaction before merge:

| Existing behavior | Status |
| --- | --- |
| Register with academy name | PENDING preview |
| Email confirmation / login | PENDING preview |
| Logout | PENDING preview |
| Password recovery | PENDING preview |
| Create/delete class | PENDING preview |
| Create/edit/delete student | PENDING preview |
| Entry/monthly payment toggle | PENDING preview |
| Financial totals | PENDING preview |
| DOCX export per class | PENDING preview |
| Payment lifecycle / PDF receipt | PENDING preview |
| Existing WhatsApp behavior not otherwise changed | PENDING preview where configured |

## Scope review

The final feature branch is based directly on `main` and contains only:

- additive tenant migration;
- academy context/onboarding/data-context modules;
- onboarding motion/loading styles;
- Stage 1 tests and validation documentation;
- minimal `payment-lifecycle` tenant propagation required so new financial rows belong to the academy.

No Stage 1 implementation adds Meu Perfil, academy logo, platform admin, support mode, subscription/plans, extra academy roles or a wholesale WhatsApp redesign.

The DEV-only preview branch and DEV database fixtures are not part of the feature branch merge.

## Merge gate

Database-side gates are PASS. Do **not** merge until the manual preview regression confirms:

- signup/login/recovery/logout;
- class and student CRUD;
- financial display and DOCX export;
- payment toggle and receipt flow;
- no visible regression in the existing interface.
