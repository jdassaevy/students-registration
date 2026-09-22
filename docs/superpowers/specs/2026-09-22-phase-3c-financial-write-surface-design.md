# Phase 3C — Financial Write Surface Hardening

Date: 2026-09-22
Status: implementation candidate

## Goal

Make the browser read-only for financial audit tables while preserving the existing UI and keeping all controlled financial mutations behind authenticated Edge Functions.

## Current finding

The current application has two writers for `payment_events`:

1. `payment-lifecycle`, which authenticates the caller, checks academy membership, rate limits the request and writes with the service role.
2. A legacy `reports.js` wrapper that deletes/inserts `payment_events` directly from the authenticated browser after a payment toggle.

The second path is no longer needed and forces broad browser write grants to remain open.

`receipts` are already created, voided and repaired by `payment-lifecycle` / `payment-receipt`; the browser only reads receipt history and requests signed URLs from the private bucket.

## Design

- Remove direct `payment_events` INSERT/DELETE behavior from `reports.js`.
- Refresh an open Reports view when the existing `payment:lifecycle` event fires.
- Keep browser SELECT access to `payment_events` for reports.
- Keep browser SELECT access to `receipts` for receipt history.
- Revoke browser INSERT/UPDATE/DELETE on `payment_events`.
- Revoke browser INSERT/UPDATE on `receipts`.
- Do not alter service-role access used by Edge Functions.
- Do not migrate, rewrite, backfill or delete business rows.

## Data safety

This phase changes code and ACLs only. It does not execute DML against business data.

Before and after each DEV/PROD rollout, verify counts and tenant/linkage invariants.

## Success criteria

- CI green.
- Reports contain no direct financial-table writes.
- Payment lifecycle remains the single financial writer.
- Authenticated users can still SELECT their academy-scoped payment events and receipts through RLS.
- Authenticated direct writes to `payment_events` and `receipts` are denied.
- Edge Function financial flows remain functional in DEV.
- Business counts and tenant/linkage invariants remain unchanged.
