# Multi-academy Stage 1 Validation

**Date:** 2026-08-29  
**Git branch:** `feat/multi-academy-foundation`  
**Base:** `main` (`dc235341f0218861e10ee23e3dc84a06d9895874`)  
**Production Supabase:** `gswcruzlvkcoclbcrjvp`  
**Existing dev Supabase:** `lulvvkrrysfmiqtefwnf`

## Gate status

**Overall:** PENDING — do not merge to `main` yet.

The code review found and fixed two Stage 1 gaps before live validation:

1. `payment-lifecycle` was creating new `payment_events` and `receipts` without `academy_id`. It now reads `students.academy_id` and propagates it to both inserts.
2. `bootstrap_academy()` had a unique active-membership guard but concurrent calls could still race and make one caller fail. It now serializes bootstrap calls per authenticated user with `pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0))` before checking the active membership.

## Environment checks

| Check | Status | Evidence / notes |
| --- | --- | --- |
| Production remains on legacy schema | PASS | `academies` and `academy_members` are absent; `academy_id` is absent from `classes`, `students`, `payment_events`, and `receipts`; tenant RPCs are absent. No Stage 1 DDL was applied to production during validation. |
| Existing `students-registration-dev` is a clean copy of production | FAIL / unsuitable | It already contains the previous multi-academy migration stack and existing tenant data, so it cannot prove the new additive migration starting from current `main`. |
| Clean Supabase branch available for live test | PENDING | A fresh branch from production is the recommended environment. Current quoted Supabase branch cost: US$ 0.01344/hour while it exists. Requires explicit user cost confirmation before creation. |

## Automated / contract validation

| Case | Status | Notes |
| --- | --- | --- |
| Schema contract: tenant tables, `academy_id`, RLS, legacy preservation | PASS | Migration contains the required structures and does not drop `user_id` or `academy_profiles`. |
| Single active academy per user | PASS | Partial unique index on `academy_members(user_id) where is_active = true`. |
| Concurrent bootstrap idempotency | PASS | Advisory transaction lock added before membership lookup. |
| New payment events inherit academy | PASS | `payment-lifecycle` selects `student.academy_id` and inserts it into `payment_events`. |
| New receipts inherit academy | PASS | `payment-lifecycle` inserts `student.academy_id` into `receipts`. |
| Full `node --test app/js/tests/*.test.js app/js/tests/*.test.mjs` after final fixes | PASS | GitHub Actions run `33260664671`, Node 22.23.2: **49 tests, 49 pass, 0 fail, 0 skipped, 0 cancelled**. The temporary validation workflow was removed after the successful run. |

## New account A validation

| Case | Status |
| --- | --- |
| Register with academy name | PENDING live preview |
| Confirm email and sign in | PENDING live preview |
| Exactly one `academies` row created | PENDING clean Supabase branch |
| Exactly one active `academy_members` owner row | PENDING clean Supabase branch |
| New class has Academy A `academy_id` | PENDING clean Supabase branch |
| New student has Academy A `academy_id` | PENDING clean Supabase branch |
| New payment event has Academy A `academy_id` | PENDING clean Supabase branch |
| New receipt has Academy A `academy_id` | PENDING clean Supabase branch |

## Legacy account validation

Before bootstrap, capture IDs/counts/totals for the legacy user's classes, students, payment events and receipts.

| Case | Status |
| --- | --- |
| Legacy user is blocked by academy onboarding | PENDING live preview |
| Bootstrap creates one academy + owner membership | PENDING clean Supabase branch |
| Existing class IDs unchanged | PENDING clean Supabase branch |
| Existing student IDs unchanged | PENDING clean Supabase branch |
| Existing payment-event IDs unchanged | PENDING clean Supabase branch |
| Existing receipt IDs unchanged | PENDING clean Supabase branch |
| Counts unchanged | PENDING clean Supabase branch |
| Financial totals unchanged | PENDING live preview / DB comparison |
| Previously-null tenant rows receive the new `academy_id` | PENDING clean Supabase branch |

## A/B RLS isolation matrix

Run each direction (A → B and B → A) using authenticated clients, not service-role clients.

| Operation against the other academy | Expected | Status |
| --- | --- | --- |
| SELECT class by known UUID | No row visible | PENDING |
| SELECT student by known UUID | No row visible | PENDING |
| SELECT payment event by known UUID | No row visible | PENDING |
| SELECT receipt by known UUID | No row visible | PENDING |
| UPDATE class/student by known UUID | 0 rows / denied | PENDING |
| DELETE class/student by known UUID | 0 rows / denied | PENDING |
| INSERT class with foreign `academy_id` | Denied by RLS | PENDING |
| INSERT student with foreign `academy_id` | Denied by RLS | PENDING |

## Regression surface

| Existing behavior | Status |
| --- | --- |
| Login | PENDING preview |
| Logout | PENDING preview |
| Password recovery | PENDING preview |
| Create/delete class | PENDING preview |
| Create/edit/delete student | PENDING preview |
| Entry/monthly payment toggle | PENDING preview |
| Financial totals | PENDING preview |
| DOCX export per class | PENDING preview |
| Payment lifecycle | PENDING preview / clean DB |
| Receipt generation/download | PENDING preview / clean DB |
| Existing WhatsApp flow not otherwise changed | PENDING regression test |

## Scope review

Current branch is based directly on `main` and Stage 1 changes are limited to:

- additive tenant migration;
- academy context/onboarding/data-context modules;
- onboarding motion/loading styles;
- Stage 1 tests and documentation;
- minimal `payment-lifecycle` tenant propagation required so newly created financial rows are actually associated with the active academy.

No Stage 1 implementation adds Meu Perfil, academy logo, platform admin, support mode, subscription/plans, extra academy roles or a wholesale WhatsApp redesign.

## Merge gate

Do **not** merge while any of the following remain pending:

- clean migration application from current production schema;
- new-account Academy A validation;
- legacy-account ID/count/value preservation validation;
- A/B database isolation proof in both directions;
- regression pass for login/recovery/classes/students/financial/DOCX/payments/receipts.
