# Project Structure Refactor Design

## Goal

Reorganize the repository so the application has a clear, professional structure suitable for maintenance, portfolio review, and future feature development, without changing runtime behavior.

## Scope

This refactor is limited to file and folder organization, path updates, deploy compatibility, and documentation. It must not change business logic, database rules, payment behavior, authentication behavior, or UI behavior.

## Target Structure

```text
students-registration/
├── .github/
│   └── workflows/
├── app/
│   ├── assets/
│   │   └── images/
│   │       └── dassaevy-labs-mark-transparent.png
│   ├── css/
│   │   ├── style-base.css
│   │   └── style.css
│   ├── js/
│   │   ├── core/
│   │   │   ├── script.js
│   │   │   └── supabase-config.js
│   │   ├── features/
│   │   │   ├── dashboard.js
│   │   │   ├── due-dates.js
│   │   │   ├── financial-details.js
│   │   │   ├── money-input.js
│   │   │   └── reports.js
│   │   └── tests/
│   │       └── money-input.test.js
│   ├── database/
│   │   └── supabase-schema.sql
│   └── index.html
├── CNAME
├── README.md
└── docs/
    └── superpowers/
        ├── specs/
        └── plans/
```

## File Responsibilities

- `app/index.html`: application entry point and script/style loading order.
- `app/css/style-base.css`: base and legacy styles.
- `app/css/style.css`: current visual overrides and modern presentation.
- `app/js/core/script.js`: primary application state, CRUD, auth, and base rendering.
- `app/js/core/supabase-config.js`: Supabase client bootstrap and extension loading.
- `app/js/features/dashboard.js`: overview dashboard.
- `app/js/features/reports.js`: reporting and chart logic.
- `app/js/features/financial-details.js`: financial drill-down modal.
- `app/js/features/due-dates.js`: class start dates and installment due-date logic.
- `app/js/features/money-input.js`: localized monetary input parsing and formatting.
- `app/js/tests/money-input.test.js`: automated tests for monetary parsing.
- `app/database/supabase-schema.sql`: database schema and migration reference.
- `app/assets/images/`: application images and branding assets.

## Path Migration Rules

All relative references must be updated after files move:

- CSS references in `app/index.html` must point to `./css/...`.
- image references must point to `./assets/images/...`.
- JavaScript references in `app/index.html` must point to `./js/core/...` and `./js/features/...`.
- dynamic script loading inside `supabase-config.js` must use paths relative to `app/index.html`, specifically `./js/features/...`.
- any intra-file path reference found during the refactor must be updated consistently.

## Deployment

The GitHub Pages workflow currently publishes the application from the existing `arte-nativa` directory. The workflow must be updated to publish the new `app` directory while preserving the custom-domain behavior through `CNAME`.

## Git Strategy

- Use branch: `refactor/project-structure`.
- Do not modify `main` until the reorganized version has been verified.
- Preserve Git history as much as the GitHub contents API allows; the effective change is a move plus path updates.
- Merge only after syntax checks, existing automated tests, path validation, and deploy workflow validation succeed.

## Verification Criteria

The refactor is approved only if all of the following remain functional:

1. application loads from the new `app` directory;
2. Dassaevy Labs logo loads on login and header;
3. authentication loads normally;
4. Students, Financial, Dashboard, and Reports views load;
5. dynamic modules for financial details and due dates load;
6. money input behavior remains intact;
7. `money-input.test.js` passes from its new location;
8. GitHub Pages workflow points to `app` and remains structurally valid;
9. no runtime reference still points to `arte-nativa/`;
10. no business logic or database behavior is changed by the refactor.

## Non-Goals

This refactor will not split `script.js` into smaller application modules, introduce a bundler, migrate to a framework, change Supabase structure, redesign the UI, or add new features. Those changes can be considered separately later.
