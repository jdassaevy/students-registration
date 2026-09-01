# Academy Profile and Receipts Validation

Date: 2026-09-01
Branch: `feat/academy-profile-and-receipts`
Target integration environment: `students-registration-dev`
Production database mutation: **none**

## Current status

Overall: **PENDING — final browser check before merge**

### Automated development gates

- [x] Task 1 migration/schema RED → GREEN.
- [x] Task 1 focused regression: 9 tests passed, 0 failed.
- [x] Task 2 profile behavior/motion RED → GREEN.
- [x] Task 2 focused regression: 16 tests passed, 0 failed.
- [x] Task 3 receipt identity/membership RED → GREEN.
- [x] Task 3 focused regression: 9 tests passed, 0 failed.
- [x] Legacy `academy-settings.js` dynamic loader regression added RED → GREEN; the user-owned settings UI is no longer injected.
- [x] Student WhatsApp phone/consent regression reproduced RED and fixed in a dedicated `student-whatsapp-contact.js` module without restoring legacy academy settings.
- [x] Full Node suite passed on commit `54a509ea8b2ad52e1a2abd27b907a48a18c29bc9`: 72 tests passed, 0 failed.

### DEV integration gates

- [x] Applied `20260901123000_academy_profile_identity.sql` to DEV only. Production remained untouched.
- [x] Legacy `academy_profiles` backfill is non-destructive. Fixture `Academia Legada` preserved its official tenant name while inheriting responsible person, support phone and display name; the legacy profile row remained intact.
- [x] Backfill is non-overwriting/idempotent for populated tenant values. Conflicting legacy values for Academia A did not replace current `academies` identity values.
- [x] Owner can read/update own academy profile under authenticated RLS context.
- [x] Academy A cannot read/update Academy B profile; Academy B cannot update Academy A profile.
- [x] `Owners update own academy` policy uses `is_academy_owner(id)` for both USING and WITH CHECK.
- [x] Updated `payment-lifecycle` deployed to DEV as version 5, ACTIVE, preserving `verify_jwt=true`.
- [x] Database advisors checked after migration. No feature-blocking advisory was introduced; existing/intentional SECURITY DEFINER and pre-existing index/auth warnings remain documented by Supabase.
- [x] User manually validated Meu Perfil save/reload and receipt PDF with official academy identity before the WhatsApp UI regression was found.
- [x] User manually validated payment/receipt generation after the academy identity changes.
- [ ] Confirm through a real authenticated Edge Function request that a user without membership receives 403 when attempting another academy's student. Connector has no auth-user/session action, so this is not claimed from privileged SQL simulation.
- [x] Published isolated preview branch wired only to `students-registration-dev`.
- [ ] Final browser check: WhatsApp phone and consent controls are visible again for person 1/person 2 and can be saved/edited.
- [ ] Confirm the new payment and receipt rows created by the final manual flow remain tenant scoped.

### Final gate

- [x] Full Node suite passes: 72/72.
- [ ] Final branch diff contains only approved feature scope.
- [ ] User manually approves the final preview after WhatsApp consent restoration.
- [ ] User explicitly approves merge to `main` after final preview validation.
