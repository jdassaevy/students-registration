# Login incident — unverified Supabase CDN SRI

Date: 2026-09-22

## Symptom

Production login stopped responding even though Supabase Auth remained healthy server-side and active sessions still existed.

## Root-cause candidate

Phase 3F added an SRI value to the jsDelivr Supabase SDK tag. That hash was derived from the official Supabase release build artifact, not independently verified against the exact bytes served by the jsDelivr URL used by production.

If CDN bytes differ from the release artifact, browsers reject the script before `window.supabase` exists, which prevents the application Auth code from initializing.

## Hotfix

- Keep Supabase JS exact-pinned at `2.116.0`.
- Keep the exact CSP allow-list entry.
- Keep anonymous CORS and no-referrer.
- Remove only the unverified `integrity` attribute.
- Add a regression test that rejects a future Supabase CDN SRI unless the exact CDN bytes are independently verified first.

## Data safety

No database, Auth user, password, session or business data change is part of this hotfix.
