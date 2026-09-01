# Academy Profile and Receipts Validation

Date: 2026-09-01
Branch: `feat/academy-profile-and-receipts`
Target integration environment: `students-registration-dev`
Production database mutation: **none**

## Current status

Overall: **PENDING — do not merge**

### Automated development gates

- [x] Task 1 migration/schema RED → GREEN.
- [x] Task 1 focused regression: 9 tests passed, 0 failed.
- [x] Task 2 profile behavior/motion RED → GREEN.
- [x] Task 2 focused regression: 16 tests passed, 0 failed.
- [x] Task 3 receipt identity/membership RED → GREEN.
- [x] Task 3 focused regression: 9 tests passed, 0 failed.

### DEV integration gates

- [ ] Apply `20260901123000_academy_profile_identity.sql` to DEV only.
- [ ] Verify legacy `academy_profiles` backfill is non-destructive.
- [ ] Verify owner can read/update own academy profile.
- [ ] Verify Academy A cannot update Academy B profile and vice versa.
- [ ] Deploy updated `payment-lifecycle` Edge Function to DEV only.
- [ ] Confirm a user without membership cannot process another academy receipt.
- [ ] Publish a preview wired only to DEV.
- [ ] Manually edit/save/reload Meu Perfil.
- [ ] Generate receipt and verify official academy name, responsible and phone.
- [ ] Confirm payment and receipt rows remain tenant scoped.

### Final gate

- [ ] Full Node suite passes on final branch tree.
- [ ] Final branch diff contains only approved feature scope.
- [ ] User manually approves preview behavior.
- [ ] User explicitly approves merge to `main`.
