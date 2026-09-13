# Phase 2A — API Validation Hardening Design

Date: 2026-09-13
Status: proposed for implementation planning after user review
Scope: Supabase Edge Functions only

## 1. Goal

Add a shared, conservative request-validation layer to authenticated Edge Functions so malformed or ambiguous input is rejected before any business write occurs, while preserving current valid application behavior.

This phase is intentionally non-destructive. It must not alter existing business rows, backfill data, drop schema, or introduce restrictive limits that could block normal use.

## 2. Constraints

- Data safety has priority over strictness.
- Normalize only values whose intended meaning is unambiguous.
- Reject malformed, ambiguous, unsupported, or out-of-range values with stable API error codes.
- Preserve existing authentication, tenant isolation, receipt, payment, retry, and WhatsApp business behavior.
- No database migration is required for Phase 2A.
- No production data mutation is performed solely for validation testing.
- CORS behavior remains unchanged in Phase 2A.
- `process-reminders` and `whatsapp-webhook` are out of scope for the generic validation layer and are reserved for Phase 2C because they use custom authentication and webhook/cron semantics.

## 3. Architecture

Create one small shared helper module:

`supabase/functions/_shared/api-validation.ts`

Responsibilities:

1. Parse JSON safely with a configurable maximum request size.
2. Normalize primitive values conservatively.
3. Validate UUIDs, enums, bounded integers, bounded strings, and small primitive arrays.
4. Return or throw structured validation failures that handlers can map to a stable API response.

The helper must not:

- access Supabase,
- know about academy membership,
- perform authorization,
- perform database reads or writes,
- contain payment or WhatsApp business rules.

The handler remains separated into four concerns:

1. cheap request gates such as method and declared/body size,
2. authentication,
3. semantic JSON parsing/validation and academy/resource authorization,
4. business logic and data writes.

The exact ordering of authentication versus semantic JSON parsing may remain endpoint-specific when preserving current behavior is safer. The non-negotiable invariant is that no business write or external side effect may occur until the request contract for that execution path has been fully validated and authorization has succeeded.

## 4. Validation Philosophy

### 4.1 Safe normalization

The validator may normalize values when there is only one reasonable interpretation.

Examples:

- `"  <uuid>  "` -> trimmed UUID string,
- `" person1 "` -> `person1`,
- `"2"` -> integer `2` when the contract explicitly expects an integer,
- optional empty string -> absent/null only when the endpoint already treats absence and empty input equivalently.

### 4.2 Rejection

The validator must reject values that require guessing or that violate the contract.

Examples:

- `installment: "abc"`,
- `installment: 4` for a monthly payment,
- `person: "person3"`,
- malformed UUIDs,
- malformed JSON,
- unsupported operation names,
- arrays containing unsupported value types.

The validator must not silently translate semantic aliases such as `"pessoa1"` to `"person1"` or `"mensal"` to `"monthly"`.

## 5. Generic Request Limits

Authenticated JSON endpoints in this phase use a maximum raw request body size of 64 KiB.

Behavior:

- malformed JSON -> HTTP 400, `INVALID_JSON`,
- body over 64 KiB -> HTTP 413, `PAYLOAD_TOO_LARGE`,
- valid JSON with invalid contract fields -> HTTP 400, `INVALID_INPUT`.

The limit is deliberately much larger than the application's current request payloads and exists only to reject clearly abnormal requests.

Unknown extra JSON fields are ignored during Phase 2A. This preserves compatibility with older/newer clients that may send harmless metadata while strongly validating all fields that the server consumes.

## 6. Standard Error Contract

Validation-related responses use a stable machine-readable code while retaining a generic user-safe message.

Example:

```json
{
  "error": "Invalid request",
  "code": "INVALID_INPUT",
  "field": "installment"
}
```

Stable codes introduced/standardized by this design:

- `INVALID_JSON`
- `PAYLOAD_TOO_LARGE`
- `INVALID_INPUT`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `METHOD_NOT_ALLOWED`
- `INTERNAL_ERROR`

`field` is included only when it does not disclose sensitive implementation or data details.

Phase 2A does not require every historical error response in every function to be rewritten at once. The implementation must standardize validation errors and may map existing obvious authentication/method errors where doing so is low-risk and behavior-preserving.

## 7. Endpoint Contracts

### 7.1 `payment-lifecycle`

Normal payment flow:

- `student_id`: required UUID
- `person`: required enum `person1 | person2`
- `kind`: required enum `entry | monthly`
- `installment`:
  - for `entry`, normalized to `0`,
  - for `monthly`, required integer `1..3`; numeric strings such as `"2"` are accepted and normalized.

Repair flow:

- `operation`: exact enum value `repair_monthly_receipt`
- `receipt_id`: required UUID

If `operation` is present, the request is treated as an operation request and must satisfy the repair contract exactly for the fields consumed by that path. Unsupported operation names are rejected with `INVALID_INPUT`.

### 7.2 `payment-receipt`

- `receipt_id`: required UUID

No other consumed request fields are introduced.

### 7.3 `send-whatsapp`

- `student_id`: required UUID
- `person`: required enum `person1 | person2`
- `automation_type`: required known automation enum
- `receipt_id`: required UUID when `automation_type === "receipt_document"`; otherwise optional and, if present, must be a UUID
- `body_parameters`: optional array of at most 12 primitive string/number values; values are converted to strings only when the existing template builder already does so
- `idempotency_key`: optional trimmed string, maximum 240 characters

Known automation types remain the existing set used by the function:

- `reminder_before_due`
- `due_today`
- `overdue`
- `payment_confirmation`
- `receipt_document`
- `payment_voided`

This phase does not broaden which automation types users may legitimately trigger. Existing downstream authorization/business checks remain authoritative.

### 7.4 `retry-automation-message`

- `source_message_id`: required UUID
- `request_id`: required trimmed non-empty string, maximum 160 characters

The existing retry policy remains unchanged after validation.

## 8. CORS

Phase 2A preserves the current CORS behavior for authenticated functions.

Reasoning:

- the production app currently uses `alunos.dassaevylabs.com.br`,
- local development and other controlled environments may still rely on permissive CORS,
- tightening origins now creates compatibility risk unrelated to request validation.

CORS allowlisting is explicitly deferred to Phase 2C, where production/dev origins and preflight behavior can be validated together.

## 9. Functions in Scope

The implementation applies the shared validation layer to:

- `payment-lifecycle`
- `payment-receipt`
- `send-whatsapp`
- `retry-automation-message`

Out of scope for 2A:

- `process-reminders`
- `whatsapp-webhook`

They will be hardened in Phase 2C because request authenticity depends on `x-cron-secret`, raw-body HMAC verification, and provider-specific semantics rather than the authenticated JSON API model.

## 10. Data Safety

Phase 2A must not include:

- business-data backfills,
- destructive DDL,
- schema cleanup,
- updates to existing students/payments/receipts/automation history,
- test calls that intentionally create real payments, receipts, or WhatsApp sends merely to prove validation.

Invalid-request integration tests must fail before any write path is reached.

Valid-path compatibility is proven through pure contract tests, existing repository tests, compilation/deployment to Supabase dev, and non-mutating checks where possible.

## 11. Testing Strategy

### 11.1 Pure unit tests

Write tests for the shared helper before implementation logic is added.

Required cases include:

- UUID trim + valid acceptance,
- malformed UUID rejection,
- enum trim + valid acceptance,
- unknown enum rejection,
- integer numeric-string normalization,
- non-integer/out-of-range rejection,
- string trimming and maximum length,
- primitive-array maximum size/type validation,
- malformed JSON classification,
- 64 KiB size boundary,
- payload-too-large classification.

### 11.2 Per-endpoint contract tests

Each in-scope function receives tests proving its request contract without executing business writes.

At minimum:

- `payment-lifecycle`: normal entry, normal monthly, invalid person, invalid kind, installment `0/4/abc`, repair operation, unsupported operation, malformed UUIDs
- `payment-receipt`: valid and invalid `receipt_id`
- `send-whatsapp`: receipt-document dependency, automation enum, `body_parameters`, idempotency length, malformed identifiers
- `retry-automation-message`: `source_message_id`, empty/oversized `request_id`

### 11.3 Dev deployment tests

Deploy only to Supabase dev first.

Safe HTTP negative tests may include:

- malformed/invalid payload -> 400,
- oversized payload -> 413,
- missing JWT -> 401,
- wrong method -> 405.

Do not send real WhatsApp messages or create payments/receipts solely for validation testing.

### 11.4 Regression gate

Before production promotion:

- repository JavaScript test suite passes,
- any new shared validation tests pass,
- all four Edge Functions compile and become ACTIVE in dev,
- existing tenant/security invariants remain unchanged,
- no unexpected business-row count changes occur in dev test fixtures outside explicitly controlled rollback-only tests.

## 12. Rollout

1. Implement and test helper locally/in isolated branch.
2. Integrate one function at a time in dev, starting with the simplest contract.
3. Run negative HTTP validation tests in dev.
4. Run full repository CI.
5. Review diff for accidental business-rule or schema changes.
6. Merge one grouped PR after CI is green.
7. Promote the exact validated function bundles to production.
8. Re-run structural/data-integrity checks after deployment.

No production database migration is expected for 2A.

## 13. Success Criteria

Phase 2A is complete when:

- all four authenticated API functions use the shared validation primitives,
- consumed request fields have explicit contracts,
- malformed JSON and oversized bodies receive stable responses,
- ambiguous invalid input is rejected before writes,
- safe normalization preserves current legitimate frontend requests,
- existing authentication and tenant authorization remain intact,
- no existing business data is rewritten or lost,
- dev and production bundles are aligned after validated rollout,
- repository CI is green.

## 14. Non-Goals / Later Phases

Phase 2A does not implement:

- rate limiting (Phase 2B),
- CORS allowlisting (Phase 2C),
- stronger cron-secret handling (Phase 2C),
- webhook body-size/HMAC pipeline changes (Phase 2C),
- abuse telemetry, security dashboards, or alerting (Phase 2D),
- changes to Supabase Auth leaked-password settings.

These are deliberately separated so request validation can be deployed and verified without combining unrelated operational risk.