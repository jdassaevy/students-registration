# Phase 3F — Dependency Integrity and Auth Platform Review

Date: 2026-09-22
Status: implementation candidate

## Goal

Add cryptographic integrity verification to the browser dependency we can verify from an official build artifact, while making the current client-only Auth flow explicit and documenting the remaining project-level Auth controls without changing user data or sessions.

## Dependency integrity

### Supabase JS

The browser already pins `@supabase/supabase-js` to `2.116.0`.

For Phase 3F, the SHA-384 SRI value is derived from the official `supabase-umd` GitHub Actions artifact produced from release commit `13041e03300e139de112b6e5b9d2bb2bcb1354c8`:

- workflow run: `34141313990`
- artifact: `10026013884`
- artifact name: `supabase-umd`
- bundled file: `supabase.js`
- SHA-384 SRI: `sha384-MmYqhQukJUFGS8Rze+j1LDsjq7FDIilY+xf7tRfGwElMdkS/fKeBCkBDx3xdjhDB`

The script remains exact-version pinned and keeps anonymous CORS so the browser can enforce SRI.

### docx

`docx` remains exact-version pinned at `8.5.0`.

An independently verifiable official built artifact matching the CDN file was not available through the current tooling. Phase 3F intentionally does not invent or copy an unverified integrity value. A later change can either self-host a reviewed bundle or add SRI once identical package bytes are independently verified.

## Auth flow

The application is a client-only browser app. Supabase JavaScript uses implicit flow by default for this architecture.

Phase 3F makes `flowType: 'implicit'` explicit so a future SDK/default change cannot silently alter confirmation and password-recovery behavior.

PKCE is not enabled in this phase because it changes the email confirmation/recovery contract and requires the code verifier on the same browser/device that initiated the flow. That is a product behavior change requiring a dedicated rollout and email-template validation.

## Project-level Auth review

Supabase security advisors still report Leaked Password Protection disabled. Supabase documents that feature as Pro-plan-and-above.

Supabase also supports time-boxed sessions, inactivity timeouts and single-session enforcement on Pro and above. These are not auto-enabled in Phase 3F:

- the application explicitly supports access from multiple devices;
- changing session policy can invalidate or constrain existing user workflows;
- the available project connector does not expose Auth-setting mutations.

The project-specific JWT expiration setting cannot be read through the available connector, so Phase 3F does not assume or change it.

## Data safety

Phase 3F has no database migration, no Edge Function deployment, no Storage mutation, no Auth user mutation and no forced sign-out.

## Success criteria

- CI green.
- Vercel Preview Ready.
- Supabase SDK script contains the reviewed SHA-384 SRI value.
- Exact-version pinning and CSP from Phase 3E remain intact.
- Current client-only Auth flow is explicit.
- No session-storage key or token handling behavior changes.
- Production deploy and publish workflow succeed.
