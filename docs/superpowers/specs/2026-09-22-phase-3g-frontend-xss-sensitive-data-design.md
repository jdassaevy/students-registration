# Phase 3G — Frontend XSS and Sensitive Data Hardening

Date: 2026-09-22
Status: implementation candidate

## Goal

Keep the strict CSP introduced in Phase 3D while removing browser patterns that it blocks, preserving escaped rendering of database-backed names, and removing stale legacy student data from localStorage after successful migration.

## Audit findings

- Database-backed names rendered through innerHTML are generally protected with escapeHtml/safeText.
- Student/payment buttons are still generated with inline onclick handlers, which are blocked by the current script-src CSP.
- reports.js dynamically injects Chart.js from jsDelivr, but the current CSP does not allow that Chart.js URL.
- The legacy local-data migrator leaves old class/student/payment data in localStorage after migration succeeds.
- Theme/history preference localStorage entries are non-business preferences and remain unchanged.

## Design

### CSP-compatible student actions
- Replace generated onclick attributes with data-student-action attributes.
- Use one delegated click listener in the core app for edit, remove, entry-payment and monthly-payment actions.
- Validate person and month index before invoking payment actions.

### Chart.js
- Load exact-pinned Chart.js 4.4.7 from index.html instead of dynamic script injection.
- Add exactly that URL to CSP script-src.
- Keep anonymous CORS and no-referrer on the third-party script request.

### Legacy browser data
- Remove legacy class/student localStorage keys when the per-user migration flag already proves migration completed.
- Remove legacy keys when there was nothing to migrate.
- After a new migration, remove legacy keys only after online inserts and the post-migration reload complete.
- Never delete legacy data before the online migration has reached a known-complete state.

## XSS posture

- Keep the existing escapeHtml/safeText protections for names and user-controlled text that enter HTML templates.
- Do not weaken CSP with unsafe-inline.
- Do not introduce eval, document.write, outerHTML or new dynamic script creation.

## Data safety

No database migration or server-side business-row mutation is introduced by Phase 3G. The only deletion is of legacy browser-local copies after migration completion is already established.

## Success criteria

- CI green and Preview Vercel Ready.
- No inline event attributes remain in student renderers.
- Student actions still map to the same existing functions through delegation.
- Chart.js is exact-pinned and permitted by CSP.
- Reports no longer inject scripts dynamically.
- Legacy business-data localStorage keys are purged only after safe migration conditions.
- Critical database-backed names remain escaped.
- Production deploy and publish workflow succeed.
