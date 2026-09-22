# Phase 3H — Operational Security Baseline

Date: 2026-09-22
Status: implementation candidate

## Goal

Close the security review with a reproducible operational baseline for CI/CD, browser diagnostics and security-update delivery, without changing business data or authentication state.

## Audit findings

- GitHub workflows still used mutable major tags such as `actions/checkout@v4` and `actions/setup-node@v4`.
- The latest successful CI emitted Node-runtime deprecation warnings from older action generations.
- Checkout persisted the GitHub token in local Git config by default even though neither workflow pushes commits.
- Browser code logged raw Error objects or `error.message` values in multiple user-facing modules.
- Vercel applied security headers globally but did not explicitly prevent stale caching of the HTML entry point.
- Supabase JS already has verified SRI. `docx` and Chart.js remain exact-version pinned, but no independently verified matching bundle hash is available through the current environment; Phase 3H does not invent integrity values.

## CI/CD hardening

- Pin every GitHub Action to the exact commit SHA of its reviewed current release.
- Record the human-readable release tag in a comment beside the SHA.
- Use `ubuntu-24.04` instead of the moving `ubuntu-latest` label.
- Set `persist-credentials: false` on every checkout because the jobs only read repository contents.
- Keep existing least-privilege workflow permissions.

Reviewed action releases for this phase:

- actions/checkout v7.0.1 — `3d3c42e5aac5ba805825da76410c181273ba90b1`
- actions/setup-node v7.0.0 — `820762786026740c76f36085b0efc47a31fe5020`
- actions/configure-pages v6.0.0 — `45bfe0192ca1faeb007ade9deae92b16b8254a0d`
- actions/upload-pages-artifact v5.0.0 — `fc324d3547104276b827a68afc52ff2a11cc49c9`
- actions/deploy-pages v5.0.1 — `368f82528645a54fb793d4d04e342629a3f51346`

## Browser diagnostics

- Add one client logging helper loaded before application modules.
- Sanitize the diagnostic scope and error code to `[A-Za-z0-9_.:-]` and limit both to short values.
- Do not log Error objects, stack traces, error messages, Supabase response payloads, student names, phone numbers, IDs or tokens.
- Existing user-facing toasts/messages remain unchanged.

## Security update caching

- Send `Cache-Control: no-store, max-age=0` for `/` and `/index.html` on Vercel.
- Leave static asset caching behavior unchanged in this phase.
- The app already uses versioned query strings for changed high-impact scripts.

## Data safety

Phase 3H has no database migration, no Edge Function deployment, no Storage mutation, no Auth user mutation and no business-data deletion.

## Success criteria

- CI green with the SHA-pinned Actions.
- Vercel Preview Ready.
- No raw console calls remain in application runtime modules outside the sanitizer.
- Checkout credentials are not persisted.
- Production HTML receives the explicit no-store contract.
- No database or Supabase migration changes occur.
- Production deployment and publish workflow complete successfully.
