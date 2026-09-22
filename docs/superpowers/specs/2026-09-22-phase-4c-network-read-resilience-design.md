# Phase 4C — Network Read Resilience

Date: 2026-09-22
Status: implementation candidate

## Goal

Make browser reads predictable under slow, intermittent or temporarily unavailable networks while preserving the last known good UI state and never retrying business writes.

## Audit findings

- Core initial loading has no app-level timeout; a stalled request can leave the students surface in a loading state for too long.
- Repeated core refresh attempts can overlap because there is no shared in-flight promise.
- Receipts clear `api.items` when a refresh fails, discarding a previously valid list.
- Reports already preserve prior payment history on refresh failure but have no bounded timeout/retry for the Supabase read.
- Lazy Chart.js loading can remain pending without an app-level timeout.
- Automation keeps in-memory data, but its refresh failure path replaces the visible activity with an error even after a successful prior load.
- Academy profile reads have no transient retry, while profile writes already have explicit busy/error handling and must not be retried automatically.

## Read-only resilience helper

- Add a shared `ReadResilience.run(factory)` helper loaded before business modules.
- Default read timeout: 8 seconds.
- Default retry count: one retry.
- Retry only timeout/network-like failures and transient HTTP statuses: 408, 425, 429 and 5xx.
- When the browser explicitly reports offline, fail fast instead of spinning retries.
- The helper accepts a factory so a retry creates a fresh read request.

## Write safety

The retry helper is for reads only. It must not wrap:

- inserts, updates or deletes
- payment lifecycle calls
- automation retry/send calls
- receipt repair operations
- profile saves
- migration uploads

This prevents automatic duplicate writes.

## Core loading

- Deduplicate concurrent `loadData()` calls with one in-flight promise.
- Load classes and students through the read-only resilience helper.
- Only replace global arrays after both reads succeed.
- If a refresh fails after data is already loaded, rerender the last known good state instead of leaving a loading surface.
- If the first load fails with no prior data, show an explicit connection/loading failure row.
- Browser offline notification states that existing data is being kept.
- On reconnect, perform a read-only refresh with legacy migration disabled.

## Feature behavior

- Reports use the helper for payment-history reads and keep previous history on failed refresh.
- Chart.js lazy loading has an 8-second timeout so the reports skeleton cannot remain indefinitely busy.
- Automation uses the helper for settings/profile/student/message/receipt/readiness reads only.
- Automation preserves the previously rendered state when a later refresh fails.
- Receipts preserve the last successful list when a refresh fails.
- Academy profile retries only the read; save remains a direct single write.

## Data safety

Phase 4C contains no migration, no Edge Function deployment, no Storage mutation and no database cleanup. The only behavior change is around read scheduling, timeout/retry and stale-state preservation.

## Success criteria

- CI green and Vercel Preview Ready.
- Read helper loads before core modules.
- Core read calls are deduplicated and bounded.
- Offline does not erase loaded data.
- Reconnect refresh does not run legacy migration.
- No automatic retry wraps any write path.
- Reports, Automation, Receipts and Profile use resilient reads where reviewed.
- Production deploy and Pages publish succeed.
