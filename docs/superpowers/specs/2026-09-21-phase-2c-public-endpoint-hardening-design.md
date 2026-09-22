# Phase 2C — Public Endpoint and CORS Hardening Design

Date: 2026-09-21
Status: implementation candidate
Scope: browser CORS policy, WhatsApp webhook request hardening, reminder-cron authentication, and scheduler readiness

## 1. Goal

Reduce the remaining public API attack surface without changing payment, receipt, WhatsApp, tenant-isolation, or reminder business rules.

Phase 2C keeps the Phase 1 authorization model and Phase 2A/2B validation/rate-limit behavior intact. It does not move security enforcement from JWT/RLS to CORS; CORS is only an additional browser-origin restriction.

## 2. Browser CORS Policy

The four browser-invoked authenticated Edge Functions use one shared exact-origin allowlist:

- `https://alunos.dassaevylabs.com.br`
- `https://students-registration-multi-academy.vercel.app`
- `http://localhost:5500`
- `http://127.0.0.1:5500`

No wildcard origin and no wildcard `*.vercel.app` rule are allowed.

Allowed requests receive the requesting origin back in `Access-Control-Allow-Origin` plus `Vary: Origin`. Unknown browser origins are rejected before preflight/authenticated work. Requests without an `Origin` header remain possible for trusted server-to-server and test tooling.

The shared allowlist includes the current Supabase client headers plus rate-limit and tracing-compatible headers. Rate-limit response headers are exposed to browsers.

In-scope functions:

- `payment-lifecycle`
- `payment-receipt`
- `send-whatsapp`
- `retry-automation-message`

## 3. WhatsApp Webhook

`whatsapp-webhook` remains `verify_jwt=false` because Meta cannot supply the application's user JWT. Authentication remains provider-specific:

- GET verification requires `META_WEBHOOK_VERIFY_TOKEN`.
- POST requires a correctly formatted `x-hub-signature-256` HMAC computed with `META_APP_SECRET`.

Hardening added in Phase 2C:

- GET token comparison uses the shared bounded constant-time secret comparison.
- POST body is stream-bounded before signature verification.
- Webhook body cap is 256 KiB.
- Signature header must match exactly `sha256=<64 hex chars>`.
- Provider message id, timestamp, error code and error message are bounded before database use.
- Existing status-regression protection and provider-message lookup behavior remain unchanged.

The 256 KiB cap is intentionally larger than the 64 KiB authenticated API cap because provider webhook batches are externally controlled and can legitimately contain more than a single user request.

## 4. Reminder Processor

`process-reminders` remains `verify_jwt=false` only because it uses its own server-to-server secret.

Phase 2C replaces direct string inequality with the shared bounded constant-time comparison for `AUTOMATION_CRON_SECRET`. Method rejection and secret validation remain before service-role database work.

No browser CORS headers are added to this function.

## 5. Scheduler Audit

The production database currently has no scheduled job that invokes `process-reminders`. The only current `cron.job` entry is the Phase 2B rate-limit cleanup.

Production also currently has:

- `pg_cron` installed;
- no `pg_net` extension installed;
- no named secrets stored in Supabase Vault.

Therefore Phase 2C must not create a production reminder schedule by embedding `AUTOMATION_CRON_SECRET` in SQL or a cron command.

Scheduler activation is a separate rollout gate:

1. validate the hardened function in DEV;
2. provision the same cron secret securely for the Edge Function and database-side scheduler secret storage;
3. enable the required HTTP scheduler capability;
4. create the schedule without committing the secret to Git;
5. verify failed/valid authentication behavior and idempotency;
6. only then promote the identical setup to PROD.

## 6. Data Safety

Phase 2C source changes do not add a business-data migration and do not rewrite any academy, class, student, payment, receipt, or automation row.

Production is not modified during branch implementation.

## 7. Testing

Repository tests must prove:

- exact production CORS origins are accepted;
- unknown browser origins do not receive allow-origin access;
- originless server-to-server calls remain possible;
- all four authenticated functions use the shared CORS helper;
- rate-limit headers remain preserved;
- webhook body is bounded before HMAC verification;
- webhook signature format is strict;
- webhook provider fields are bounded;
- verification token and cron secret use the shared secret comparison;
- cron authentication occurs before service-role database work;
- Phase 2A and 2B contract tests remain green.

DEV runtime verification is required before production deployment.

## 8. Out of Scope

Phase 2C does not:

- change tenant authorization or RLS;
- change payment or receipt business logic;
- add IP-based rate limiting;
- add persistent abuse telemetry;
- resolve the accepted/reviewed SECURITY DEFINER advisor findings;
- change Supabase Auth leaked-password settings;
- activate the reminder scheduler without secure secret provisioning.

Those items remain separate security/operations work.

## 9. Success Criteria

Phase 2C is complete when the reviewed code passes repository CI, the exact candidate functions are validated in DEV, production aliases work through the exact CORS allowlist, webhook/cron negative tests reject unauthenticated requests, business-data invariants remain unchanged, and production receives only the DEV-validated bundle.
