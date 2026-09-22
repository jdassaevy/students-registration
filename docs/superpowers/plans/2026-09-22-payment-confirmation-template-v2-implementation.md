# Payment Confirmation Template V2 — Rollout Plan

Date: 2026-09-22
Branch: `feature/payment-confirmation-v2-meta`

## Gate 1 — Repository

1. Add the V2 template name without changing the current default.
2. Centralize payment-confirmation parameters in one shared helper.
3. Use the helper in normal payment confirmation and Retry.
4. Keep `payment_voided` on its independent seven-variable contract.
5. Add regression tests.

## Gate 2 — Code deployment

1. CI must be green.
2. Deploy the updated Edge Functions with V2 still inactive.
3. Verify current V1 confirmation continues to use four parameters.
4. Verify Retry uses the same four-parameter V1 contract.

## Gate 3 — Meta approval

1. Create `dassaevy_payment_confirmation_v2` in WhatsApp Manager using the documented five variables.
2. Wait until Meta marks the template Approved.
3. Confirm every academy that should use V2 has a support phone in Meu Perfil.

## Gate 4 — Activation

1. Set `META_PAYMENT_CONFIRMATION_TEMPLATE=dassaevy_payment_confirmation_v2` in the Supabase Edge Function environment.
2. Test one real payment confirmation.
3. Test Retry on a failed confirmation.
4. Keep the old template available as automatic fallback for academies without a support phone.

No template switch happens before Meta approval.
