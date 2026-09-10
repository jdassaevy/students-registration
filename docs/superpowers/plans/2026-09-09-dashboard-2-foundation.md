# Dassaevy Labs Dashboard 2.0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the redesign foundation — Dark/Light theming, desktop sidebar, mobile bottom navigation, motion primitives, skeleton/loading primitives, and regression guards — without changing business behavior.

**Architecture:** Keep the current HTML/CSS/JavaScript application and existing business modules intact. Add a presentation-only layer around the current navigation and content, preserve the existing element IDs and `setView` event contracts, and introduce isolated UI modules for theme/navigation/loading behavior. The first phase must not change Supabase queries, RLS, calculations, receipt behavior, academy isolation, payment logic, or database schema.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript loaded as classic scripts, Node.js built-in test runner/assertions, Supabase client already used by the application.

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
- The future `Turmas` sidebar destination is not introduced as a dead/duplicate button in this foundation phase. The current class management flow remains unchanged until the dedicated Students/Classes phase creates a real `Turmas` view.

---

## File Structure for This Phase

**Create**
- `app/css/design-tokens.css` — shared Dark/Light design tokens only.
- `app/css/app-shell.css` — desktop sidebar, mobile bottom bar, shell spacing, responsive layout.
- `app/css/ui-states.css` — skeleton, loading, progress, generic motion primitives, reduced-motion fallbacks.
- `app/js/features/theme-controller.js` — classic-script theme initialization, persistence, toggle behavior, `theme-color` synchronization; exposes browser API and CommonJS exports for tests.
- `app/js/features/ui-state.js` — presentation-only button/loading/progress helpers; no domain data.
- `app/js/tests/dashboard-redesign-contract.test.mjs` — protects critical DOM IDs/scripts and forbidden business coupling.
- `app/js/tests/theme-controller.test.mjs` — verifies theme resolution and persistence helpers.
- `app/js/tests/dashboard-shell-motion.test.mjs` — verifies shell, skeleton, and reduced-motion CSS contracts.

**Modify**
- `app/index.html` — add shell wrappers, theme toggle control, CSS/JS includes, preserving current functional controls and IDs.
- `app/css/style.css` — stop owning top-level theme/shell behavior; retain legacy component styling temporarily where not yet migrated.
- `app/js/features/tab-bar.js` — adapt the existing visual navigator to work in vertical desktop and horizontal mobile modes without owning business navigation state.

**Do not modify in this phase**
- `app/js/core/script.js`
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

- [ ] **Step 1: Write the guard test**

Create `app/js/tests/dashboard-redesign-contract.test.mjs`:

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

test('core still owns current loading and view behavior', () => {
  const source = core();
  assert.match(source, /let activeView\s*=\s*['"]students['"]/);
  assert.match(source, /function setLoading\(/);
  assert.match(source, /function animateView\(/);
});
```

- [ ] **Step 2: Run the guard test against the current branch**

```bash
node --test app/js/tests/dashboard-redesign-contract.test.mjs
```

Expected: PASS. This establishes the baseline contract before visual changes.

- [ ] **Step 3: Run the existing JavaScript tests as the baseline**

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: all tests that pass before production-code changes continue to pass. Record any pre-existing failure separately rather than hiding it inside the redesign.

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
- Produces in browser: `window.DassaevyTheme.getTheme()`, `window.DassaevyTheme.setTheme(theme)`, `window.DassaevyTheme.toggleTheme()` and root `data-theme="dark|light"`.
- Produces in Node: CommonJS exports `normalizeTheme` and `resolveInitialTheme` for pure tests.

- [ ] **Step 1: Write theme behavior tests first**

Create `app/js/tests/theme-controller.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {normalizeTheme, resolveInitialTheme} = require('../features/theme-controller.js');

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

Expected: FAIL because `theme-controller.js` does not exist.

- [ ] **Step 3: Implement a classic-script/CommonJS compatible controller**

Create `app/js/features/theme-controller.js`:

```js
const THEME_KEY = 'dassaevy-theme';

function normalizeTheme(value) {
  return value === 'dark' || value === 'light' ? value : null;
}

function resolveInitialTheme(storedTheme) {
  return normalizeTheme(storedTheme) || 'dark';
}

function applyTheme(theme) {
  const normalized = normalizeTheme(theme) || 'dark';
  if (typeof document === 'undefined') return normalized;

  document.documentElement.dataset.theme = normalized;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = normalized === 'dark' ? '#171312' : '#f6f0e6';

  const button = document.getElementById('themeToggle');
  if (button) {
    button.setAttribute('aria-pressed', String(normalized === 'light'));
    button.setAttribute(
      'aria-label',
      normalized === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'
    );
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
  const stored = window.localStorage.getItem(THEME_KEY);
  applyTheme(resolveInitialTheme(stored));
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    applyTheme(getTheme());
  }, {once: true});
}
```

Do not add ESM `export` syntax to this classic script and do not convert the existing application to ES modules in this redesign.

- [ ] **Step 4: Add shared design tokens**

Create `app/css/design-tokens.css` with semantic tokens and compatibility aliases:

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

  --wine: var(--brand-primary);
  --wine-dark: var(--brand-primary-strong);
  --terracotta: var(--brand-secondary);
  --cream: var(--bg-app);
  --paper: var(--bg-elevated);
  --ink: var(--text-primary);
  --muted: var(--text-secondary);
  --line: var(--border-subtle);
  --green: var(--success);
  --red: var(--danger);
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
  --brand-primary-strong: #34150f;
  --brand-secondary: #a64b35;
  --success: #2f7d58;
  --warning: #a56b21;
  --danger: #b5463c;
}
```

- [ ] **Step 5: Wire theme assets without removing existing assets**

In `<head>`, load `design-tokens.css` before `style.css`. Add this small early script before visible body content to prevent a light-theme flash:

```html
<script>
  (() => {
    const saved = localStorage.getItem('dassaevy-theme');
    document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';
  })();
</script>
```

At the end of the body, load `./js/features/theme-controller.js` as a normal classic `<script>` before redesign-only UI modules.

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
- Produces: `.app-shell`, `.app-sidebar`, `.app-main`, `.app-sidebar-nav`, `.app-sidebar-footer` presentation structure while retaining the existing `.view-tabs` element as the navigation host.

- [ ] **Step 1: Extend the contract test for shell structure**

Add:

```js
test('dashboard shell adds wrappers without replacing functional tabs', () => {
  const html = index();
  assert.match(html, /class=["'][^"']*app-shell/);
  assert.match(html, /class=["'][^"']*app-sidebar/);
  assert.match(html, /class=["'][^"']*app-main/);
  assert.match(html, /class=["'][^"']*view-tabs/);
  assert.match(html, /id=["']studentsTab["']/);
  assert.match(html, /id=["']financialTab["']/);
});
```

- [ ] **Step 2: Run and verify the new assertion fails**

```bash
node --test app/js/tests/dashboard-redesign-contract.test.mjs
```

Expected: FAIL on missing shell wrappers.

- [ ] **Step 3: Restructure wrappers only in `app/index.html`**

Target structure:

```html
<div id="appView" hidden>
  <div class="app-shell">
    <aside class="app-sidebar" aria-label="Navegação principal">
      <div class="app-sidebar-brand">...</div>
      <nav class="view-tabs app-sidebar-nav" aria-label="Seções do sistema">
        <button type="button" class="view-tab active" id="studentsTab">Alunos</button>
        <button type="button" class="view-tab" id="financialTab">Financeiro</button>
      </nav>
      <div class="app-sidebar-footer">
        <!-- keep academyProfileBtn, themeToggle and logoutBtn IDs -->
      </div>
    </aside>
    <div class="app-main">
      <header class="app-topbar">...</header>
      <main class="app">
        <!-- keep studentsView and financialView with current contents/IDs -->
      </main>
    </div>
  </div>
  <!-- keep current dialogs and toast inside appView -->
</div>
```

Do not duplicate navigation buttons. The same `.view-tabs` becomes vertical on desktop and bottom-oriented on mobile. Dashboard, reports, and automation scripts must continue inserting their existing tabs into this same host.

- [ ] **Step 4: Implement shell CSS**

Create `app/css/app-shell.css`:

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

.app-sidebar-footer { margin-top: auto; }
.app-main { min-width: 0; }

@media (max-width: 768px) {
  .app-shell { display: block; }
  .app-sidebar {
    position: static;
    height: auto;
    padding: 0;
    border: 0;
    background: transparent;
  }
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
    background: var(--bg-elevated);
  }
  .app-main { padding-bottom: 88px; }
}
```

Add mobile account/profile/theme/logout access in the topbar so hiding/reformatting the desktop footer never makes those actions unreachable.

- [ ] **Step 5: Remove only conflicting top-level rules from `style.css`**

Move responsibility for `.view-tabs` positioning/layout, dashboard body background, and top-level shell spacing to `app-shell.css`. Keep legacy component rules required by current screens. Do not broadly restyle dashboard cards, student tables, finance, reports, or automation here.

- [ ] **Step 6: Wire CSS in this order**

```html
<link rel="stylesheet" href="./css/design-tokens.css">
<link rel="stylesheet" href="./css/app-shell.css">
<link rel="stylesheet" href="./css/style.css">
```

- [ ] **Step 7: Run the contract test**

```bash
node --test app/js/tests/dashboard-redesign-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Manual smoke check before commit**

Using Live Server, without changing records:
- Login form submits normally.
- Desktop shows a vertical sidebar.
- Alunos and Financeiro still change views.
- Dynamically inserted Visão Geral, Relatórios, and Automação entries appear in the same navigation host.
- Profile, theme, and logout actions remain reachable.
- At viewport <= 768px the same nav becomes a bottom bar.

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
- Consumes: `.view-tabs`, `.view-tab.active`, dynamically inserted tabs, `MutationObserver`, `ResizeObserver`.
- Produces: presentation-only active indicator positioning. It must not call Supabase, calculate domain state, or replace existing `setView` behavior.

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
  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /\.from\s*\(/);
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

Expected: shell orientation assertions enforce the new contract.

- [ ] **Step 3: Refine `tab-bar.js` rather than replacing navigation behavior**

Keep:
- Dynamic tab decoration.
- `MutationObserver` for dashboard/reports/automation tabs.
- `ResizeObserver` for indicator recalculation.
- Existing automation fallback only if verification shows it is still necessary.

Change only visual assumptions:
- `syncIndicator()` continues calculating both X and Y offsets from element rectangles.
- Add `data-nav-orientation="vertical|horizontal"` to the navigation host based on `matchMedia('(max-width: 768px)')`.
- Re-run indicator positioning when the media query changes.
- Desktop shows icon + label persistently.
- Mobile shows compact icon + short label.

Do not add a new `setView` wrapper in `tab-bar.js`.

- [ ] **Step 4: Use non-bouncy motion**

```css
.tab-indicator {
  transition:
    transform var(--motion-normal) var(--motion-ease),
    width var(--motion-normal) var(--motion-ease),
    height var(--motion-normal) var(--motion-ease),
    opacity var(--motion-fast) ease;
}
```

Animate the indicator through transform/opacity. Do not animate layout margins, padding, `top`, or `left`.

- [ ] **Step 5: Run tests**

```bash
node --test app/js/tests/dashboard-shell-motion.test.mjs
node --test app/js/tests/dashboard-redesign-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Manual navigation smoke check**

Verify every currently available navigation destination once on desktop and once on mobile. Confirm active state follows the actual active view.

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
- Produces: `window.DassaevyUI.setButtonState(element, state, options)`, `window.DassaevyUI.setProgress(element, value)`, `.is-loading`, `.is-success`, `.is-error`, `.skeleton`, `.view-enter`.
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

`app/css/ui-states.css` must provide:
- `.skeleton`, `.skeleton-line`, `.skeleton-circle`, `.skeleton-card`.
- `@keyframes skeleton-shimmer` using background-position/transform-friendly animation.
- `.is-loading`, `.is-success`, `.is-error`, `[aria-busy="true"]`.
- `.ui-progress` and `.ui-progress-bar`.
- `.view-enter` using opacity + translateY + subtle blur.
- `.is-exiting` shorter and subtler than entry.
- stable button width during loading.
- `@media (prefers-reduced-motion: reduce)` reducing animations/transitions to `0.01ms` and removing transforms.

- [ ] **Step 4: Create the presentation-only helper**

Create `app/js/features/ui-state.js`:

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

Do not replace the proven `setLoading()` implementation in `app/js/core/script.js` during this phase. New presentation modules adopt `DassaevyUI` incrementally later.

- [ ] **Step 5: Wire `ui-states.css` and `ui-state.js`**

CSS order:

```html
<link rel="stylesheet" href="./css/design-tokens.css">
<link rel="stylesheet" href="./css/app-shell.css">
<link rel="stylesheet" href="./css/ui-states.css">
<link rel="stylesheet" href="./css/style.css">
```

Load `ui-state.js` as a classic script without changing the existing Supabase/bootstrap script order.

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
- Update this plan only to append actual verification results during execution.

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces: a foundation branch safe enough to begin the separate Overview plan.

- [ ] **Step 1: Run the complete automated JavaScript suite available in the repository**

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: tests match or improve on the Task 1 baseline; no new redesign regression is accepted.

- [ ] **Step 2: Verify no database files changed**

Use the design-spec commit as the phase baseline:

```bash
git diff --name-only 252ab6d8072d38e16ec4c4997752170ac531cf81...HEAD
```

Expected: no path under `supabase/` and no `app/database/` file appears.

- [ ] **Step 3: Verify business modules were not unintentionally changed**

```bash
git diff --name-only 252ab6d8072d38e16ec4c4997752170ac531cf81...HEAD -- app/js/core app/js/features
```

Expected planned feature changes are limited to `theme-controller.js`, `ui-state.js`, and `tab-bar.js`. `app/js/core/script.js`, academy context/data modules, payment, receipt, reports, and automation business logic remain unchanged.

- [ ] **Step 4: Manual read-only smoke test**

Using Live Server:
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

Expected: no behavior changes and no new console errors.

- [ ] **Step 5: Functional write smoke test using disposable data only**

1. Create a temporary student/couple.
2. Edit the record.
3. Toggle one payment state and verify totals update as before.
4. Delete the temporary record.
5. Confirm no unrelated record changed.

Expected: behavior matches pre-redesign main.

- [ ] **Step 6: Commit only if verification required a fix**

If a regression is found, fix only that regression, rerun Steps 1–5, then commit:

```bash
git add <files-that-fixed-the-regression>
git commit -m "fix: preserve dashboard foundation behavior"
```

If no fix is needed, do not create an empty commit.

- [ ] **Step 7: Stop before Phase 2**

Do not redesign Overview content, student rows, class management, finance tables, reports, or automation cards as part of this plan. Once this gate passes, create/execute the separate Overview implementation plan.

---

## Self-Review

### Spec coverage
- Dark + Light themes and Dark default: Task 2.
- Desktop sidebar/mobile bottom bar: Tasks 3 and 4.
- Current navigation contracts preserved: Tasks 1, 3, 4, and 6.
- Future Turmas destination handled without a dead navigation item: Global Constraints and completion boundary.
- Motion principles/reduced motion: Tasks 4 and 5.
- Skeleton/loading/progress primitives: Task 5.
- Separation from business logic: Global Constraints, Tasks 1, 4, 5, and 6.
- No DB/schema/RLS changes: Global Constraints and Task 6.
- Regression checks before next phase: Task 6.

### Placeholder scan
No `TBD`, `TODO`, "implement later", conditional module-syntax workaround, generic error-handling placeholder, or undefined follow-up step remains.

### Type/interface consistency
- Themes are exactly `dark | light`.
- Root theme state is `data-theme`.
- `theme-controller.js` remains a classic browser script and exposes only CommonJS exports under Node.
- Navigation host remains `.view-tabs`; current state remains `.view-tab.active`.
- Existing IDs `studentsTab` and `financialTab` remain unchanged.
- UI presentation helper is `window.DassaevyUI`; it does not become a source of truth for students, payments, academy, or finance data.

## Completion Boundary

This plan is complete when the application has a safe modern shell, Dark/Light themes, responsive sidebar/bottom navigation for currently implemented views, reusable motion/loading primitives, and all foundation regression checks pass. A real `Turmas` destination and the redesigned Overview/Students/Finance/Reports/Automation surfaces remain separate implementation plans so each can be reviewed and tested independently.