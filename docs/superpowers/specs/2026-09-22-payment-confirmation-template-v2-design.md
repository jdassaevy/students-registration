# Payment Confirmation Template V2 — Meta WhatsApp

Date: 2026-09-22
Status: staged, not activated

## Goal

Use the academy identity already stored in Meu Perfil in the WhatsApp payment confirmation:

- academy display name, falling back to academy name;
- academy support phone.

## Meta template

New template name: `dassaevy_payment_confirmation_v2`

Body variables:

1. student name
2. payment label (`Inscrição`, `1ª Mensalidade`, etc.)
3. formatted amount
4. academy display name/name
5. support phone from Meu Perfil

Suggested body:

```text
✅ Pagamento confirmado!

Olá, {{1}}! Recebemos o pagamento referente a {{2}}, no valor de {{3}}.

🏫 {{4}}
📞 Contato: {{5}}

Pagamento registrado com sucesso. Obrigado!
```

## Safe activation

The existing approved template `dassaevy_payment_confirmation` remains the default.

The Edge Functions only use V2 when `META_PAYMENT_CONFIRMATION_V2_ENABLED=true` and the academy has a non-empty support phone. Otherwise they fall back to the current four-variable template.

This lets the code ship before Meta approval without changing production messages.

## Retry consistency

The normal payment flow and Retry action now share the same payment-confirmation template builder.

Previously the normal flow sent four variables while Retry constructed seven variables for `payment_confirmation`, which could violate the approved Meta template contract. V2 fixes this by centralizing the parameter order.

## Data safety

No payment, receipt, student, academy or automation row is changed by this feature. The only data read from Meu Perfil are the academy identity fields already used elsewhere by receipts and void notifications.
