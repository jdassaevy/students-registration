# Dassaevy Labs Dashboard 2.0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the redesign foundation — Dark/Light theming, desktop sidebar, mobile bottom navigation, motion primitives, skeleton/loading primitives, and regression guards — without changing business behavior.

**Architecture:** Keep the current HTML/CSS/JavaScript application and existing business modules intact. Add a presentation-only layer around the current navigation and content, preserve the existing element IDs and `setView` event contracts, and introduce isolated UI modules for theme/navigation/loading behavior. The first phase must not change Supabase queries, RLS, calculations, receipt behavior, academy isolation, payment logic, or database schema.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, Node.js built-in test runner/assertions, Supabase client already used by the application.

**Spec:** `docs/superpowers/specs/2026-09-09-dashboard-2-ui-redesign-design.md`

## Global Constraints

- The redesign is a presentation-layer evolution, not a rewrite of application business logic.
- Preserve behavior for authentication, academy context, multi-academy isolation, students/couples, classes, payments, receipts, financial totals, reports, WhatsApp automation, exports, and profile flows.
- Reuse current event handlers, data sources, permissions, Supabase queries, and domain rules wherever possible.
- Dark and Light themes must use shared design tokens; Dark is the default.
- Desktop navigation is a vertical sidebar; mobile navigation is a bottom tab bar.
- Motion must be smooth, brief, functional, and must respect `prefers-reduced-motion`.
- No asynchronous operation introduced by the redesign may be visually inert.
- No database migration, schema change, RLS change, financial-calculation change, receipt-rule change, or automation-rule change is allowed in this phase.
- Existing IDs and event contracts are preserved wherever practical.
- `app/js/core/script.js` must not become the home for new presentation-only behavior.
- Each task ends with automated checks and a small commit before moving forward.

---

## File Structure for This Phase

**Create**
- `app/css/design-tokens.css` — shared Dark/Light design tokens only.
- `app/css/app-shell.css` — desktop sidebar, mobile bottom bar, shell spacing, responsive layout.
- `app/css/ui-states.css` — skeleton, loading, progress, generic motion primitives, reduced-motion fallbacks.
- `app/js/features/theme-controller.js` — theme initialization, persistence, toggle behavior, `theme-color` synchronization.
- `app/js/features/ui-state.js` — presentation-only button/loading/progress helpers; no domain data.
- `app/js/tests/dashboard-redesign-contract.test.mjs` — protects critical DOM IDs/scripts and forbidden database coupling.
- `app/js/tests/theme-controller.test.mjs` — verifies theme resolution and persistence logic.
- `app/js/tests/dashboard-shell-motion.test.mjs` — verifies shell, skeleton, and reduced-motion CSS contracts.

**Modify**
- `app/index.html` — add shell wrappers, theme toggle control, CSS/JS includes, preserving current functional controls and IDs.
- `app/css/style.css` — stop owning top-level theme/shell behavior; retain legacy component styling temporarily where not yet migrated.
- `app/js/features/tab-bar.js` — adapt the existing visual navigator to work in vertical desktop and horizontal mobile modes without owning business navigation state.

**Do not modify in this phase**
- `app/js/core/academy-context.js`
- `app/js/core/academy-data-context.js`
- `app/js/core/academy-onboarding.js`
- `app/js/core/supabase-config.js`
- Supabase migrations/schema files
- Payment/receipt/report/automation query logic

---

### Task 1: Add a regression contract before changing the shell

**Files:**
- Create: `app/js/tests/dashboard-redesign-contract.test.mjs`
- Read only: `app/index.html`
- Read only: `app/js/core/script.js`

**Interfaces:**
- Consumes: current DOM IDs and script includes relied on by existing handlers.
- Produces: a source-level safety net that fails if the redesign accidentally removes critical contracts.

- [ ] **Step 1: Write the failing/guard test**

Create `app/js/tests/dashboard-redesign-contract.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexUrl = new URL('../../index.html', import.meta.url);
const coreUrl = new URL('../core/script.js', import.meta.url);
const index = () => fs.readFileSync(indexUrl, 'utf8');
const core = () => fs.readFileSync(coreUrl, 'utf8');

const criticalIds = [
  'authView', 'appView', 'authForm', 'authEmail', 'authPassword',
  'authSubmit', 'userEmail', 'academyProfileBtn', 'logoutBtn',
  'studentsTab', 'financialTab', 'studentsView', 'financialView',
  'search', 'classFilter', 'exportClassBtn', 'newClassBtn', 'newBtn',
  'list', 'financialClassFilter', 'financialList',
  'modal', 'form', 'classModal', 'classForm', 'toast'
];

test('redesign keeps existing DOM contracts used by business logic', () => {
  const html = index();
  for (const id of criticalIds) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
});

test('redesign keeps existing functional module includes', () => {
  const html = index();
  for (const src of [
    './js/core/script.js',
    './js/core/academy-context.js',
    './js/core/academy-data-context.js',
    './js/features/academy-profile.js',
    './js/features/payment-automation.js',
    './js/features/dashboard.js',
    './js/features/reports.js',
    './js/features/automation-center.js'
  ]) {
    assert.ok(html.includes(src), `missing script ${src}`);
  }
});

test('core still owns existing loading helper and view state', () => {
  const source = core();
  assert.match(source, /let activeView\s*=\s*['"]students['"]/);
  assert.match(source, /function setLoading\(/);
  assert.match(source, /function animateView\(/);
});
```

- [ ] **Step 2: Run the guard test against the current branch**

Run:

```bash
node --test app/js/tests/dashboard-redesign-contract.test.mjs
```

Expected: PASS. This establishes the baseline contract before visual changes.

- [ ] **Step 3: Run existing JavaScript tests as baseline**

Run:

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: all currently passing tests remain passing. Record any pre-existing failure before touching production code rather than hiding it inside the redesign.

- [ ] **Step 4: Commit the guard**

```bash
git add app/js/tests/dashboard-redesign-contract.test.mjs
git commit -m "test: guard dashboard redesign contracts"
```

---

### Task 2: Introduce token-based Dark/Light themes

**Files:**
- Create: `app/css/design-tokens.css`
- Create: `app/js/features/theme-controller.js`
- Create: `app/js/tests/theme-controller.test.mjs`
- Modify: `app/index.html`

**Interfaces:**
- Consumes: `document.documentElement`, `localStorage`, `<meta name="theme-color">`.
- Produces: `window.DassaevyTheme.getTheme()`, `window.DassaevyTheme.setTheme(theme)`, `window.DassaevyTheme.toggleTheme()`, and a root `data-theme="dark|light"` attribute.

- [ ] **Step 1: Write theme behavior tests first**

Create `app/js/tests/theme-controller.test.mjs` to import exported pure helpers from `theme-controller.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTheme, resolveInitialTheme} from '../features/theme-controller.js';

test('normalizes supported themes only', () => {
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('anything'), null);
});

test('stored theme wins when valid', () => {
  assert.equal(resolveInitialTheme('light'), 'light');
  assert.equal(resolveInitialTheme('dark'), 'dark');
});

test('dark is the product default when no stored theme exists', () => {
  assert.equal(resolveInitialTheme(null), 'dark');
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
node --test app/js/tests/theme-controller.test.mjs
```

Expected: FAIL because the module/exports do not exist yet.

- [ ] **Step 3: Implement the minimal theme controller**

Create `app/js/features/theme-controller.js` so that it works both in Node tests and the browser. Required public behavior:

```js
const THEME_KEY = 'dassaevy-theme';

function normalizeTheme(value) {
  return value === 'dark' || value === 'light' ? value : null;
}

function resolveInitialTheme(storedTheme) {
  return normalizeTheme(storedTheme) || 'dark';
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return theme;
  const normalized = normalizeTheme(theme) || 'dark';
  document.documentElement.dataset.theme = normalized;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = normalized === 'dark' ? '#171312' : '#f6f0e6';
  const button = document.getElementById('themeToggle');
  if (button) {
    button.setAttribute('aria-pressed', String(normalized === 'light'));
    button.setAttribute('aria-label', normalized === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
  }
  return normalized;
}

function getTheme() {
  if (typeof document === 'undefined') return 'dark';
  return normalizeTheme(document.documentElement.dataset.theme) || 'dark';
}

function setTheme(theme) {
  const applied = applyTheme(theme);
  if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, applied);
  return applied;
}

function toggleTheme() {
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {normalizeTheme, resolveInitialTheme};
}
if (typeof window !== 'undefined') {
  window.DassaevyTheme = {getTheme, setTheme, toggleTheme};
  const stored = localStorage.getItem(THEME_KEY);
  applyTheme(resolveInitialTheme(stored));
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    applyTheme(getTheme());
  }, {once: true});
}
export {normalizeTheme, resolveInitialTheme};
```

Implementation note: if browser compatibility with `export` in a classic script is a problem during execution, split pure helpers into `theme-utils.mjs` for tests and keep `theme-controller.js` classic. Do not convert the whole app to modules just for this feature.

- [ ] **Step 4: Add shared design tokens**

Create `app/css/design-tokens.css` with semantic variables, not page-specific selectors. Minimum token groups:

```css
:root,
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg-app: #171312;
  --bg-elevated: #201b19;
  --bg-panel: #26201e;
  --bg-soft: #2e2724;
  --text-primary: #f7f1eb;
  --text-secondary: #b8ada6;
  --border-subtle: rgba(255, 255, 255, .08);
  --brand-primary: #8f3d2d;
  --brand-primary-strong: #b6543d;
  --brand-secondary: #c06a4f;
  --success: #62a77b;
  --warning: #d6a65f;
  --danger: #d36a5e;
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 20px;
  --motion-fast: 160ms;
  --motion-normal: 240ms;
  --motion-slow: 320ms;
  --motion-ease: cubic-bezier(.22, 1, .36, 1);
}

:root[data-theme="light"] {
  color-scheme: light;
  --bg-app: #f6f0e6;
  --bg-elevated: #fffdf8;
  --bg-panel: #ffffff;
  --bg-soft: #f1e8de;
  --text-primary: #2c2521;
  --text-secondary: #746b65;
  --border-subtle: #e7ddd0;
  --brand-primary: #5b2118;
  --brand-primary-strong: #7a3022;
  --brand-secondary: #a64b35;
  --success: #2f7d58;
  --warning: #a56b21;
  --danger: #b5463c;
}
```

Keep compatibility aliases such as `--wine`, `--wine-dark`, `--terracotta`, `--cream`, `--paper`, `--ink`, `--muted`, `--line`, `--green`, and `--red` mapped to the semantic variables so current components do not break while migration is incremental.

- [ ] **Step 5: Wire theme assets into `app/index.html` without removing existing assets**

In `<head>`, load `design-tokens.css` before `style.css`. Add an early theme initialization script before body paint that reads `dassaevy-theme` and sets `data-theme`, defaulting to dark. At the end of body, load `theme-controller.js` before modules that may read theme state.

Add a button with exact ID `themeToggle` in the secondary account/shell controls. Do not rename `academyProfileBtn` or `logoutBtn`.

- [ ] **Step 6: Run tests**

```bash
node --test app/js/tests/theme-controller.test.mjs
node --test app/js/tests/dashboard-redesign-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/css/design-tokens.css app/js/features/theme-controller.js app/js/tests/theme-controller.test.mjs app/index.html
git commit -m "feat: add dashboard theme foundation"
```

---

### Task 3: Build the responsive application shell without changing view handlers

**Files:**
- Create: `app/css/app-shell.css`
- Modify: `app/index.html`
- Modify: `app/css/style.css`
- Test: `app/js/tests/dashboard-redesign-contract.test.mjs`

**Interfaces:**
- Consumes: existing `.view-tabs`, `.view-tab`, `#studentsTab`, `#financialTab`, and dynamically inserted dashboard/report/automation tabs.
- Produces: `.app-shell`, `.app-sidebar`, `.app-main`, `.app-sidebar-nav`, `.app-sidebar-footer` presentation structure while retaining the existing `.view-tabs` element as the actual navigation host.

- [ ] **Step 1: Extend the contract test for shell structure**

Add assertions:

```js
test('dashboard shell exposes presentation wrappers without replacing functional tabs', () => {
  const html = index();
  assert.match(html, /class=["'][^"']*app-shell/);
  assert.match(html, /class=["'][^"']*app-sidebar/);
  assert.match(html, /class=["'][^"']*app-main/);
  assert.match(html, /class=["'][^"']*view-tabs/);
  assert.match(html, /id=["']studentsTab["']/);
  assert.match(html, /id=["']financialTab["']/);
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

```bash
node --test app/js/tests/dashboard-redesign-contract.test.mjs
```

Expected: FAIL on missing shell wrappers.

- [ ] **Step 3: Restructure only wrappers in `app/index.html`**

Inside `#appView`, create:

```html
<div class="app-shell">
  <aside class="app-sidebar" aria-label="Navegação principal">
    <div class="app-sidebar-brand">...</div>
    <nav class="view-tabs app-sidebar-nav" aria-label="Seções do sistema">
      <!-- keep studentsTab and financialTab with the same IDs -->
    </nav>
    <div class="app-sidebar-footer">
      <!-- keep academyProfileBtn, themeToggle and logoutBtn with same IDs -->
    </div>
  </aside>
  <div class="app-main">
    <header class="app-topbar">...</header>
    <main class="app">...</main>
  </div>
</div>
```

Do not move dialogs outside `#appView` unless a functional reason is found during implementation. Do not duplicate navigation buttons. The same `.view-tabs` must become vertical on desktop and fixed/contained at the bottom on mobile through CSS.

- [ ] **Step 4: Implement shell CSS**

Create `app/css/app-shell.css` with these layout contracts:

```css
.app-shell {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  background: var(--bg-app);
  color: var(--text-primary);
}

.app-sidebar {
  position: sticky;
  top: 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px 16px;
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}

.app-sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.app-sidebar-footer {
  margin-top: auto;
}

.app-main {
  min-width: 0;
}

@media (max-width: 768px) {
  .app-shell { display: block; }
  .app-sidebar {
    position: static;
    height: auto;
    padding: 0;
    border: 0;
    background: transparent;
  }
  .app-sidebar-brand,
  .app-sidebar-footer { /* footer actions move to top/mobile account surface */ }
  .app-sidebar-nav {
    position: fixed;
    z-index: 1000;
    left: 12px;
    right: 12px;
    bottom: max(12px, env(safe-area-inset-bottom));
    flex-direction: row;
    align-items: center;
    justify-content: space-around;
    padding: 8px;
    border: 1px solid var(--border-subtle);
    border-radius: 18px;
    background: color-mix(in srgb, var(--bg-elevated) 92%, transparent);
    backdrop-filter: blur(18px);
  }
  .app-main { padding-bottom: 88px; }
}
```

During implementation, avoid unsupported CSS if target browsers show issues; if `color-mix()` causes compatibility concerns, use explicit theme tokens instead.

- [ ] **Step 5: Remove only conflicting shell rules from `style.css`**

Move responsibility for `.view-tabs` positioning/layout, global body dashboard background, and top-level shell spacing to `app-shell.css`. Keep component rules that are still needed by current screens. Do not perform a broad cleanup in this task.

- [ ] **Step 6: Wire `app-shell.css` after tokens and before `style.css`**

Order:

```html
<link rel="stylesheet" href="./css/design-tokens.css">
<link rel="stylesheet" href="./css/app-shell.css">
<link rel="stylesheet" href="./css/style.css">
```

- [ ] **Step 7: Run contract tests**

```bash
node --test app/js/tests/dashboard-redesign-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Manual smoke check before commit**

Open with Live Server and verify, without changing any records:
- Login form still opens and submits.
- Desktop shows vertical sidebar.
- Existing Alunos and Financeiro buttons still change views.
- Dynamically inserted Visão Geral, Relatórios, and Automação entries appear in the same navigation host.
- Profile and logout buttons still respond.
- At viewport <= 768px the same nav becomes the bottom bar.

- [ ] **Step 9: Commit**

```bash
git add app/index.html app/css/app-shell.css app/css/style.css app/js/tests/dashboard-redesign-contract.test.mjs
git commit -m "feat: add responsive dashboard shell"
```

---

### Task 4: Adapt the animated tab indicator for vertical and mobile navigation

**Files:**
- Modify: `app/js/features/tab-bar.js`
- Create: `app/js/tests/dashboard-shell-motion.test.mjs`
- Modify: `app/css/app-shell.css`

**Interfaces:**
- Consumes: `.view-tabs`, `.view-tab.active`, dynamically inserted tabs, `ResizeObserver`.
- Produces: purely visual active indicator positioning. It must not call Supabase, calculate domain state, or replace the existing `setView` behavior.

- [ ] **Step 1: Write source contract tests**

Create `app/js/tests/dashboard-shell-motion.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tabUrl = new URL('../features/tab-bar.js', import.meta.url);
const shellCssUrl = new URL('../../css/app-shell.css', import.meta.url);
const tabSource = () => fs.readFileSync(tabUrl, 'utf8');
const shellCss = () => fs.readFileSync(shellCssUrl, 'utf8');

test('navigation animation remains presentation-only', () => {
  const source = tabSource();
  assert.match(source, /MutationObserver/);
  assert.match(source, /ResizeObserver/);
  assert.doesNotMatch(source, /\.from\s*\(/);
  assert.doesNotMatch(source, /supabase/i);
});

test('shell supports desktop vertical and mobile horizontal navigation', () => {
  const css = shellCss();
  assert.match(css, /flex-direction:\s*column/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)/);
  assert.match(css, /flex-direction:\s*row/);
});
```

- [ ] **Step 2: Run tests**

```bash
node --test app/js/tests/dashboard-shell-motion.test.mjs
```

Expected: current presentation-only test may pass, but shell orientation assertions should enforce the new contract.

- [ ] **Step 3: Refine `tab-bar.js` instead of replacing functional navigation**

Keep:
- Dynamic tab decoration.
- `MutationObserver` for tabs inserted by dashboard/reports/automation modules.
- `ResizeObserver` for indicator recalculation.
- Existing fallback behavior for automation only if still necessary.

Change only visual assumptions:
- `syncIndicator()` must calculate both X and Y offsets as it already does.
- Do not hardcode horizontal-only widths/tooltip positions.
- Add a `data-nav-orientation` attribute (`vertical` or `horizontal`) based on the mobile media query so CSS can choose label treatment.
- On desktop, show icon + label persistently.
- On mobile, show compact icon and short label appropriate for bottom navigation.

Do not add new `setView` wrappers in `tab-bar.js`.

- [ ] **Step 4: Motion behavior in CSS**

Use transform/opacity for the active indicator and labels. Required pattern:

```css
.tab-indicator {
  transition:
    transform var(--motion-normal) var(--motion-ease),
    width var(--motion-normal) var(--motion-ease),
    height var(--motion-normal) var(--motion-ease),
    opacity var(--motion-fast) ease;
}
```

No bounce/elastic easing. No transition of `top`, `left`, `width` of page layout containers, margins, or padding for animation.

- [ ] **Step 5: Run tests**

```bash
node --test app/js/tests/dashboard-shell-motion.test.mjs
node --test app/js/tests/dashboard-redesign-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Manual navigation smoke check**

Verify every currently available navigation item once on desktop and once on mobile. Confirm active state follows the actual current view rather than merely the last button clicked.

- [ ] **Step 7: Commit**

```bash
git add app/js/features/tab-bar.js app/css/app-shell.css app/js/tests/dashboard-shell-motion.test.mjs
git commit -m "feat: adapt navigation motion to dashboard shell"
```

---

### Task 5: Add reusable skeleton, loading, progress, and motion primitives

**Files:**
- Create: `app/css/ui-states.css`
- Create: `app/js/features/ui-state.js`
- Modify: `app/index.html`
- Modify: `app/js/tests/dashboard-shell-motion.test.mjs`

**Interfaces:**
- Consumes: buttons/elements passed by presentation modules.
- Produces: `window.DassaevyUI.setButtonState(element, state, options)`, `window.DassaevyUI.setProgress(element, value)`, standard CSS classes `.is-loading`, `.is-success`, `.is-error`, `.skeleton`, `.view-enter`.
- Does not store or calculate business data.

- [ ] **Step 1: Extend tests for loading/motion contracts**

Add:

```js
const statesCssUrl = new URL('../../css/ui-states.css', import.meta.url);
const statesCss = () => fs.readFileSync(statesCssUrl, 'utf8');

test('ui states define skeleton and reduced-motion behavior', () => {
  const css = statesCss();
  assert.match(css, /\.skeleton/);
  assert.match(css, /@keyframes\s+skeleton-shimmer/);
  assert.match(css, /\.is-loading/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css, /transition[^;]*(?:margin|padding|top|left)/i);
});
```

- [ ] **Step 2: Run and verify failure**

```bash
node --test app/js/tests/dashboard-shell-motion.test.mjs
```

Expected: FAIL because `ui-states.css` does not exist.

- [ ] **Step 3: Create UI state CSS primitives**

`app/css/ui-states.css` must include:
- `.skeleton` with stable dimensions inherited from the host and a subtle shimmer.
- `.skeleton-line`, `.skeleton-circle`, `.skeleton-card` helpers.
- `.is-loading` and `[aria-busy="true"]` visual treatment.
- `.ui-progress` / `.ui-progress-bar` with transform-based progress where practical.
- `.view-enter` using opacity + translateY + optional subtle blur.
- `.is-exiting` with shorter/subtler opacity + translateY than entry.
- disabled/loading buttons preserve their width to prevent layout shift.
- `@media (prefers-reduced-motion: reduce)` reduces animation/transition duration to `0.01ms` and removes transforms.

- [ ] **Step 4: Create presentation-only state helper**

Create `app/js/features/ui-state.js` with explicit state handling:

```js
(() => {
  function setButtonState(button, state, {loadingText, successText, errorText} = {}) {
    if (!button) return;
    button.dataset.defaultLabel ||= button.textContent;
    button.classList.remove('is-loading', 'is-success', 'is-error');
    button.removeAttribute('aria-busy');

    if (state === 'loading') {
      button.classList.add('is-loading');
      button.setAttribute('aria-busy', 'true');
      button.disabled = true;
      if (loadingText) button.textContent = loadingText;
      return;
    }

    button.disabled = false;
    if (state === 'success') {
      button.classList.add('is-success');
      button.textContent = successText || button.dataset.defaultLabel;
      return;
    }
    if (state === 'error') {
      button.classList.add('is-error');
      button.textContent = errorText || button.dataset.defaultLabel;
      return;
    }
    button.textContent = button.dataset.defaultLabel;
  }

  function setProgress(element, value) {
    if (!element) return;
    const normalized = Math.max(0, Math.min(100, Number(value) || 0));
    element.style.setProperty('--progress', `${normalized}%`);
    element.setAttribute('aria-valuenow', String(normalized));
  }

  window.DassaevyUI = {setButtonState, setProgress};
})();
```

Do not replace existing `setLoading()` in `core/script.js` during this phase. New/refactored visual features may adopt `DassaevyUI` incrementally in later phases; this avoids changing proven business flows just to satisfy a visual abstraction.

- [ ] **Step 5: Load `ui-states.css` and `ui-state.js`**

CSS order:

```html
<link rel="stylesheet" href="./css/design-tokens.css">
<link rel="stylesheet" href="./css/app-shell.css">
<link rel="stylesheet" href="./css/ui-states.css">
<link rel="stylesheet" href="./css/style.css">
```

JavaScript: load `ui-state.js` before new redesign feature modules, but do not move Supabase/bootstrap script order.

- [ ] **Step 6: Run tests**

```bash
node --test app/js/tests/dashboard-shell-motion.test.mjs
node --test app/js/tests/dashboard-redesign-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/css/ui-states.css app/js/features/ui-state.js app/index.html app/js/tests/dashboard-shell-motion.test.mjs
git commit -m "feat: add reusable dashboard ui states"
```

---

### Task 6: Foundation regression gate

**Files:**
- No production files unless fixing a regression found by this gate.
- Optional documentation update: append results to this plan under a `Foundation Verification` section during implementation.

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces: verified foundation branch safe enough to begin the Overview redesign plan.

- [ ] **Step 1: Run the complete automated JavaScript suite available in the repository**

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: all tests pass. Any failing pre-existing test must be distinguished from a redesign regression using the baseline recorded in Task 1.

- [ ] **Step 2: Verify no database files changed in this phase**

```bash
git diff --name-only 252ab6d8072d38e16ec4c4997752170ac531cf81...HEAD
```

Expected: no path under `supabase/` and no `app/database/` file appears.

- [ ] **Step 3: Verify core business modules were not unintentionally changed**

```bash
git diff --name-only 252ab6d8072d38e16ec4c4997752170ac531cf81...HEAD -- app/js/core app/js/features
```

Expected changes under `app/js/features/` are limited to presentation files planned here (`theme-controller.js`, `ui-state.js`, `tab-bar.js`). `app/js/core/script.js`, academy context/data modules, payment/receipt/report/automation logic should remain unchanged.

- [ ] **Step 4: Manual functional smoke test using a safe test account/data set**

Check each flow without redesign-specific assumptions:
1. Login.
2. Sign out and login again.
3. Open Profile and close it.
4. Navigate Visão Geral → Alunos → Financeiro → Relatórios → Automação where available.
5. Open "Cadastrar casal" and cancel without saving.
6. Open "Nova turma" and cancel without saving.
7. Search/filter Alunos.
8. Switch Financeiro class filter.
9. Toggle Dark → Light → Dark and reload; persisted theme must remain.
10. Resize desktop → mobile; navigation changes to bottom bar and all visible views remain reachable.

Expected: no business behavior changes and no console errors introduced by the foundation.

- [ ] **Step 5: Functional write smoke test on disposable data**

Using a disposable/test record only:
1. Create a temporary student/couple.
2. Edit the record.
3. Toggle one payment state and verify totals update as before.
4. Delete the temporary record.
5. Confirm no unrelated record changes.

Expected: behavior matches pre-redesign main.

- [ ] **Step 6: Commit only if verification required a fix**

If no fix was needed, do not create an empty commit. If a foundation regression was corrected:

```bash
git add <only-the-files-needed-for-the-fix>
git commit -m "fix: preserve dashboard foundation behavior"
```

- [ ] **Step 7: Stop before Phase 2**

Do not redesign Dashboard/Overview content, student rows, finance tables, reports, or automation cards as part of this plan. Once this gate passes, create/execute the separate Overview implementation plan.

---

## Self-Review

### Spec coverage
- Dark + Light themes: Tasks 2 and 6.
- Dark default: Task 2.
- Desktop sidebar/mobile bottom bar: Tasks 3 and 4.
- Existing navigation contracts preserved: Tasks 1, 3, 4, and 6.
- Motion principles/reduced motion: Tasks 4 and 5.
- Skeleton/loading/progress primitives: Task 5.
- Separation from business logic: Global Constraints, Tasks 1, 4, 5, and 6.
- No DB/schema/RLS changes: Global Constraints and Task 6.
- Regression checks before next phase: Task 6.

### Placeholder scan
No `TBD`, `TODO`, "implement later", generic error-handling placeholders, or undefined follow-up steps are used.

### Type/interface consistency
- Theme public values are exactly `dark | light`.
- Root state is `data-theme`.
- Navigation host remains `.view-tabs` and tab state remains `.view-tab.active`.
- Existing IDs `studentsTab` and `financialTab` remain unchanged.
- UI presentation helper is `window.DassaevyUI`; it does not become a source of truth for students, payments, academy, or finance data.

## Completion Boundary

This plan is complete when the application has a safe modern shell, two themes, responsive sidebar/bottom navigation, reusable motion/loading primitives, and all foundation regression checks pass. The Overview dashboard redesign is intentionally a separate plan so it can be reviewed and tested independently.