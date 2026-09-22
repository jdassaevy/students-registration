# Phase 3B — Observability Foundation Design

Date: 2026-09-22
Status: implementation candidate

## Goal

Make production failures traceable without adding business-data migrations, copying personal data into logs, or changing payment/receipt/WhatsApp rules.

## Current audit findings

- Vercel production reported no runtime errors in the last 24 hours.
- Supabase production has 10 failed `payment_voided` automation rows, all with Meta code `132001`: the `dassaevy_payment_voided` template is not available for the configured translation.
- The Automation Center already recognizes `132001` as a configuration error and blocks blind retry until the operator confirms the Meta configuration was fixed.
- The only scheduled Postgres job is the Phase 2B rate-limit cleanup. Its recorded runs are succeeding.
- `process-reminders` remains unscheduled; Phase 3B does not create a scheduler because safe scheduling still requires an approved secret-delivery mechanism.
- Existing Edge Function logging is inconsistent and some webhook logs include provider message identifiers.

## Request correlation

Every Edge Function response receives an `X-Request-ID`.

- A valid inbound `x-request-id` can be propagated.
- Otherwise a random UUID is generated.
- Browser CORS responses expose `X-Request-ID`.
- The same ID is used in structured logs for the request.

This lets a user-visible error be correlated with backend logs without logging names, phone numbers, receipt numbers, students, payloads, or tokens.

## Safe structured logs

The shared logger accepts only:

- endpoint
- event
- HTTP/status value
- technical error code
- technical outcome
- duration in milliseconds
- aggregate count
- HTTP method
- request ID

Arbitrary objects are not logged.

## Endpoint behavior

The six existing Edge Functions retain their current authentication, validation, rate limiting, tenant checks, idempotency and business behavior.

Phase 3B only adds tracing/observability and replaces raw console logging with the safe structured logger.

## Data safety

Phase 3B has no database migration and no business-row backfill, cleanup or rewrite.

No log event may contain:

- name
- phone
- user/academy/student IDs
- provider message IDs
- receipt numbers
- WhatsApp payload/body parameters
- Authorization headers
- Meta/Supabase secrets

## Known operational issue outside code rollout

Meta template `dassaevy_payment_voided` must exist and be approved for the configured `pt_BR` language before the existing failed void notifications can be retried.

Phase 3B does not auto-retry the 10 historical failures and does not mutate those rows.

## Success criteria

- CI green.
- Exact candidate bundles validated in DEV.
- Authentication and CORS contracts remain unchanged.
- All responses include `X-Request-ID`.
- No raw console logging remains in Edge Function entrypoints.
- No PII/secret field is accepted by the shared observability helper.
- DEV tests create no persistent business data.
- Production rollout leaves all business counts and tenant/linkage invariants unchanged.
