# Dassaevy Labs UI v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the entire Dassaevy Labs visual layer as UI v2 using Urban Loft for dark mode and Spiced Mocha for light mode, while preserving existing business logic, DOM contracts, multi-academy isolation, payments, receipts, reports, and automation behavior.

**Architecture:** The migration is visual-first and progressive. Existing JavaScript remains responsible for data and behavior, stable DOM IDs remain intact, and new presentation lives under `app/css/ui-v2/`. Migrated screens receive complete UI v2 styling while legacy CSS is still present; after every screen is independent, legacy stylesheets and page-level CSS injection are removed in one final cleanup task.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Supabase JS v2, Chart.js 4.4.7, Node.js 22 test runner (`node:test`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-10-ui-v2-full-redesign-design.md`

## Global Constraints

- Do not intentionally change business rules, Supabase data access, RLS, multi-academy isolation, payment calculations, receipt rules, WhatsApp automation rules, authentication flows, or database schema.
- Preserve existing DOM IDs used by the functional code unless a separately justified regression test proves a required contract change.
- Dark theme must follow Urban Loft: `#000000`, `#464646`, `#A35E47`, `#9C9A9A`, with `#F5F5DC` as primary text.
- Light theme must follow Spiced Mocha: `#F5F5DC`, `#6F4E37`, `#D47E30`, `#6D3B07`.
- Shared components consume semantic tokens; migrated components must not depend on hardcoded pure-white dark surfaces.
- Motion follows the approved Motion Principles guidance: subtle, functional, no elastic/bouncy enterprise motion, entry via small opacity/translate/blur, quieter exits, and full `prefers-reduced-motion` support.
- Major async surfaces require geometry-matched skeletons; buttons use `idle -> loading -> success | error` where relevant.
- No page-level presentation CSS may remain injected from feature JavaScript after the corresponding page migration.
- No database migration belongs to this plan.
- Every implementation task follows TDD: failing test first, confirm RED, minimal implementation, confirm GREEN, then commit.
- After each page task, pause for the user's manual screenshot/browser review before continuing to the next page.

---

## File Structure

### New UI v2 files

- `app/css/ui-v2/tokens.css` — theme palettes, semantic color tokens, radii, spacing, shadows, type scale, motion timing.
- `app/css/ui-v2/base.css` — reset, body, typography, focus, form inheritance, hidden/accessibility primitives.
- `app/css/ui-v2/layout.css` — app shell, sidebar, topbar, responsive desktop/mobile navigation.
- `app/css/ui-v2/components.css` — buttons, inputs, selects, tables, cards, badges, switches, dialogs, toasts, empty states, progress, skeleton primitives.
- `app/css/ui-v2/motion.css` — view entry/exit, stagger helpers, modal/dropdown/toast motion, reduced-motion overrides.
- `app/css/ui-v2/pages/auth.css` — auth composition only.
- `app/css/ui-v2/pages/dashboard.css` — dashboard arrangement only.
- `app/css/ui-v2/pages/students.css` — students toolbar/table/mobile cards only.
- `app/css/ui-v2/pages/classes.css` — dedicated classes destination.
- `app/css/ui-v2/pages/financial.css` — financial page arrangement only.
- `app/css/ui-v2/pages/reports.css` — reports layout/chart containers only.
- `app/css/ui-v2/pages/automation.css` — automation layout only.
- `app/css/ui-v2/pages/profile.css` — academy profile layout only.

### New/updated tests

- `app/js/tests/ui-v2-foundation.test.mjs`
- `app/js/tests/ui-v2-auth-shell.test.mjs`
- `app/js/tests/ui-v2-components.test.mjs`
- `app/js/tests/ui-v2-dashboard.test.mjs`
- `app/js/tests/ui-v2-students.test.mjs`
- `app/js/tests/ui-v2-classes.test.mjs`
- `app/js/tests/ui-v2-financial.test.mjs`
- `app/js/tests/ui-v2-reports.test.mjs`
- `app/js/tests/ui-v2-automation.test.mjs`
- `app/js/tests/ui-v2-profile-dialogs.test.mjs`
- `app/js/tests/ui-v2-legacy-removal.test.mjs`

### Existing files expected to change

- `app/index.html` — load UI v2 assets, add dedicated Classes destination/container, add mobile students container, preserve all current functional IDs.
- `app/js/features/theme-controller.js` — update browser theme-color to new palettes without changing public API.
- `app/js/features/ui-state.js` — retain `window.DassaevyUI.setButtonState` and `.setProgress`; add only reusable state helpers required by skeletons.
- `app/js/features/custom-select.js` — stop injecting `custom-select-fix.css`; keep behavior and accessibility while presentation moves to UI v2.
- `app/js/features/dashboard.js` — remove injected CSS; keep markup/data behavior.
- `app/js/features/reports.js` — remove injected CSS; use semantic CSS variables for Chart.js; expose chart loading state.
- `app/js/features/automation-center.js` — remove injected CSS; expose skeleton/busy state using existing data flow.
- `app/js/features/academy-profile.js` — preserve behavior; move presentation dependency to UI v2 profile/components CSS.
- `app/js/core/script.js` — only minimal presentation-adjacent changes required for dedicated Classes view, students mobile rendering, and consistent busy state; do not change data semantics.
- `app/css/style.css`, `app/css/style-base.css`, `app/css/custom-select-fix.css`, `app/css/app-shell.css`, `app/css/design-tokens.css`, `app/css/ui-states.css`, `app/css/auth-surface.css` — retained during migration, then removed from `index.html` and deleted only in the final legacy-removal task when no screen depends on them.

---

### Task 1: Build the UI v2 foundation and guardrails

**Files:**
- Create: `app/css/ui-v2/tokens.css`
- Create: `app/css/ui-v2/base.css`
- Create: `app/css/ui-v2/components.css`
- Create: `app/css/ui-v2/motion.css`
- Create: `app/js/tests/ui-v2-foundation.test.mjs`
- Modify: `app/index.html`
- Modify: `app/js/features/theme-controller.js`

**Interfaces:**
- Consumes: existing `document.documentElement.dataset.theme`, localStorage key `dassaevy-theme`, `window.DassaevyTheme` public API.
- Produces: semantic CSS tokens (`--surface-page`, `--surface-sidebar`, `--surface-card`, `--surface-elevated`, `--surface-input`, `--text-primary`, `--text-secondary`, `--text-muted`, `--text-on-accent`, `--accent-primary`, `--accent-hover`, `--accent-soft`, `--border-default`, `--border-strong`, `--status-success`, `--status-warning`, `--status-danger`) and shared motion tokens.

- [ ] **Step 1: Write the failing foundation contract**

Create `app/js/tests/ui-v2-foundation.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../../index.html');
const tokens = read('../../css/ui-v2/tokens.css');
const motion = read('../../css/ui-v2/motion.css');

test('UI v2 publishes approved theme palettes and semantic tokens', () => {
  for (const value of ['#000000', '#464646', '#A35E47', '#9C9A9A', '#F5F5DC', '#6F4E37', '#D47E30', '#6D3B07']) {
    assert.match(tokens, new RegExp(value, 'i'));
  }
  for (const token of [
    '--surface-page', '--surface-sidebar', '--surface-card', '--surface-elevated', '--surface-input',
    '--text-primary', '--text-secondary', '--text-muted', '--text-on-accent',
    '--accent-primary', '--accent-hover', '--accent-soft', '--border-default', '--border-strong',
    '--status-success', '--status-warning', '--status-danger'
  ]) assert.ok(tokens.includes(token), `missing ${token}`);
});

test('UI v2 styles load after transitional legacy styles during migration', () => {
  const legacy = index.indexOf('./css/style.css');
  const v2 = index.indexOf('./css/ui-v2/tokens.css');
  assert.ok(legacy >= 0 && v2 > legacy);
});

test('motion layer provides reduced-motion protection and quiet entry primitives', () => {
  assert.match(motion, /prefers-reduced-motion:\s*reduce/);
  assert.match(motion, /opacity/);
  assert.match(motion, /translateY/);
  assert.doesNotMatch(motion, /cubic-bezier\([^)]*1\.[1-9]/);
});
```

- [ ] **Step 2: Run the foundation test and confirm RED**

Run:

```bash
node --test app/js/tests/ui-v2-foundation.test.mjs
```

Expected: FAIL because `app/css/ui-v2/` does not exist yet.

- [ ] **Step 3: Create semantic tokens and base primitives**

Implement `tokens.css` with two complete theme blocks. Use derived charcoal surfaces instead of large `#464646` slabs:

```css
:root,
:root[data-theme="dark"] {
  color-scheme: dark;
  --surface-page: #000000;
  --surface-sidebar: #11100f;
  --surface-card: #171615;
  --surface-elevated: #1e1c1b;
  --surface-input: #24211f;
  --text-primary: #F5F5DC;
  --text-secondary: #c5c0b6;
  --text-muted: #9C9A9A;
  --text-on-accent: #F5F5DC;
  --accent-primary: #A35E47;
  --accent-hover: #b86a51;
  --accent-soft: color-mix(in srgb, #A35E47 16%, transparent);
  --border-default: rgba(245, 245, 220, .10);
  --border-strong: rgba(245, 245, 220, .18);
  --status-success: #6f9d7f;
  --status-warning: #c4a16f;
  --status-danger: #c27468;
}

:root[data-theme="light"] {
  color-scheme: light;
  --surface-page: #F5F5DC;
  --surface-sidebar: #eadfca;
  --surface-card: #fbf5e8;
  --surface-elevated: #fffaf0;
  --surface-input: #efe3cf;
  --text-primary: #6D3B07;
  --text-secondary: #6F4E37;
  --text-muted: #876d59;
  --text-on-accent: #fff8e8;
  --accent-primary: #D47E30;
  --accent-hover: #bd6c26;
  --accent-soft: color-mix(in srgb, #D47E30 14%, transparent);
  --border-default: rgba(111, 78, 55, .18);
  --border-strong: rgba(111, 78, 55, .30);
  --status-success: #557962;
  --status-warning: #9a7339;
  --status-danger: #9a554b;
}
```

Also define spacing, radii, shadow, typography and timing tokens in the same file. Keep normal motion at roughly 160/240/320 ms and use `cubic-bezier(.22, 1, .36, 1)`.

- [ ] **Step 4: Add base, component, and motion starter layers**

`base.css` must set theme-aware body/typography/focus without page-specific layout. `components.css` initially defines buttons/inputs/cards/skeleton primitives using only semantic tokens. `motion.css` defines `.ui-enter`, `.ui-exit`, `.ui-stagger-item`, dropdown/modal/toast transitions, and reduced-motion overrides.

Skeleton base:

```css
.ui-skeleton {
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, var(--surface-elevated) 78%, var(--border-default));
}
.ui-skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--text-primary) 7%, transparent), transparent);
  animation: ui-skeleton-shimmer 1.4s linear infinite;
}
```

- [ ] **Step 5: Load UI v2 after transitional legacy CSS**

Add, after all current CSS links in `app/index.html`:

```html
<link rel="stylesheet" href="./css/ui-v2/tokens.css?v=1">
<link rel="stylesheet" href="./css/ui-v2/base.css?v=1">
<link rel="stylesheet" href="./css/ui-v2/components.css?v=1">
<link rel="stylesheet" href="./css/ui-v2/motion.css?v=1">
```

Do not remove any legacy stylesheet in this task.

- [ ] **Step 6: Update theme-color without changing the public theme API**

Keep `window.DassaevyTheme = {getTheme, setTheme, toggleTheme}` intact. Change only the meta theme colors in `applyTheme()`:

```js
if (meta) meta.content = normalized === 'dark' ? '#000000' : '#F5F5DC';
```

- [ ] **Step 7: Run foundation + full regression suite**

Run:

```bash
node --test app/js/tests/ui-v2-foundation.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: all PASS.

- [ ] **Step 8: Commit foundation**

```bash
git add app/css/ui-v2 app/index.html app/js/features/theme-controller.js app/js/tests/ui-v2-foundation.test.mjs
git commit -m "feat: add UI v2 visual foundation"
```

---

### Task 2: Migrate authentication and the application shell

**Files:**
- Create: `app/css/ui-v2/layout.css`
- Create: `app/css/ui-v2/pages/auth.css`
- Create: `app/js/tests/ui-v2-auth-shell.test.mjs`
- Modify: `app/index.html`
- Modify: `app/js/features/tab-bar.js` only if required to preserve indicator geometry; no view ownership changes.

**Interfaces:**
- Consumes: `#authView`, `#authForm`, `#authEmail`, `#authPassword`, `#authSubmit`, `#appView`, `.app-shell`, `.app-sidebar`, `.view-tabs`, `#themeToggle`, existing tab indicator behavior.
- Produces: complete auth/shell visual ownership under UI v2 while preserving all auth handlers and navigation IDs.

- [ ] **Step 1: Write failing auth/shell contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const index = read('../../index.html');
const layout = read('../../css/ui-v2/layout.css');
const auth = read('../../css/ui-v2/pages/auth.css');

test('auth and shell load dedicated UI v2 page/layout styles', () => {
  assert.ok(index.includes('./css/ui-v2/layout.css'));
  assert.ok(index.includes('./css/ui-v2/pages/auth.css'));
});

test('desktop sidebar and mobile bottom nav are defined without moving labels on hover', () => {
  assert.match(layout, /\.app-sidebar[\s\S]*height:\s*100dvh/s);
  assert.match(layout, /@media[^\{]*max-width:\s*768px[\s\S]*\.app-sidebar[^\{]*\.app-sidebar-nav/s);
  assert.doesNotMatch(layout, /view-tab:hover[^\{]*\{[^}]*translateY/s);
});

test('auth inputs use semantic surfaces instead of white literals', () => {
  assert.match(auth, /\.auth-view[\s\S]*var\(--surface-page\)/s);
  assert.match(auth, /\.auth-view[\s\S]*\.field\s+input[\s\S]*var\(--surface-input\)/s);
  assert.doesNotMatch(auth, /background:\s*(?:white|#fff(?:fff)?)/i);
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test app/js/tests/ui-v2-auth-shell.test.mjs
```

Expected: FAIL because layout/auth UI v2 files are missing.

- [ ] **Step 3: Implement the shell from scratch**

`layout.css` owns `.app-shell`, `.app-sidebar`, `.app-main`, `.app-topbar`, `.app-sidebar-footer`, `.account-bar`, `.view-tabs`, `.view-tab`, and responsive bottom navigation. Use `--surface-*` tokens only. The active item uses `--accent-primary` + `--text-on-accent`. Hover may change background/border/color, but icon/label transforms remain `none` on desktop.

- [ ] **Step 4: Implement auth from scratch**

`pages/auth.css` owns the auth composition. Use a neutral surface, no large gradients, no white glass shine. Keep current HTML IDs untouched. Use modern sans-serif typography and semantic focus styles.

- [ ] **Step 5: Load the new layout/auth files last**

Add after `motion.css`:

```html
<link rel="stylesheet" href="./css/ui-v2/layout.css?v=1">
<link rel="stylesheet" href="./css/ui-v2/pages/auth.css?v=1">
```

- [ ] **Step 6: Run targeted and full tests**

```bash
node --test app/js/tests/ui-v2-auth-shell.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: PASS.

- [ ] **Step 7: Manual checkpoint**

Ask the user to verify in browser:
- login dark,
- login light,
- typing visibility,
- sidebar active state,
- footer controls,
- hover stability,
- mobile bottom bar.

Do not start Task 3 until the user approves this checkpoint.

- [ ] **Step 8: Commit**

```bash
git add app/css/ui-v2/layout.css app/css/ui-v2/pages/auth.css app/index.html app/js/tests/ui-v2-auth-shell.test.mjs app/js/features/tab-bar.js
git commit -m "feat: migrate auth and shell to UI v2"
```

---

### Task 3: Migrate shared controls, custom selects, and async states

**Files:**
- Modify: `app/css/ui-v2/components.css`
- Modify: `app/css/ui-v2/motion.css`
- Modify: `app/js/features/custom-select.js`
- Modify: `app/js/features/ui-state.js`
- Create: `app/js/tests/ui-v2-components.test.mjs`

**Interfaces:**
- Consumes: native selects `select.class-filter, #coupleClass`; existing custom-select DOM classes; `window.DassaevyUI.setButtonState(button, state, options)` and `setProgress(element, value)`.
- Produces: theme-aware custom select behavior with no stylesheet injection; reusable `window.DassaevyUI.setLoadingState(container, loading)` helper for skeleton visibility without replacing core `setLoading()`.

- [ ] **Step 1: Write failing component contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const select = read('../features/custom-select.js');
const components = read('../../css/ui-v2/components.css');
const state = read('../features/ui-state.js');

test('custom select no longer injects legacy CSS', () => {
  assert.doesNotMatch(select, /custom-select-fix\.css/);
  assert.doesNotMatch(select, /createElement\(['"]link['"]\)/);
});

test('custom select surfaces are semantic and dark-mode safe', () => {
  assert.match(components, /\.custom-select-trigger[\s\S]*var\(--surface-input\)/s);
  assert.match(components, /\.custom-select-menu[\s\S]*var\(--surface-elevated\)/s);
  assert.match(components, /\.custom-select-option\.is-selected[\s\S]*var\(--accent-soft\)/s);
});

test('UI state helper exposes reusable loading state without replacing core loading API', () => {
  assert.match(state, /function setLoadingState\(/);
  assert.match(state, /window\.DassaevyUI\s*=\s*\{[^}]*setButtonState[^}]*setProgress[^}]*setLoadingState/s);
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test app/js/tests/ui-v2-components.test.mjs
```

- [ ] **Step 3: Remove dynamic legacy stylesheet injection**

Delete only the startup block that creates `<link href="./css/custom-select-fix.css?v=1">`. Keep the registry, keyboard handling, mutation observation, selection dispatch, and ARIA behavior unchanged.

- [ ] **Step 4: Implement shared component styles**

Expand `components.css` to own `.btn`, `.btn-primary`, `.btn-light`, `.btn-account`, `.field input`, `.field select`, `.custom-select*`, `.panel`, `.metric-card`, `.table-wrap`, `table`, `th`, `td`, `.pill`, `.month`, `.icon-btn`, `.badge`, `.ui-progress`, dialogs, toast, empty/error states, switches and skeleton variants. Use semantic tokens only for theme-sensitive surfaces.

- [ ] **Step 5: Add reusable loading-state helper**

In `ui-state.js`:

```js
function setLoadingState(container, loading) {
  if (!container) return;
  container.classList.toggle('is-loading', Boolean(loading));
  container.setAttribute('aria-busy', String(Boolean(loading)));
}
```

Expose it while retaining existing APIs:

```js
window.DassaevyUI = {setButtonState, setProgress, setLoadingState};
```

- [ ] **Step 6: Run targeted + full tests**

```bash
node --test app/js/tests/ui-v2-components.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

- [ ] **Step 7: Manual checkpoint**

Verify one class filter in dark/light, open dropdown, keyboard Escape, selected option readability, primary/secondary button states, and one dialog field.

- [ ] **Step 8: Commit**

```bash
git add app/css/ui-v2/components.css app/css/ui-v2/motion.css app/js/features/custom-select.js app/js/features/ui-state.js app/js/tests/ui-v2-components.test.mjs
git commit -m "feat: migrate shared controls to UI v2"
```

---

### Task 4: Migrate Visão Geral and remove dashboard CSS injection

**Files:**
- Create: `app/css/ui-v2/pages/dashboard.css`
- Modify: `app/js/features/dashboard.js`
- Modify: `app/index.html`
- Create: `app/js/tests/ui-v2-dashboard.test.mjs`

**Interfaces:**
- Consumes: existing dashboard IDs (`dashboardView`, `dashboardGreeting`, `dashboardStudents`, `dashboardClasses`, `dashboardReceived`, `dashboardPending`, financial/pending/class summary IDs), existing `setView` wrapper and `renderDashboard()` data logic.
- Produces: dashboard page with neutral metric cards, one accent-filled primary metric, theme-aware monochrome icons, geometry-matched skeleton markup/classes, no `document.createElement('style')`.

- [ ] **Step 1: Write failing dashboard contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../features/dashboard.js');
const css = read('../../css/ui-v2/pages/dashboard.css');

test('dashboard feature no longer injects presentation CSS', () => {
  assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
  assert.doesNotMatch(js, /style\.textContent\s*=/);
});

test('dashboard uses one accent metric and neutral remaining surfaces', () => {
  assert.match(css, /\.dashboard-stat-featured[\s\S]*var\(--accent-primary\)/s);
  assert.match(css, /\.dashboard-stat-card[\s\S]*var\(--surface-card\)/s);
});

test('dashboard defines geometry-matched skeleton states', () => {
  assert.match(css, /\.dashboard-skeleton/);
  assert.match(js, /dashboard-skeleton/);
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test app/js/tests/ui-v2-dashboard.test.mjs
```

- [ ] **Step 3: Move dashboard CSS into `pages/dashboard.css`**

Port only structure that still matches the approved redesign. Do not copy legacy white borders, Georgia font, gradients, or hover shadows. Use `.dashboard-stat-card`, `.dashboard-section`, `.dashboard-class-card`, `.dashboard-progress` with semantic tokens and 1–2 px restrained hover elevation.

- [ ] **Step 4: Remove the injected style block from `dashboard.js`**

Delete `const style = document.createElement('style')`, `style.textContent = ...`, and `document.head.appendChild(style)`. Leave markup generation, setView integration, metric calculations, and event handlers intact.

- [ ] **Step 5: Add dashboard skeleton markup/state**

Before data is available, render a predictable skeleton container inside the dashboard page. Use fixed child classes such as `.dashboard-skeleton-card`, `.dashboard-skeleton-panel`, and hide it after `renderDashboard()` completes. Do not delay real content just to show animation.

- [ ] **Step 6: Load dashboard page CSS**

Add:

```html
<link rel="stylesheet" href="./css/ui-v2/pages/dashboard.css?v=1">
```

- [ ] **Step 7: Run tests**

```bash
node --test app/js/tests/ui-v2-dashboard.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

- [ ] **Step 8: Manual checkpoint**

Review dashboard dark/light, cards, icons, progress animation, class summary, hover restraint, and loading skeleton.

- [ ] **Step 9: Commit**

```bash
git add app/css/ui-v2/pages/dashboard.css app/js/features/dashboard.js app/index.html app/js/tests/ui-v2-dashboard.test.mjs
git commit -m "feat: migrate dashboard to UI v2"
```

---

### Task 5: Migrate Alunos with desktop table and mobile record cards

**Files:**
- Create: `app/css/ui-v2/pages/students.css`
- Modify: `app/index.html`
- Modify: `app/js/core/script.js`
- Create: `app/js/tests/ui-v2-students.test.mjs`

**Interfaces:**
- Consumes: `#studentsView`, `#search`, `#classFilter`, `#exportClassBtn`, `#newClassBtn`, `#newBtn`, `#list`, `editCouple(id)`, `removeCouple(id)`, `toggleEntry(id, person)`, `toggleMonth(id, person, index)`, `render()`.
- Produces: desktop table plus `#studentCards` mobile rendering from the same `couples` data; all existing IDs/handlers remain available.

- [ ] **Step 1: Write failing student-page contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const index = read('../../index.html');
const core = read('../core/script.js');
const css = read('../../css/ui-v2/pages/students.css');

test('students keeps the existing desktop list and adds a mobile card target', () => {
  assert.match(index, /id=["']list["']/);
  assert.match(index, /id=["']studentCards["']/);
});

test('render updates both desktop and mobile student presentations', () => {
  assert.match(core, /\$\(['"]studentCards['"]\)\.innerHTML/);
  assert.match(core, /onclick=["']editCouple\('/);
  assert.match(core, /onclick=["']removeCouple\('/);
});

test('mobile students layout hides table and shows record cards', () => {
  assert.match(css, /@media[^\{]*max-width:\s*768px[\s\S]*\.students-table-wrap[\s\S]*display:\s*none/s);
  assert.match(css, /@media[^\{]*max-width:\s*768px[\s\S]*\.student-cards[\s\S]*display:\s*grid/s);
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test app/js/tests/ui-v2-students.test.mjs
```

- [ ] **Step 3: Add stable mobile container without removing desktop contracts**

Wrap the existing student table in `.students-table-wrap` and add after it:

```html
<div id="studentCards" class="student-cards" aria-label="Alunos cadastrados"></div>
```

Do not rename `#list` or any toolbar ID.

- [ ] **Step 4: Factor render markup minimally**

Inside `render()`, keep the current filtering/calculation behavior. Add a helper `studentCardMarkup(c)` that reuses the same payment state and existing global actions. Example action wiring:

```js
<button class="icon-btn" onclick="editCouple('${c.id}')" aria-label="Editar cadastro">✎</button>
<button class="icon-btn" onclick="removeCouple('${c.id}')" aria-label="Excluir cadastro">⌫</button>
```

Render empty state consistently into both `#list` and `#studentCards`.

- [ ] **Step 5: Implement students page CSS**

Own stats, toolbar arrangement, search/filter/action spacing, table row hierarchy, payment badges, progress, and mobile cards. Use shared components rather than redefining button/input colors.

- [ ] **Step 6: Add row/card skeletons to `loadData()`**

Replace the current text-only `Carregando seus dados...` row with geometry-matched table skeleton rows and matching mobile card skeletons. Keep data fetching exactly the same.

- [ ] **Step 7: Load students CSS and run tests**

```bash
node --test app/js/tests/ui-v2-students.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

- [ ] **Step 8: Manual checkpoint**

Verify search, class filter, edit, delete, registration payment, three monthly toggles, responsive card layout, skeleton state, dark/light contrast.

- [ ] **Step 9: Commit**

```bash
git add app/css/ui-v2/pages/students.css app/index.html app/js/core/script.js app/js/tests/ui-v2-students.test.mjs
git commit -m "feat: migrate students to UI v2"
```

---

### Task 6: Add the dedicated Turmas destination using existing class operations

**Files:**
- Create: `app/css/ui-v2/pages/classes.css`
- Create: `app/js/features/classes-view.js`
- Modify: `app/index.html`
- Modify: `app/js/core/script.js`
- Create: `app/js/tests/ui-v2-classes.test.mjs`

**Interfaces:**
- Consumes: global lexical `classes`, `couples`, `escapeHtml`, existing `#classModal`, `#newClassBtn`, `removeClass(id)`, `setView(view)`, `renderClassList()`.
- Produces: `#classesTab`, `#classesView`, `#classesPageList`, `#classesPageNewBtn`, `window.renderClassesPage()`; core `setView('classes')` support without changing class persistence semantics.

- [ ] **Step 1: Write failing classes contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const index = read('../../index.html');
const core = read('../core/script.js');
const feature = read('../features/classes-view.js');

test('classes is a dedicated stable navigation destination', () => {
  assert.match(index, /id=["']classesTab["']/);
  assert.match(index, /id=["']classesView["']/);
  assert.match(index, /id=["']classesPageList["']/);
});

test('core view state recognizes classes without changing class persistence', () => {
  assert.match(core, /view\s*===\s*['"]classes['"]/);
  assert.match(core, /\$\(['"]classesView['"]\)\.hidden/);
  assert.match(core, /window\.renderClassesPage\?\.\(\)/);
});

test('classes page reuses existing new/delete operations', () => {
  assert.match(feature, /newClassBtn/);
  assert.match(feature, /removeClass\(/);
  assert.doesNotMatch(feature, /\.from\(['"]classes['"]\)/);
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test app/js/tests/ui-v2-classes.test.mjs
```

- [ ] **Step 3: Add static Classes tab/view markup**

Add `#classesTab` to the existing `.view-tabs` and `#classesView` to `<main class="app">`. The view contains a page header, `#classesPageNewBtn`, and `#classesPageList`.

- [ ] **Step 4: Implement presentational classes renderer**

Create `classes-view.js` that renders current `classes` with student counts derived from `couples`. `#classesPageNewBtn` triggers the already-wired hidden/legacy new-class control instead of duplicating persistence:

```js
document.getElementById('classesPageNewBtn')?.addEventListener('click', () => {
  document.getElementById('newClassBtn')?.click();
});
```

Delete actions call existing `removeClass(id)` and then `window.renderClassesPage()` after the existing render cycle.

- [ ] **Step 5: Extend core `setView()` minimally**

Toggle `#classesView` and `#classesTab` alongside students/financial. When entering classes:

```js
if (view === 'classes') window.renderClassesPage?.();
```

Do not change Supabase calls or class mutation functions.

- [ ] **Step 6: Implement classes page CSS + skeleton**

Use responsive class cards with name, place, schedule, student count and existing actions. Add `.classes-skeleton-card` geometry for initial aggregate rendering.

- [ ] **Step 7: Load classes CSS/script and run full tests**

Ensure `classes-view.js` loads after `script.js` and before tab-bar decoration.

```bash
node --test app/js/tests/ui-v2-classes.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

- [ ] **Step 8: Manual checkpoint**

Verify Classes tab, create class, delete disposable class, counts, navigation indicator, mobile layout, and dark/light themes.

- [ ] **Step 9: Commit**

```bash
git add app/css/ui-v2/pages/classes.css app/js/features/classes-view.js app/index.html app/js/core/script.js app/js/tests/ui-v2-classes.test.mjs
git commit -m "feat: add UI v2 classes destination"
```

---

### Task 7: Migrate Financeiro to UI v2

**Files:**
- Create: `app/css/ui-v2/pages/financial.css`
- Modify: `app/index.html`
- Modify: `app/js/core/script.js` only for loading-state markup if needed.
- Create: `app/js/tests/ui-v2-financial.test.mjs`

**Interfaces:**
- Consumes: `#financialView`, `#financialClassFilter`, `#financialTotal`, `#financialEntries`, `#financialMonthly`, `#financialPayments`, `#financialList`, `renderFinancial()` and `financialValues(c)`.
- Produces: analytical finance layout with deep charcoal dark surfaces, no large mid-gray slabs, theme-aware filter and skeleton rows.

- [ ] **Step 1: Write failing finance contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../../css/ui-v2/pages/financial.css', import.meta.url), 'utf8');

test('finance uses semantic card surfaces and accent only for the featured metric', () => {
  assert.match(css, /\.financial-stats[\s\S]*var\(--surface-card\)/s);
  assert.match(css, /\.financial-stats[\s\S]*\.featured[\s\S]*var\(--accent-primary\)/s);
});

test('finance does not introduce hardcoded medium-gray slabs', () => {
  assert.doesNotMatch(css, /background:\s*#464646/i);
  assert.doesNotMatch(css, /background:\s*(?:white|#fff(?:fff)?)/i);
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test app/js/tests/ui-v2-financial.test.mjs
```

- [ ] **Step 3: Implement financial page CSS**

Style page header, filter placement, four metrics and financial table. Keep amount alignment tabular (`font-variant-numeric: tabular-nums`) and use shared component surfaces.

- [ ] **Step 4: Add finance skeleton state**

When `renderFinancial()` is invoked before data is ready, show metric/table skeletons; when data exists, render the current values. Do not change calculations.

- [ ] **Step 5: Load CSS and run all tests**

```bash
node --test app/js/tests/ui-v2-financial.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

- [ ] **Step 6: Manual checkpoint**

Verify totals, class filtering, empty state, table readability, dark mode charcoal hierarchy, and light Spiced Mocha.

- [ ] **Step 7: Commit**

```bash
git add app/css/ui-v2/pages/financial.css app/index.html app/js/core/script.js app/js/tests/ui-v2-financial.test.mjs
git commit -m "feat: migrate finance to UI v2"
```

---

### Task 8: Migrate Relatórios, chart theming, and chart skeleton loading

**Files:**
- Create: `app/css/ui-v2/pages/reports.css`
- Modify: `app/js/features/reports.js`
- Modify: `app/index.html`
- Create: `app/js/tests/ui-v2-reports.test.mjs`

**Interfaces:**
- Consumes: current reports IDs, `loadChartJs()`, `renderCharts(items, metrics, rows)`, current lazy Chart.js URL.
- Produces: no injected CSS; chart colors derived from semantic tokens; `#reportsChartSkeleton`/equivalent loading state visible until Chart.js + data render completes.

- [ ] **Step 1: Write failing report contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../features/reports.js');
const css = read('../../css/ui-v2/pages/reports.css');

test('reports no longer injects page CSS', () => {
  assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
  assert.doesNotMatch(js, /style\.textContent\s*=/);
});

test('charts derive colors from semantic UI v2 tokens', () => {
  for (const token of ['--accent-primary', '--status-success', '--text-muted', '--border-default']) {
    assert.ok(js.includes(token), `missing chart token ${token}`);
  }
});

test('reports exposes chart skeleton state around lazy Chart.js loading', () => {
  assert.match(js, /reports-chart-skeleton/);
  assert.match(css, /\.reports-chart-skeleton/);
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test app/js/tests/ui-v2-reports.test.mjs
```

- [ ] **Step 3: Move reports CSS into page stylesheet**

Use UI v2 metric cards and chart containers. Remove serif fonts, white cards, and legacy note backgrounds.

- [ ] **Step 4: Remove injected style block from `reports.js`**

Keep reports markup, filters, calculations, lazy Chart.js loading, and chart lifecycle unchanged.

- [ ] **Step 5: Switch Chart.js colors to semantic variables**

Read:

```js
const css = getComputedStyle(document.documentElement);
const accent = css.getPropertyValue('--accent-primary').trim();
const success = css.getPropertyValue('--status-success').trim();
const muted = css.getPropertyValue('--text-muted').trim();
const grid = css.getPropertyValue('--border-default').trim();
```

Use these in chart datasets/scales. Remove old wine/terracotta fallback colors.

- [ ] **Step 6: Add chart skeleton around lazy loading**

Before `await loadChartJs()`, add a skeleton class/element. Remove it in `finally`, including error cases. Keep the existing error notice if CDN loading fails.

- [ ] **Step 7: Run tests**

```bash
node --test app/js/tests/ui-v2-reports.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

- [ ] **Step 8: Manual checkpoint**

Verify filter, KPI cards, line/doughnut/class charts, loading skeleton, theme switch while revisiting reports, and responsive chart sizing.

- [ ] **Step 9: Commit**

```bash
git add app/css/ui-v2/pages/reports.css app/js/features/reports.js app/index.html app/js/tests/ui-v2-reports.test.mjs
git commit -m "feat: migrate reports to UI v2"
```

---

### Task 9: Migrate Central de Automações and its async states

**Files:**
- Create: `app/css/ui-v2/pages/automation.css`
- Modify: `app/js/features/automation-center.js`
- Modify: `app/index.html`
- Create: `app/js/tests/ui-v2-automation.test.mjs`

**Interfaces:**
- Consumes: existing automation IDs/settings/status messages, `ensureSettings()`, `updateSetting(input)`, `loadMessages()`, `renderSummary()`, `renderActivity()`, `renderIntegrationStatus()`.
- Produces: consistent metric cards, shared switches, readiness states, activity rows, integration status, skeleton/loading states, no injected CSS.

- [ ] **Step 1: Write failing automation contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../features/automation-center.js');
const css = read('../../css/ui-v2/pages/automation.css');

test('automation no longer injects page CSS', () => {
  assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
  assert.doesNotMatch(js, /style\.textContent\s*=/);
});

test('automation page avoids legacy medium gray and white surfaces', () => {
  assert.doesNotMatch(css, /background:\s*#464646/i);
  assert.doesNotMatch(css, /background:\s*(?:white|#fff(?:fff)?)/i);
  assert.match(css, /var\(--surface-card\)/);
});

test('automation exposes loading skeletons for settings and activity', () => {
  assert.match(js, /automation-skeleton/);
  assert.match(css, /\.automation-skeleton/);
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test app/js/tests/ui-v2-automation.test.mjs
```

- [ ] **Step 3: Move all automation presentation to CSS**

Remove the JS style element. Keep all existing settings/message logic unchanged. Use shared switch visuals by styling existing checkbox markup rather than changing stored settings.

- [ ] **Step 4: Add loading states**

Before `ensureSettings()`/`loadMessages()`, show geometry-matched skeletons for metrics/settings/readiness/activity. On completion, remove skeletons and render real state. On errors, show existing semantic error copy and remove skeletons.

- [ ] **Step 5: Keep status colors semantic**

Connected/delivered/read use `--status-success`, waiting uses `--status-warning`, failed uses `--status-danger`; status meaning must still include text/icon, not color alone.

- [ ] **Step 6: Run full tests**

```bash
node --test app/js/tests/ui-v2-automation.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

- [ ] **Step 7: Manual checkpoint**

Verify integration status, every switch, save busy state, readiness checklist, activity history, retry button, dark/light contrast, and no large gray slabs.

- [ ] **Step 8: Commit**

```bash
git add app/css/ui-v2/pages/automation.css app/js/features/automation-center.js app/index.html app/js/tests/ui-v2-automation.test.mjs
git commit -m "feat: migrate automation to UI v2"
```

---

### Task 10: Migrate profile, dialogs, toasts, and supporting interaction surfaces

**Files:**
- Create: `app/css/ui-v2/pages/profile.css`
- Modify: `app/css/ui-v2/components.css`
- Modify: `app/css/ui-v2/motion.css`
- Modify: `app/js/features/academy-profile.js` only where needed for skeleton/busy classes.
- Modify: `app/index.html`
- Create: `app/js/tests/ui-v2-profile-dialogs.test.mjs`

**Interfaces:**
- Consumes: `#academyProfileBtn`, profile modal/fields from `academy-profile.js`, `#modal`, `#classModal`, `openDialog()`, `closeDialog()`, `#toast`, core `setLoading()` and UI v2 `DassaevyUI` helpers.
- Produces: one shared modal language and profile-specific arrangement, theme-aware fields, consistent busy/skeleton states, smooth entry and faster exit.

- [ ] **Step 1: Write failing profile/dialog contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const components = fs.readFileSync(new URL('../../css/ui-v2/components.css', import.meta.url), 'utf8');
const motion = fs.readFileSync(new URL('../../css/ui-v2/motion.css', import.meta.url), 'utf8');
const profile = fs.readFileSync(new URL('../features/academy-profile.js', import.meta.url), 'utf8');

test('shared dialog visual language is theme aware', () => {
  assert.match(components, /dialog[\s\S]*var\(--surface-elevated\)/s);
  assert.match(components, /dialog::backdrop/);
});

test('dialog motion includes quiet entry exit and reduced motion', () => {
  assert.match(motion, /dialog[^\{]*\.is-closing|\.is-closing[^\{]*dialog/s);
  assert.match(motion, /prefers-reduced-motion:\s*reduce/);
});

test('profile exposes a real loading state', () => {
  assert.match(profile, /is-loading|ui-skeleton|setLoadingState/);
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test app/js/tests/ui-v2-profile-dialogs.test.mjs
```

- [ ] **Step 3: Implement dialogs/toasts in shared components**

Style native `<dialog>` and backdrop, modal headers/actions, form grids, value blocks, checkbox rows, toasts and empty/error states. Use one component system for student modal and class modal.

- [ ] **Step 4: Implement motion**

Open: opacity + scale around `.985` + small `translateY(6px)` over standard duration. Close: shorter fade/scale. Preserve existing `closeDialog()` `transitionend` contract.

- [ ] **Step 5: Migrate profile presentation**

Move profile surface styling into `pages/profile.css`; add skeleton/busy classes around existing asynchronous load/save without changing academy lookup/update behavior.

- [ ] **Step 6: Run full tests**

```bash
node --test app/js/tests/ui-v2-profile-dialogs.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

- [ ] **Step 7: Manual checkpoint**

Verify profile open/load/save, student modal, class modal, Escape close, cancel buttons, toasts, keyboard focus, dark/light themes.

- [ ] **Step 8: Commit**

```bash
git add app/css/ui-v2/components.css app/css/ui-v2/motion.css app/css/ui-v2/pages/profile.css app/js/features/academy-profile.js app/index.html app/js/tests/ui-v2-profile-dialogs.test.mjs
git commit -m "feat: migrate dialogs and profile to UI v2"
```

---

### Task 11: Remove the legacy visual layer and enforce final UI v2 independence

**Files:**
- Modify: `app/index.html`
- Modify: `app/js/features/custom-select.js` if any transitional references remain.
- Delete after verification: `app/css/style.css`
- Delete after verification: `app/css/style-base.css`
- Delete after verification: `app/css/custom-select-fix.css`
- Delete after verification: `app/css/app-shell.css`
- Delete after verification: `app/css/design-tokens.css`
- Delete after verification: `app/css/ui-states.css`
- Delete after verification: `app/css/auth-surface.css`
- Create: `app/js/tests/ui-v2-legacy-removal.test.mjs`

**Interfaces:**
- Consumes: all previously migrated UI v2 files and existing regression suite.
- Produces: no loaded legacy visual stylesheet, no page-style injection from Dashboard/Reports/Automation, all functional scripts still present.

- [ ] **Step 1: Write failing final independence contract**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const index = read('../../index.html');

for (const legacy of [
  './css/style.css', './css/style-base.css', './css/custom-select-fix.css',
  './css/app-shell.css', './css/design-tokens.css', './css/ui-states.css', './css/auth-surface.css'
]) {
  test(`final UI does not load ${legacy}`, () => assert.ok(!index.includes(legacy)));
}

test('feature modules do not inject presentation styles', () => {
  for (const path of ['../features/dashboard.js', '../features/reports.js', '../features/automation-center.js']) {
    const js = read(path);
    assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
    assert.doesNotMatch(js, /style\.textContent\s*=/);
  }
});

test('critical functional modules remain loaded', () => {
  for (const src of [
    './js/core/script.js', './js/core/academy-context.js', './js/core/academy-data-context.js',
    './js/features/payment-automation.js', './js/features/dashboard.js', './js/features/reports.js',
    './js/features/automation-center.js', './js/features/academy-profile.js'
  ]) assert.ok(index.includes(src), `missing ${src}`);
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test app/js/tests/ui-v2-legacy-removal.test.mjs
```

Expected: FAIL while legacy CSS links still exist.

- [ ] **Step 3: Audit for remaining legacy selectors/references**

Run:

```bash
grep -R "style-base.css\|custom-select-fix.css\|auth-surface.css\|design-tokens.css\|app-shell.css\|ui-states.css" app --exclude-dir=tests
```

Expected before cleanup: references only from `index.html` or explicitly known transitional locations. Resolve any unexpected dependency before deleting files.

- [ ] **Step 4: Remove legacy links and obsolete files**

Delete the legacy `<link>` elements from `index.html`, then delete the obsolete CSS files listed above. Do not delete any UI v2 stylesheet.

- [ ] **Step 5: Run the full automated gate**

Run:

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: 0 failures.

- [ ] **Step 6: Inspect final diff for forbidden scope changes**

Run:

```bash
git diff --name-only main...HEAD
```

Verify there are no unintended changes under:
- `supabase/`
- `app/database/`
- payment/receipt SQL or RLS files.

If unrelated files appear, stop and reconcile before claiming completion.

- [ ] **Step 7: Execute the final manual browser gate with disposable data**

Verify, in order:
1. login,
2. create disposable student/couple,
3. edit it,
4. create/assign a disposable class,
5. mark/unmark permitted payments,
6. receipt flow,
7. finance totals,
8. reports,
9. automation,
10. delete disposable student/couple and class,
11. switch dark/light on every major screen,
12. resize to mobile and verify bottom navigation + mobile student cards.

Do not merge if any manual step fails.

- [ ] **Step 8: Commit legacy removal**

```bash
git add -A app/css app/index.html app/js app/js/tests/ui-v2-legacy-removal.test.mjs
git commit -m "refactor: remove legacy visual layer"
```

- [ ] **Step 9: Fresh verification immediately before PR/merge**

Run again:

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Record exact pass/fail counts and the final commit SHA in the PR description. Do not rely on an earlier run.

---

## Self-Review Checklist

- Spec coverage: foundation, both palettes, semantic tokens, shell, auth, Dashboard, Alunos, dedicated Turmas, Financeiro, Relatórios, Automação, Profile/dialogs, mobile behavior, skeletons, lazy Chart.js, Motion Principles, reduced motion, legacy removal, functional safety, CI and manual validation are all assigned to explicit tasks.
- No placeholder steps: every task names concrete files, contracts, commands, expected results, and implementation boundaries.
- Interface consistency: the plan preserves `window.DassaevyTheme`, `window.DassaevyUI`, existing functional IDs, current core CRUD/payment methods, and introduces only `#studentCards`, the dedicated Classes IDs, and `window.renderClassesPage()` as new presentation interfaces.
- Scope safety: no schema/RLS/Supabase migration work is included.
- Execution order: every page is manually reviewed before the next page, and legacy CSS is removed only after all migrated pages are independent.
