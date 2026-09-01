# Academy Profile and Receipts Validation

Date: 2026-09-01
Branch: `feat/academy-profile-and-receipts`
Development integration environment: `students-registration-dev`
Production project: `students registration`

## Current status

Overall: **READY FOR MERGE — production database prepared; production payment-lifecycle deploy follows frontend deployment**

### Automated development gates

- [x] Task 1 migration/schema RED → GREEN.
- [x] Task 1 focused regression: 9 tests passed, 0 failed.
- [x] Task 2 profile behavior/motion RED → GREEN.
- [x] Task 2 focused regression: 16 tests passed, 0 failed.
- [x] Task 3 receipt identity/membership RED → GREEN.
- [x] Task 3 focused regression: 9 tests passed, 0 failed.
- [x] Legacy `academy-settings.js` dynamic loader regression added RED → GREEN; the user-owned settings UI is no longer injected.
- [x] Student WhatsApp phone/consent regression reproduced RED and fixed in a dedicated `student-whatsapp-contact.js` module without restoring legacy academy settings.
- [x] Production-specific legacy identity bootstrap gap reproduced RED and fixed with `20260901162000_academy_profile_bootstrap_backfill.sql`.
- [x] Supabase direct `anon` EXECUTE grants on academy SECURITY DEFINER functions reproduced and hardened with `20260901163000_academy_function_grants_hardening.sql`.
- [x] Final Node suite passed on commit `6a2a94fd875477593ad225e9351f562ae1a2b7ab`: **76 tests passed, 0 failed**.

### DEV integration gates

- [x] Applied `20260901123000_academy_profile_identity.sql` to DEV.
- [x] Applied `20260901162000_academy_profile_bootstrap_backfill.sql` to DEV.
- [x] Applied `20260901163000_academy_function_grants_hardening.sql` to DEV.
- [x] Legacy `academy_profiles` backfill is non-destructive. Fixture `Academia Legada` preserved its official tenant name while inheriting responsible person, support phone and display name; the legacy profile row remained intact.
- [x] Backfill is non-overwriting/idempotent for populated tenant values.
- [x] Owner can read/update own academy profile under authenticated RLS context.
- [x] Academy A cannot read/update Academy B profile; Academy B cannot update Academy A profile.
- [x] `Owners update own academy` policy uses `is_academy_owner(id)` for both USING and WITH CHECK.
- [x] Updated `payment-lifecycle` deployed to DEV as version 5, ACTIVE, preserving `verify_jwt=true`.
- [x] User manually validated Meu Perfil save/reload, receipt PDF with official academy identity, payment/receipt generation, and WhatsApp phone/consent save/edit.
- [x] Latest manual student contact record is tenant scoped and persisted both phone/consent timestamps.
- [x] Latest DEV payment event and receipt are tenant scoped with the same academy_id as their student.
- [x] Published isolated preview wired only to `students-registration-dev`.

### Production database gates

- [x] Pre-migration snapshot recorded: 4 classes, 5 students, 34 payment events (R$ 4.419,81), 9 receipts (R$ 1.400,00).
- [x] Applied Stage 1 `multi_academy_foundation` migration to production.
- [x] Post-foundation snapshot preserved exactly the same row counts and financial totals; all legacy rows remained with `academy_id = null` until user bootstrap.
- [x] Applied `academy_profile_identity` migration to production.
- [x] Applied `academy_profile_bootstrap_backfill` migration to production so existing `academy_profiles` identity is preserved on first tenant bootstrap.
- [x] Applied `academy_function_grants_hardening` migration to production.
- [x] Production post-migration snapshot still preserves 4 classes, 5 students, 34 payment events (R$ 4.419,81), and 9 receipts (R$ 1.400,00).
- [x] No production academy/member was created artificially; existing users bootstrap through the authenticated application flow.
- [x] `anon` has no EXECUTE privilege on `bootstrap_academy`, `is_academy_member`, or `is_academy_owner`; `authenticated` retains required access.
- [x] Security/performance advisors checked. Remaining SECURITY DEFINER warnings for `authenticated` are intentional for these RPC/RLS helpers; unrelated pre-existing security/performance notices remain outside this feature scope.

### Final gate

- [x] Full Node suite passes: **76/76**.
- [x] User manually approves the final preview after WhatsApp consent restoration.
- [x] User explicitly authorizes the safe production migration path and merge to `main`.
- [x] Production database is prepared before frontend merge.
- [ ] Merge feature branch to `main`.
- [ ] Confirm production frontend deployment is healthy.
- [ ] Deploy updated `payment-lifecycle` to production after frontend deployment, then verify function status.
