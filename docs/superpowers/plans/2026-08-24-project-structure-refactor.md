# Project Structure Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the existing application under a neutral `app/` directory with clear CSS, JavaScript, tests, database, and asset folders without changing runtime behavior.

**Architecture:** Preserve every existing business-logic file verbatim whenever possible and move it by reusing its Git blob. Change only path-bearing files: `app/index.html`, `app/js/core/supabase-config.js`, `.github/workflows/deploy-pages.yml`, and `README.md`. The application remains a dependency-free static site deployed by GitHub Pages.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, Supabase JS, PostgreSQL/Supabase, GitHub Actions/Pages.

**Spec:** `docs/superpowers/specs/2026-08-24-project-structure-design.md`

## Global Constraints

- No business logic, authentication, database behavior, payment behavior, or UI behavior changes.
- Work only on `refactor/project-structure` until verification is complete.
- Runtime references must not point to `arte-nativa/` after the refactor.
- Keep `CNAME` at repository root.

---

### Task 1: Move application files into the approved structure

**Files:** Move all files from `arte-nativa/` into the corresponding `app/` subdirectories defined by the spec.

- [ ] Reuse existing blobs for unchanged JS, CSS, SQL, test, and image files.
- [ ] Remove the old `arte-nativa/` tree in the same refactor commit.
- [ ] Verify the recursive tree matches the approved structure.

### Task 2: Update runtime paths

**Files:**
- Create/modify: `app/index.html`
- Create/modify: `app/js/core/supabase-config.js`

- [ ] Point CSS to `./css/style.css`.
- [ ] Point images to `./assets/images/dassaevy-labs-mark-transparent.png`.
- [ ] Point core scripts to `./js/core/` and feature scripts to `./js/features/`.
- [ ] Point dynamically loaded money, financial-detail, and due-date scripts to `./js/features/`.
- [ ] Verify script loading order remains Supabase CDN → DOCX CDN → Supabase config → core app → dashboard → reports → dynamic extensions.

### Task 3: Update deployment and documentation

**Files:**
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `README.md`

- [ ] Change Pages artifact path from `./arte-nativa` to `./app`.
- [ ] Document the new repository structure and current feature set.
- [ ] Update local-run and schema paths to `app/index.html` and `app/database/supabase-schema.sql`.

### Task 4: Verify refactor

- [ ] Confirm `arte-nativa/` no longer exists on the branch.
- [ ] Confirm every expected file exists under `app/`.
- [ ] Confirm no runtime path contains `arte-nativa`.
- [ ] Confirm `style.css` still imports `style-base.css` from the same `css/` directory.
- [ ] Confirm monetary parsing test file and implementation are colocated in their approved directories.
- [ ] Compare branch to `main` and verify business-logic blobs are unchanged for moved files.
- [ ] Open a PR only after these checks pass; do not merge into `main` without user approval.
