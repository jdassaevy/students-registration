# Monthly Receipt Separation Design

**Date:** 2026-09-02  
**Branch:** `feat/separate-payment-receipts`  
**Status:** Approved design — pending implementation plan

## 1. Context

The current `payment-lifecycle` Edge Function owns several responsibilities at once:

- validates the authenticated user and academy membership;
- records/removes `payment_events`;
- creates/reuses/voids `receipts`;
- generates receipt PDFs;
- uploads PDFs to Storage;
- sends WhatsApp payment confirmations;
- sends receipt documents;
- sends payment-voided notifications.

This works today, but it couples financial state, document generation, Storage, and messaging into a single execution path. A PDF/Storage failure can therefore make the whole operation harder to reason about even though the payment itself is the primary business fact.

The repository already contains a `payment-receipt` Edge Function that can generate a PDF from a `receipt_id`, but it still uses the old user-owned academy model (`receipt.user_id` + `academy_profiles`) and is not yet aligned with the current multi-academy architecture.

## 2. Scope

This change separates receipt PDF generation **only for monthly payments** (`kind = 'monthly'`, installments 1, 2, and 3).

### In scope

- Modernize the existing `payment-receipt` Edge Function.
- Make it tenant-aware through `academy_members` and `academies`.
- Restrict it to monthly receipts only.
- Move monthly PDF generation and Storage upload out of `payment-lifecycle` into `payment-receipt`.
- Preserve payment confirmation WhatsApp behavior even when PDF generation fails.
- Keep receipt-document WhatsApp delivery dependent on a successfully generated PDF.
- Support safe PDF retry/repair without creating duplicate receipts.
- Preserve existing monthly void behavior.
- Validate the complete flow in DEV before production rollout.

### Explicitly out of scope

- Changing registration/enrollment payment (`kind = 'entry'`) behavior.
- Moving payment confirmation WhatsApp out of `payment-lifecycle`.
- Moving payment void WhatsApp out of `payment-lifecycle`.
- Creating a new receipt table or changing receipt numbering.
- Deleting historical receipt PDFs when a payment is voided.
- Changing the number of monthly installments.
- Reworking automation settings or WhatsApp templates.

## 3. Design principles

1. **Payment state is authoritative.** A PDF failure must never undo a real paid monthly installment.
2. **Receipt row and PDF file are separate lifecycle states.** A receipt may be valid in the database while `storage_path` is temporarily null.
3. **One owner for financial state.** `payment-lifecycle` remains the only component that creates/removes `payment_events` and changes receipt active/voided state.
4. **One owner for monthly PDF files.** `payment-receipt` becomes the only component that generates/uploads monthly receipt PDFs.
5. **Independent authentication.** `payment-receipt` validates the user and membership itself using the same user JWT; it is not trusted merely because another Edge Function called it.
6. **Idempotency by reuse.** Existing receipt rows and existing PDFs are reused rather than duplicated.
7. **Registration is unchanged.** The existing `kind = 'entry'` path remains inside `payment-lifecycle` during this stage.

## 4. Target architecture

```text
Monthly payment toggle
        │
        ▼
payment-lifecycle
├── authenticate user
├── load student + academy_id
├── validate active academy membership
├── record/remove payment_event
├── create/reuse/void receipt row
├── send payment confirmation WhatsApp
└── for active monthly receipt:
       call payment-receipt with original JWT + receipt_id
                │
                ▼
        payment-receipt
        ├── authenticate user
        ├── load receipt
        ├── require kind = monthly
        ├── validate active membership for receipt.academy_id
        ├── load student/class/academies identity
        ├── if storage_path exists, reuse
        ├── otherwise generate PDF
        └── upload PDF and persist storage_path
                │
                ▼
payment-lifecycle
└── if PDF is available and delivery enabled:
       send receipt document WhatsApp
```

Registration (`kind = 'entry'`) bypasses the new monthly document delegation and keeps its current behavior.

## 5. Monthly payment state transitions

### 5.1 Mark monthly installment as paid

`payment-lifecycle` must:

1. authenticate the request;
2. load the student and require `student.academy_id`;
3. validate active `academy_members` membership for the authenticated user;
4. detect the installment as paid;
5. create or reuse the corresponding `payment_event`;
6. create or reuse the active `receipt` row;
7. send the payment confirmation WhatsApp when enabled and eligible;
8. invoke `payment-receipt` with the receipt ID and the original user JWT;
9. if the PDF succeeds, allow receipt-document WhatsApp delivery;
10. return a structured success even when PDF generation is pending.

A PDF failure is a partial failure, not a payment failure.

Expected durable state after successful payment but failed PDF:

```text
payment_event        exists
receipt              active
receipt.storage_path null
payment status       paid
```

### 5.2 PDF generation succeeds

`payment-receipt` returns the receipt with a non-null `storage_path`.

`payment-lifecycle` may then create a signed URL and send the receipt document if:

- receipt delivery is enabled;
- the student has a valid WhatsApp number;
- consent is true;
- Meta configuration is available.

### 5.3 PDF generation fails

`payment-lifecycle` must not roll back or delete:

- the payment event;
- the active receipt row;
- the paid state already saved on the student.

Payment confirmation WhatsApp remains independent and may still be sent.

Receipt-document WhatsApp must not be sent without a generated PDF.

The response should expose that the PDF is pending so the frontend can show a specific warning rather than a generic lifecycle failure.

### 5.4 Retry / repair

A retry calls `payment-receipt` again for the same `receipt_id`.

Rules:

- it does not create another receipt;
- it does not create another `payment_event`;
- if `storage_path` is already present, it returns/reuses the existing receipt;
- if `storage_path` is null, it generates/uploads the PDF and updates the same receipt row;
- when repair succeeds, receipt-document WhatsApp may be sent through the lifecycle flow without resending the original payment confirmation unless the existing automation idempotency rules explicitly require it.

### 5.5 Unmark monthly installment

`payment-lifecycle` remains responsible for the void path:

1. remove the matching `payment_event`;
2. mark the active receipt as `voided`;
3. preserve the existing PDF file in Storage for history/audit;
4. send the existing payment-voided WhatsApp when enabled and eligible.

`payment-receipt` does not change payment state and does not perform receipt voiding.

## 6. `payment-receipt` contract

### Request

```json
{
  "receipt_id": "uuid"
}
```

The request must include the same authenticated user JWT in the `Authorization` header.

### Authentication and authorization

`payment-receipt` must:

1. require `Bearer <jwt>`;
2. resolve the authenticated user through Supabase Auth;
3. load the receipt by ID;
4. require `receipt.kind = 'monthly'`;
5. require a non-null `receipt.academy_id`;
6. validate an active `academy_members` row matching both `receipt.academy_id` and the authenticated `user.id`;
7. reject cross-academy access with `403`;
8. reject registration receipts with a client error and perform no mutation.

It must not use `receipt.user_id` as the authoritative authorization mechanism.

### Data sources

For PDF identity and content:

- academy identity: `academies` by `receipt.academy_id`;
- student: `students` by `receipt.student_id`;
- class name: `classes` by `receipt.class_id` when present;
- financial amount/date/receipt number/status: the receipt row itself.

`academy_profiles` is not an authoritative source and must not be queried by the modernized function.

### PDF output

The function reuses the existing shared `generateReceiptPdf()` helper and keeps the current official identity behavior:

- official PDF academy name from `academies.name`;
- responsible from `academies.responsible_name`;
- support contact from `academies.support_phone`.

### Storage

The function may keep the current user-based Storage path for this stage to avoid unrelated migration work.

If the receipt already has `storage_path`, the function returns it without generating a duplicate PDF.

If the receipt is active and `storage_path` is null, it generates and uploads the PDF with `upsert: true`, then persists `storage_path` on the existing row.

## 7. `payment-lifecycle` responsibilities after the change

### Still owned by `payment-lifecycle`

- user authentication;
- student lookup;
- academy membership authorization;
- `payment_event` create/delete;
- receipt row create/reuse/void;
- registration receipt PDF path (`kind = 'entry'`);
- payment confirmation WhatsApp;
- payment void WhatsApp;
- automation message logging/idempotency;
- deciding whether receipt-document WhatsApp should be sent.

### Removed from the monthly path

For `kind = 'monthly'`, `payment-lifecycle` no longer directly:

- calls `generateReceiptPdf()`;
- uploads the monthly PDF to Storage;
- updates the monthly receipt `storage_path` itself.

## 8. Inter-function authentication

When `payment-lifecycle` delegates monthly PDF generation, it forwards the original `Authorization` header to `payment-receipt`.

`payment-receipt` remains deployed with `verify_jwt = true` and independently validates the user.

This avoids service-role-only trust between functions and guarantees that a receipt operation remains tied to a real authenticated academy member.

A service role may still be used internally by the function after authorization for database/Storage operations, matching the existing Edge Function pattern.

## 9. WhatsApp ordering and failure behavior

Payment confirmation is independent from PDF creation.

Preferred monthly order:

```text
payment saved
→ receipt row exists
→ payment confirmation WhatsApp attempted
→ monthly PDF attempted
→ receipt-document WhatsApp attempted only if PDF exists
```

This ensures a Storage/PDF failure cannot suppress acknowledgement of a valid payment.

Automation message idempotency keys remain authoritative for preventing duplicate WhatsApp sends.

A PDF repair must not blindly resend the payment confirmation. It may send the receipt document once the PDF becomes available, subject to existing document idempotency.

## 10. Frontend behavior

The frontend continues calling `payment-lifecycle`; it does not orchestrate multiple Edge Functions.

This avoids a browser-level two-call transaction where navigation, connection loss, or tab closure could leave the flow half-completed.

The lifecycle response should distinguish at least these outcomes for monthly payments:

### Complete success

> Pagamento salvo, recibo gerado e automação processada.

### Payment success with PDF pending

> Pagamento registrado e confirmação enviada. O PDF do recibo ficou pendente e poderá ser gerado novamente.

The existing generic message should remain a fallback only for truly unknown lifecycle failures.

## 11. Error handling

### `payment-receipt`

Expected categories:

- `400`: invalid/missing receipt ID or receipt is not monthly;
- `401`: missing/invalid user authentication;
- `403`: authenticated user is not an active member of the receipt academy;
- `404`: receipt, student, or academy cannot be resolved;
- `500`: PDF, Storage, or unexpected internal failure.

### `payment-lifecycle`

A delegated PDF `500` must be converted into a partial-success result when the payment state was already persisted successfully.

It must not return a generic payment failure solely because monthly PDF generation failed.

## 12. Idempotency and concurrency

The existing uniqueness/idempotency behavior for `payment_events`, active receipts, and `automation_messages` remains in force.

Additional monthly PDF invariants:

- one active receipt per payment identity;
- one receipt row is reused during retries;
- `storage_path != null` means no regeneration is required;
- `upsert: true` protects Storage retry behavior;
- concurrent PDF calls must converge on the same receipt/storage path rather than creating additional receipt rows.

## 13. Security requirements

- Both functions require authenticated requests.
- `payment-receipt` uses `academy_members` membership as authorization.
- Cross-tenant receipt generation is forbidden.
- `academy_profiles` must not be used by the new monthly receipt path.
- Registration receipts are explicitly rejected by the delegated monthly function.
- Service-role credentials are never exposed to the browser.
- The original user JWT is forwarded only server-to-server for the delegated request and is not logged.

## 14. Testing strategy

Implementation follows TDD. Required regression contracts include:

1. monthly paid → payment event + active receipt + PDF;
2. monthly PDF failure → payment remains paid and receipt remains active with null `storage_path`;
3. payment confirmation WhatsApp can succeed despite PDF failure;
4. receipt-document WhatsApp is not sent without a PDF;
5. retry generates the missing PDF on the same receipt;
6. an existing `storage_path` is reused and no duplicate PDF/receipt is produced;
7. `payment-receipt` rejects `kind = 'entry'`;
8. Academy A cannot generate a monthly PDF for Academy B;
9. unmark monthly payment still removes the event and voids the receipt;
10. existing PDF remains stored after void;
11. repaired PDF can trigger document delivery without duplicating payment confirmation;
12. registration payment regression remains unchanged;
13. full existing Node suite remains green.

DEV integration must additionally verify:

- real tenant membership authorization;
- one complete monthly payment flow;
- one forced/controlled PDF failure flow if practical;
- successful retry/repair;
- receipt and payment rows remain academy-scoped;
- no duplicate receipt or automation message is created.

## 15. Rollout sequence

1. Implement and test on `feat/separate-payment-receipts`.
2. Deploy the modernized `payment-receipt` to DEV only.
3. Deploy the updated `payment-lifecycle` to DEV only.
4. Run automated regression suite.
5. Validate the monthly flow manually in the DEV preview.
6. Confirm registration behavior is unchanged.
7. Review final diff and get explicit user approval before merging.
8. Merge to `main` only after approval.
9. Deploy production Edge Functions in a safe compatible order.
10. Verify production versions/status and a post-deploy smoke test.

## 16. Success criteria

This stage is complete when:

- monthly PDF generation is owned by the modernized `payment-receipt` function;
- `payment-lifecycle` no longer directly generates monthly PDFs;
- monthly PDF failure cannot undo or misreport a valid payment;
- WhatsApp payment confirmation is independent from PDF generation;
- receipt-document delivery happens only after a valid PDF exists;
- retry repairs the same receipt without duplication;
- tenant authorization is enforced independently by both Edge Functions;
- enrollment/registration payment behavior is unchanged;
- DEV and full regressions pass before any production merge/deploy.
