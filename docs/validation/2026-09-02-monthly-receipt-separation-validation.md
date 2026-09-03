# Monthly Receipt Separation Validation

Date: 2026-09-02 — final verification 2026-09-03
Branch: `feat/separate-payment-receipts`
Environment: Supabase DEV `lulvvkrrysfmiqtefwnf`

## Automated gates
- [x] payment-receipt monthly/tenant tests
- [x] delegation client tests
- [x] lifecycle partial-success/repair tests
- [x] frontend repair tests
- [x] implementation suite reached 90/90 before final security review
- [x] security-review RED reproduced on `069f40be432cbda67bb5c3dc7ade553baf5cf161` — 92 tests, 90 pass, 2 expected tenant-isolation failures
- [x] security-review GREEN on `5a2ef199403f68c2ec9c4ddc0ac652149c6d968e` — 92 tests, 92 pass, 0 fail

## TDD evidence
- Task 1 RED: 80 total, 76 pass, 4 expected failures before `payment-receipt` implementation.
- Task 1 GREEN: 80/80.
- Task 2 RED: delegation helper missing (`ERR_MODULE_NOT_FOUND`).
- Task 2 GREEN: 82/82.
- Task 3 RED: 4 expected lifecycle contract failures.
- Task 3 GREEN: 87/87 after narrowing one false-positive test assertion.
- Task 4 RED: 5 expected frontend repair/feedback failures.
- Task 4 GREEN: 90/90.
- Final security RED: receipt worker and repair path lacked explicit referenced-student/class tenant consistency checks; 2 new tests failed as expected.
- Final security GREEN: `payment-receipt` now validates student/class `academy_id` before PDF reuse/generation, and repair validates the receipt student `academy_id` before delegation; 92/92 passed.

## DEV Edge Functions
- [x] `payment-receipt` deployed with `verify_jwt=true` — version 5, ACTIVE, hash `1ca76f082fa987a096cefdecee928230b21fb64973a1ce39ebb2c3fae6d5ca9b`.
- [x] `payment-lifecycle` deployed with `verify_jwt=true` — version 7, ACTIVE, hash `8263c1f3746e9a3613eef932bcc272e2969c02528c5c6c3587bf533de9fc925b`.
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
- [x] registration flow remains unchanged

Monthly validation record:
- payment_event: `a2cfdd17-b7e6-49b6-9182-16baa6cebd17`
- receipt: `f7723db4-7462-46e5-94c7-a3a4b217b0af`
- academy_id on both: `a3673ef7-3a90-4817-b263-13b3f7d25b5d`
- person/installment: `person2`, monthly installment 1
- amount: R$ 150.00
- active receipt count for identity: 1
- payment event count for identity: 1

The WhatsApp failures are separate Meta/configuration issues and did not roll back or duplicate payment/receipt state. The payment-confirmation body parameter list in this feature is unchanged from `main`, so the `132000` template mismatch was not introduced by monthly receipt separation.

### Registration regression

Manual mark/unmark of an enrollment payment completed on DEV using the same preview:
- receipt: `6231afc0-28e8-49a9-bf99-a6c276a6c6eb`
- person: `person2`
- amount: R$ 15.00
- final student entry-payment flag: false
- active entry payment events for identity: 0
- active entry receipts for identity: 0
- receipt final status: `voided`
- PDF remains stored at `cd63d9a2-c88c-4203-b19a-18d3e8271733/6231afc0-28e8-49a9-bf99-a6c276a6c6eb.pdf`

This confirms registration stayed on the existing inline lifecycle path and was not routed through the monthly-only receipt worker.

## Repair flow
- [x] active monthly receipt with null storage_path shows Gerar PDF
- [x] repair preserves receipt id — `f7723db4-7462-46e5-94c7-a3a4b217b0af`
- [x] repair preserves payment_event — `a2cfdd17-b7e6-49b6-9182-16baa6cebd17`
- [x] repair restores storage_path
- [x] repair does not duplicate payment confirmation — still exactly 1 row
- [x] repair does not duplicate receipt document — still exactly 1 row
- [x] repaired row returns to `Visualizar` in the preview
- [x] repair repeated successfully after final tenant hardening on 2026-09-03

Restored path: `cd63d9a2-c88c-4203-b19a-18d3e8271733/f7723db4-7462-46e5-94c7-a3a4b217b0af.pdf`.

Final hardened repair verification:
- receipt status: `active`
- active receipt count for payment identity: 1
- payment_event count for payment identity: 1
- payment flag remained paid
- payment confirmation rows for receipt: 1
- receipt document rows for receipt: 1
- Storage object exists as `application/pdf`, 1799 bytes
- Storage object updated at `2026-09-03 13:04:52+00`

## Tenant and idempotency checks
- [x] no duplicate active monthly receipts — global DEV duplicate query returned zero rows after repair
- [x] no duplicate payment confirmation automation rows — global duplicate query returned zero rows
- [x] no duplicate receipt document automation rows — global duplicate query returned zero rows
- [x] cross-tenant receipt generation fails closed by explicit student/class academy consistency checks, covered by automated security test
- [x] cross-tenant repair fails closed by explicit receipt-student academy consistency check, covered by automated security test
- [x] runtime hardened repair validated using a consistent same-tenant receipt after deploying DEV versions 5/7

## Final gate
- [x] final full Node suite on cleaned feature code head — 92/92 on `5a2ef199403f68c2ec9c4ddc0ac652149c6d968e`
- [x] temporary CI workflow absent from feature branch
- [x] preview manually approved after monthly, repair, registration, and hardened-repair validation
- [x] branch diff reviewed against `main`; no DEV configuration or temporary workflow in feature diff
- [x] frontend repair/payment integration reviewed after hardening
- [ ] exact final documentation head CI
- [ ] explicit merge approval received
