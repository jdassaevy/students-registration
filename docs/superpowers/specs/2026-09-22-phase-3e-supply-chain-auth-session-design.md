# Phase 3E — Supply Chain and Auth Session Hardening

Date: 2026-09-22
Status: implementation candidate

## Goal

Reduce client-side supply-chain drift and make the browser Auth session assumptions explicit without changing user data or forcing users to sign in again.

## Audit findings

- The browser loads exactly two third-party scripts: Supabase JS and docx.
- `docx` is already exact-version pinned at `8.5.0`.
- Supabase JS was loaded with the floating `@2` major tag, allowing future minor/patch releases to reach production without repository review.
- The CSP allowed any JavaScript hosted on `cdn.jsdelivr.net`, broader than the two scripts the app actually uses.
- The repository contains a Supabase publishable key in browser configuration, as expected, and no secret/service-role key was found in runtime app sources.
- The browser Auth flow depends on session persistence, automatic refresh and recovery-token detection in the URL, but those client options were implicit defaults.
- Supabase Leaked Password Protection remains a project-level operational follow-up and is not changed in this phase.

## Design

### Dependency pinning
- Pin `@supabase/supabase-js` to `2.116.0`, the reviewed stable release for this phase.
- Keep `docx` at the existing reviewed `8.5.0`; do not introduce an unrelated major upgrade.
- Send no referrer information to CDN script requests.

### CSP least privilege
- Replace the broad `https://cdn.jsdelivr.net` script source with the two exact dependency URLs.
- Keep local scripts under `'self'`.
- Preserve the remaining Phase 3D CSP directives.

### Auth session contract
- Explicitly configure `autoRefreshToken: true`.
- Explicitly configure `persistSession: true`.
- Explicitly configure `detectSessionInUrl: true` so confirmation/recovery flows continue to work.
- Do not change the Supabase storage key or session storage mechanism, avoiding forced sign-outs.

## Data safety

This phase has no database migration and no data mutation. It changes only static browser assets and deployment headers.

## Success criteria

- CI green.
- Vercel Preview Ready.
- No floating Supabase CDN tag remains.
- CSP script-src contains only self plus the two reviewed CDN paths.
- Existing Auth session behavior is explicit and unchanged.
- No secret/service-role key appears in browser runtime sources.
- Production deploy succeeds before the phase is closed.
