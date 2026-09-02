# Monthly Receipt Separation Validation

Date: 2026-09-02
Branch: `feat/separate-payment-receipts`
Environment: Supabase DEV `lulvvkrrysfmiqtefwnf`

## Automated gates
- [x] payment-receipt monthly/tenant tests
- [x] delegation client tests
- [x] lifecycle partial-success/repair tests
- [x] frontend repair tests
- [x] full Node suite — 90 tests, 90 pass, 0 fail on feature head `92dfabd07b5aa3f77493d9efbf6526dfe02909b1`
- [x] validation-doc head CI passed after implementation (`497539f9eadadae2cbfcf676719df3e0da46a094`)

## TDD evidence
- Task 1 RED: 80 total, 76 pass, 4 expected failures before `payment-receipt` implementation.
- Task 1 GREEN: 80/80.
- Task 2 RED: delegation helper missing (`ERR_MODULE_NOT_FOUND`).
- Task 2 GREEN: 82/82.
- Task 3 RED: 4 expected lifecycle contract failures.
- Task 3 GREEN: 87/87 after narrowing one false-positive test assertion.
- Task 4 RED: 5 expected frontend repair/feedback failures.
- Task 4 GREEN: 90/90.

## DEV Edge Functions
- [x] `payment-receipt` deployed with `verify_jwt=true` — version 4, ACTIVE, hash `b389b327c7b7a02636cb208232f142c1b1e725cd3c61bbeb8316ed58a80e6cfd`.
- [x] `payment-lifecycle` deployed with `verify_jwt=true` — version 6, ACTIVE, hash `4ba922829ea131aa0d3102fb8a14c31ea11c807701f9395e730478ccc9476749`.
- [x] Production Edge Functions were not changed during DEV validation.

### DEV divergence handled before deploy

Before deployment, DEV `payment-receipt` version 3 was found to contain logo/support/platform-admin code from the abandoned `feat/multi-academy-platform` branch rather than the current clean incremental architecture. Deployment was paused, the source was traced to that old branch, and only then was the stale DEV function replaced with the version from `feat/separate-payment-receipts`. The old implementation remains recoverable from its historical branch. Production was not affected.

## DEV data snapshot after deploy
- academies: 5
- active academy memberships: 5
- students: 6
- payment_events: 7
- receipts: 7
- active monthly receipts with pending PDF: 0
- active monthly receipts with ready PDF: 3

No database rows were modified to manufacture a failure state during this snapshot.

## Preview
- Vercel preview deployment: `dpl_HxYvaY79iNo3zhs99z91BKZSEKsB`
- State: READY
- Commit: `497539f9eadadae2cbfcf676719df3e0da46a094`
- Branch: `feat/separate-payment-receipts`

## Manual DEV flow
- [ ] monthly payment records payment_event
- [ ] active monthly receipt uses same academy_id
- [ ] PDF is generated through payment-receipt
- [ ] payment confirmation behavior remains correct
- [ ] receipt document is sent only when PDF exists
- [ ] registration flow remains unchanged

## Repair flow
- [ ] active monthly receipt with null storage_path shows Gerar PDF
- [ ] repair preserves receipt id
- [ ] repair preserves payment_event
- [ ] repair restores storage_path
- [ ] repair does not duplicate payment confirmation
- [ ] repair does not duplicate receipt document

## Tenant and idempotency checks
- [ ] no duplicate active monthly receipts
- [ ] no duplicate payment confirmation automation rows
- [ ] no duplicate receipt document automation rows
- [ ] cross-tenant receipt generation is rejected
- [ ] cross-tenant repair is rejected

## Final gate
- [ ] temporary CI workflow removed
- [ ] preview manually approved
- [ ] branch diff reviewed
- [ ] explicit merge approval received
