# Phase 2C — Public Endpoint Hardening Implementation Plan

Date: 2026-09-21
Branch: `security/phase-2c-public-endpoint-hardening`

## Gate 1 — Repository candidate

1. Add shared request-aware CORS helper with exact approved origins.
2. Move all four authenticated browser Edge Functions from wildcard CORS to the helper.
3. Reuse the bounded request reader for the public WhatsApp webhook.
4. Add a 256 KiB webhook cap before HMAC verification.
5. Tighten Meta signature format and bound provider-controlled persisted/logged fields.
6. Add a shared bounded constant-time secret helper.
7. Use it for webhook verification token and reminder cron secret.
8. Update Phase 2B contract tests and add Phase 2C tests.
9. Open a draft PR and require the existing pull-request CI to be green.

No Supabase project is modified in this gate.

## Gate 2 — DEV runtime validation

The current DEV project is inactive. Restore it only for the runtime validation gate.

Before deployment:

- capture fresh DEV business-data and tenant-linkage invariants;
- record current Edge Function versions/hashes;
- do not create real payment/receipt/WhatsApp side effects solely for testing.

Deploy the exact reviewed candidate:

- four authenticated functions with `verify_jwt=true`;
- `whatsapp-webhook` with `verify_jwt=false`;
- `process-reminders` with `verify_jwt=false`.

Verify:

- allowed production origin preflight;
- disallowed origin rejection;
- JWT flow remains unchanged;
- invalid/missing webhook signature rejection;
- oversized webhook body rejection;
- valid synthetic signed webhook payload that does not match a business message is harmless;
- missing/invalid cron secret rejection;
- no real reminder send is triggered for security-only testing.

## Gate 3 — Scheduler readiness

Do not schedule `process-reminders` until the scheduler can authenticate without hardcoded secrets.

Required preconditions:

- secure secret available to both scheduler and Edge Function;
- required database HTTP scheduling extension available/enabled;
- schedule command contains no plaintext credential committed to Git;
- reminder idempotency contract remains active.

Once these exist, add the smallest isolated scheduler migration/configuration and test it in DEV first.

## Gate 4 — PROD rollout

Only after CI and DEV are green:

1. capture fresh PROD baseline;
2. verify current function versions and current aliases;
3. deploy the exact DEV-validated bundles one at a time;
4. keep JWT settings unchanged by endpoint type;
5. run safe negative CORS/webhook/cron tests;
6. verify production app calls from both approved production origins;
7. re-check business counts/tenant mismatch invariants;
8. run Supabase security advisors;
9. merge to `main` only after the rollout candidate is accepted.

## Stop Conditions

Stop if any of the following occurs:

- authenticated endpoints lose JWT enforcement;
- an unknown browser origin receives `Access-Control-Allow-Origin`;
- the webhook reads an unbounded body;
- invalid webhook/cron authentication reaches privileged work;
- any business-data count or tenant-linkage invariant changes unexpectedly;
- CI fails;
- DEV bundle differs from the reviewed candidate;
- scheduler setup requires embedding a secret in repository SQL.
