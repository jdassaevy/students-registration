# Phase 3A — Automation Failure Policy and Operator Visibility

Date: 2026-09-22
Status: implementation candidate

## Problem

Production currently has 10 failed automation messages. Nine occurred in the last seven days and five in the last 24 hours. All observed failures are `payment_voided` messages with Meta error code `132001`, recorded as "Template name does not exist in the translation".

The current Automation Center has two reliability gaps:

1. it reports "Meta conectada" whenever any historical send succeeded, even when recent failures indicate a current configuration problem;
2. it offers a normal retry for every failed transactional message, including configuration failures where an unchanged retry is expected to fail again.

## Goal

Make automation failures actionable without deleting, rewriting, or backfilling any user/business data.

## Failure policy

Known Meta configuration/request errors are treated as requiring an operator correction before retry:

- 100
- 190
- 131008
- 131009
- 132000
- 132001
- 132005
- 132007
- 132012

A failed message with one of these codes is not blindly retried. The UI explains that the Meta configuration/template must be corrected first. Recovery remains possible: after the operator confirms the configuration was fixed, the retry request carries an explicit acknowledgement and the server permits a new idempotent retry attempt.

This is not a permanent blacklist. It is a guard against repeated unchanged retries.

## Server invariants

`retry-automation-message` must:

- continue requiring JWT, academy authorization, rate limiting and tenant-linkage checks;
- only retry a source message whose status is `failed`;
- validate `acknowledge_configuration_fix` as a real boolean;
- require acknowledgement for known configuration/request error codes;
- keep the existing idempotency key behavior;
- never mutate or delete the source automation message.

## UI behavior

The Automation Center must:

- prioritize known configuration failures over historical successful sends when calculating Meta health;
- display a friendly diagnostic for Meta error 132001 instead of exposing only raw provider text;
- show normal "Reenviar" only for ordinary retryable failures;
- show "Tentar após corrigir" for known configuration failures;
- require an explicit confirmation that Meta/template configuration was corrected before invoking the retry.

## Data safety

Phase 3A has no database migration, no backfill, and no cleanup query. Existing failed automation history remains untouched.

The only new database writes that can occur at runtime are the same idempotent retry-log inserts already used by the existing retry endpoint, and only after the user explicitly requests a retry.

## Scope boundary

Phase 3A does not yet add persistent operational telemetry, alert delivery, a new monitoring table, or automatic retries. Those belong to later Phase 3 work after this failure policy is stable.
