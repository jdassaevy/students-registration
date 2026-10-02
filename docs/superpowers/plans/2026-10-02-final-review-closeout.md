# Security and performance review — 2026-10-02

## Scope and evidence

Reviewed production deployment `dpl_GX9fbjQ3mjWuHMRgqaUPToyexPUL`, main commit
`193a81217f6328f046a5cb685c199d9b37f41335`, database metadata and aggregate integrity.
No business rows were written and no messages were sent during this review.

- 432 JavaScript tests pass with Node 24 using `node --test --test-isolation=none app/js/tests/*.test.mjs`; the isolated runner also completes all 99 test files successfully. The money-input test passes separately.
- All public database tables have RLS enabled.
- Both academy bootstrap RPCs deny execution to anon and authenticated roles.
- No student/class, payment/student or receipt/student academy mismatches.
- No students without academy; no duplicate active receipts for existing students.
- Historical receipts whose deleted student reference is NULL are intentionally retained by ON DELETE SET NULL. They are not duplicate receipts for a current student.
- No public storage buckets.
- Security Advisor: one warning, leaked-password protection disabled.
- Performance Advisor: 14 unused-index informational findings; no warning/error findings. Indexes retained; an unused-index observation alone does not justify removal.
- Five authenticated production functions retain JWT verification. Webhook and reminder endpoints use their dedicated authentication mechanisms as reviewed in prior phases.
- Three old audit/validation functions only return HTTP 410 and perform no database work.
- Rate-limit cleanup job: 24 successful executions over the observed 24-hour window.
- User confirmed approved payment-void template delivery; production records show one sent void notification in the observed 24-hour window.
- Snapshot: 3 academies, 104 student records, 288 payment events, 353 receipts. This is an observation, not a backup or recovery test.

## Defect found: deployment headers were not effective

Live GET on https://alunos.dassaevylabs.com.br/ returned HTTP 200 but lacked the
configured Content-Security-Policy, X-Frame-Options, X-Content-Type-Options,
Referrer-Policy and Permissions-Policy. HTML Cache-Control was public revalidation,
not the configured no-store policy. HSTS was supplied by the platform.

The Vercel project deploys `app/`, while vercel.json was outside that root.
Move the existing configuration unchanged into `app/vercel.json` and update
four existing security test suites to read the deployed configuration.

The same tests fail with the configuration absent from app/ and pass after the
move. No application logic, Supabase function or database migration changes.

## Publication gate

At preparation time this fix is NOT deployed. Browser compatibility and actual
Vercel response headers must be verified before declaring the defect resolved.
Local Chromium installation failed (download was not a valid ZIP); this is an
environment limitation, not evidence of application failure or success.

After a candidate deployment, check the login page and external JS loading for
CSP violations. Check reports/chart and DOCX export in a test account. Verify
actual GET headers on both `/` and `/index.html`; repository tests alone do not
prove platform configuration was applied. Preserve preview host isolation.

## Explicit remaining operational items

1. Leaked-password protection remains disabled. Verify plan availability and
   enable through the Auth settings when available; do not force logout/reset
   of existing users as part of this review.
2. No database schedule invokes process-reminders. The only observed cron job
   is rate-limit cleanup. D-3/D0/D+3 automation is not certified operational.
   Follow the separate secure scheduler rollout in the Phase 2C design, with
   DEV validation and secure secret provisioning. Do not activate bulk outbound
   reminders as an implicit side effect of a read-only audit.
3. Main currently has no branch protection/required checks. Review this as an
   operational control, keeping an owner recovery path before enforcing it.
4. Backup recovery was not exercised. RLS and integrity checks are not a
   substitute for a verified recovery procedure.

References:
- https://vercel.com/docs/project-configuration/vercel-json
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index
