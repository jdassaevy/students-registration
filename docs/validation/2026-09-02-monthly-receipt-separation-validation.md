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
- [ ] payment-receipt deployed with verify_jwt=true
- [ ] payment-lifecycle deployed with verify_jwt=true

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
