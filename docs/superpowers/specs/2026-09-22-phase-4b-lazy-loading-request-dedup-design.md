# Phase 4B — Lazy Loading and Request Deduplication

Date: 2026-09-22
Status: implementation candidate

## Goal

Reduce initial browser work and repeated Supabase round-trips without changing business rules, stored data, RLS, or the visible meaning of any screen.

## Audit findings

- Chart.js is downloaded on every app load even though only the Reports view uses it.
- `tab-bar.js` already contains a recovery/lazy loader for `automation-center.js`, but `index.html` also loads that feature eagerly, so the lazy path is never used.
- Reports query the full academy `payment_events` history every time `renderReports()` runs, including simple class-filter changes.
- Reports can also render repeatedly through the global render hook; those renders do not require a fresh payment-history query unless a payment lifecycle event occurred.
- Automation first refresh reads students twice: once for activity names and again for WhatsApp readiness.
- Automation first refresh reads `automation_settings` in `ensureSettings()` and then again only to prove that settings exist.
- Reopening the Automation tab immediately repeats the entire refresh even if no relevant event occurred.

## Design

### Initial-load lazy loading

- Remove the static Chart.js tag from `index.html`.
- Keep the exact Chart.js 4.4.7 URL in CSP and load that constant only when Reports actually renders charts.
- Deduplicate concurrent Chart.js loads with one promise.
- Remove the static `automation-center.js` tag and use the existing `tab-bar.js` fallback loader as the canonical lazy loader.

### Reports request cache

- Fetch `payment_events` on first Reports render.
- Reuse the in-memory history for class-filter changes and ordinary rerenders.
- Deduplicate concurrent history loads.
- Mark history dirty on `payment:lifecycle` and force one fresh read when Reports is currently visible; otherwise defer it until the next Reports visit.
- If a refresh fails after prior data was loaded, keep the last known history instead of blanking it.

### Automation request consolidation

- Select names and phone fields in one students request and reuse that result for both activity labels and readiness checks.
- Reuse the result of `ensureSettings()` instead of querying `automation_settings` a second time.
- Reduce a normal Automation refresh from eight app-data queries/RPCs to six, excluding the Auth fallback call.
- Seed the active user id from the already-authenticated core state when available, avoiding an extra `auth.getUser()` network validation on the normal lazy-load path.

### Automation freshness

- Keep successful Automation data fresh for 30 seconds when no invalidating event occurs.
- Deduplicate concurrent refresh calls with one promise.
- Manual refresh always bypasses the freshness window.
- Auth state changes invalidate the cache.
- `payment:lifecycle` invalidates the cache and refreshes immediately only while Automation is visible.

## Data safety

Phase 4B has no database migration, no Edge Function deployment, no Storage mutation, and no write-path change. It only changes when read-only browser requests and optional scripts are loaded.

## Success criteria

- CI green and Vercel Preview Ready.
- Chart.js and `automation-center.js` are absent from initial HTML downloads.
- Chart.js is still exact-version pinned and CSP-compatible.
- Reports make at most one payment-history request until invalidated.
- Changing the Reports class filter does not force a new Supabase history request.
- Automation uses one students request and no duplicate readiness settings request.
- Reopening Automation inside the freshness window causes no new app-data refresh unless invalidated.
- Manual refresh, auth change and payment lifecycle retain explicit fresh-data paths.
- No database or user-data changes occur.
