# Phase 3A — Automation Failure Policy Implementation Plan

Date: 2026-09-22
Branch: `reliability/phase-3a-automation-failure-policy`

## Gate 1 — Repository

1. Extend request validation with a strict optional boolean helper.
2. Extend retry policy with source-status validation and Meta configuration-failure classification.
3. Require explicit correction acknowledgement before retrying a configuration failure.
4. Make the Automation Center prioritize current configuration failures.
5. Add friendly Meta failure guidance and guarded retry UX.
6. Add executable Node coverage for the TypeScript retry policy.
7. Require repository CI to be green.

## Gate 2 — DEV

No database migration is required.

1. Temporarily restore `students-registration-dev` using the existing free-project slot workflow.
2. Deploy only the exact candidate `retry-automation-message` bundle.
3. Verify `verify_jwt=true` remains unchanged.
4. Compare deployed source files against the GitHub branch.
5. Do not perform a real WhatsApp retry solely for validation.
6. Re-pause DEV and restore `family-finance`.

## Gate 3 — Production

Only after CI and DEV bundle validation:

1. capture fresh automation failure aggregates and tenant integrity;
2. deploy the exact DEV-validated retry function bundle;
3. verify `verify_jwt=true` and exact file parity;
4. let the normal frontend deployment publish the guarded Automation Center UI;
5. re-check automation counts and tenant/linkage invariants;
6. do not delete or rewrite existing failed messages.

## Stop conditions

Stop if:

- source automation messages are updated/deleted by retry preparation;
- a non-failed source becomes retryable;
- tenant checks move after privileged writes;
- JWT enforcement changes;
- any business-data aggregate changes during validation;
- CI fails.
