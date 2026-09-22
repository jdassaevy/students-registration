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

- Request IDs are always generated inside the Edge Function with `crypto.randomUUID()`.
- Client-supplied `x-request-id` values are never copied into logs, even when they look like UUIDs.
- Browser CORS responses expose `X-Request-ID`.
- The same server-generated ID is used in structured logs for the request.

This lets a user-visible error be correlated with backend logs without allowing names, phone numbers, user/student/academy UUIDs, receipt identifiers or other client-controlled values to occupy the request-correlation field.

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

The helper rejects object values for technical string fields and does not coerce objects/arrays into log text. Numeric aggregate/duration fields accept finite numbers only. Endpoint and event names are static literals in the six Edge Function entrypoints.

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
- All responses include a server-generated `X-Request-ID`.
- Client-controlled request IDs cannot be copied into logs.
- No raw console logging remains in Edge Function entrypoints.
- No PII/secret field is accepted by the shared observability helper.
- DEV tests create no persistent business data.
- Production rollout leaves all business counts and tenant/linkage invariants unchanged.
