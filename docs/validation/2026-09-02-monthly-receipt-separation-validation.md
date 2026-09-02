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

## Preview isolation correction

The first Vercel preview generated directly from `feat/separate-payment-receipts` still used the repository production Supabase configuration. A manual monthly-payment test therefore reached production before the configuration mismatch was detected.

Impact was limited to one second installment (`person2`, monthly installment 2, R$ 250.00): one `payment_event` and one active receipt were created, with no WhatsApp automation rows. With explicit user approval, the exact test payment was reverted in a guarded transaction: the student payment flag was restored to unpaid, the exact test `payment_event` was deleted, and the receipt was changed to `voided`; its PDF remains stored as audit history.

The unsafe preview must not be reused for DEV validation.

A dedicated temporary validation branch was then created:
- Branch: `test/separate-payment-receipts-dev-preview`
- Commit: `03adfaa1b279cdd5cc98247d616fb6d0f5b8f1e3`
- Only environment-specific change: `app/js/core/supabase-config.js` points to Supabase DEV `lulvvkrrysfmiqtefwnf` using its DEV publishable key.
- Vercel deployment: `dpl_9MvLS95kQFHw6aJpTXhPmxdc4BMr`
- State: READY
- Target: preview only

## Manual DEV flow
- [x] monthly payment records payment_event
- [x] active monthly receipt uses same academy_id
- [x] PDF is generated through payment-receipt
- [ ] payment confirmation Meta delivery succeeds — blocked by existing template parameter mismatch (`132000`); lifecycle recorded one failed attempt and payment/PDF remained successful
- [x] receipt document is attempted only when PDF exists; DEV Meta rejected delivery with re-engagement error (`131047`)
- [ ] registration flow remains unchanged — manual regression still pending

Monthly validation record:
- payment_event: `a2cfdd17-b7e6-49b6-9182-16baa6cebd17`
- receipt: `f7723db4-7462-46e5-94c7-a3a4b217b0af`
- academy_id on both: `a3673ef7-3a90-4817-b263-13b3f7d25b5d`
- person/installment: `person2`, monthly installment 1
- amount: R$ 150.00
- active receipt count for identity: 1
- payment event count for identity: 1

The WhatsApp failures are recorded as separate Meta/configuration issues and did not roll back or duplicate payment/receipt state.

## Repair flow
- [x] active monthly receipt with null storage_path shows Gerar PDF
- [x] repair preserves receipt id — `f7723db4-7462-46e5-94c7-a3a4b217b0af`
- [x] repair preserves payment_event — `a2cfdd17-b7e6-49b6-9182-16baa6cebd17`
- [x] repair restores storage_path
- [x] repair does not duplicate payment confirmation — still exactly 1 row
- [x] repair does not duplicate receipt document — still exactly 1 row
- [x] repaired row returns to `Visualizar` in the preview

Restored path: `cd63d9a2-c88c-4203-b19a-18d3e8271733/f7723db4-7462-46e5-94c7-a3a4b217b0af.pdf`.

## Tenant and idempotency checks
- [x] no duplicate active monthly receipts — global DEV duplicate query returned zero rows after repair
- [x] no duplicate payment confirmation automation rows — global duplicate query returned zero rows
- [x] no duplicate receipt document automation rows — global duplicate query returned zero rows
- [ ] cross-tenant receipt generation is rejected — covered by automated source contract; no cross-tenant runtime mutation performed
- [ ] cross-tenant repair is rejected — covered by automated source contract; no cross-tenant runtime mutation performed

## Final gate
- [ ] temporary CI workflow removed
- [ ] preview manually approved after registration regression
- [ ] branch diff reviewed
- [ ] explicit merge approval received
