# Dassaevy Labs UI v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the entire Dassaevy Labs visual layer as UI v2 using Urban Loft for dark mode and Spiced Mocha for light mode, while preserving existing business logic, DOM contracts, multi-academy isolation, payments, receipts, reports, and automation behavior.

**Architecture:** Existing JavaScript remains responsible for data and behavior, HTML keeps stable functional IDs, and all new presentation lives under `app/css/ui-v2/`. Migration is progressive: each screen becomes visually independent from legacy CSS before the legacy layer is removed at the end. Page JavaScript stops injecting CSS and instead toggles classes/states consumed by UI v2 styles.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Supabase JS v2, Chart.js 4.4.7, Node.js 22 `node:test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-10-ui-v2-full-redesign-design.md`

## Global Constraints

- Do not intentionally change business rules, Supabase data access, RLS, multi-academy isolation, payment calculations, receipt rules, WhatsApp automation rules, authentication flows, or database schema.
- Preserve existing DOM IDs used by functional code unless a separately justified regression test proves a required contract change.
- Dark theme = Urban Loft: `#000000`, `#464646`, `#A35E47`, `#9C9A9A`, with `#F5F5DC` as primary text.
- Light theme = Spiced Mocha: `#F5F5DC`, `#6F4E37`, `#D47E30`, `#6D3B07`.
- Shared components consume semantic tokens; migrated dark components must never rely on hardcoded white surfaces.
- Motion follows the approved Motion Principles: subtle, functional, no elastic/bouncy repeated UI, entry via small opacity/translate/blur, quieter exits, and complete `prefers-reduced-motion` support.
- Major async surfaces use geometry-matched skeletons. Buttons expose `idle -> loading -> success | error` where relevant.
- No migrated feature module may keep page-level CSS injection.
- No database migration belongs to this plan.
- Every task follows TDD: failing test first, confirm RED, implement minimally, confirm GREEN, then commit.
- After each page-level migration, run CI and pause for the user's browser/screenshot review before continuing.

---

## File Map

**Create**
- `app/css/ui-v2/tokens.css` — palettes, semantic color tokens, radii, spacing, type scale, shadows, motion timing.
- `app/css/ui-v2/base.css` — reset, typography, focus, body, hidden/accessibility primitives.
- `app/css/ui-v2/layout.css` — shell, sidebar, topbar, responsive navigation.
- `app/css/ui-v2/components.css` — buttons, fields, selects, cards, tables, badges, switches, progress, skeletons, dialogs, toast, empty/error states.
- `app/css/ui-v2/motion.css` — view, dropdown, modal, toast, stagger, reduced-motion rules.
- `app/css/ui-v2/pages/auth.css`
- `app/css/ui-v2/pages/dashboard.css`
- `app/css/ui-v2/pages/students.css`
- `app/css/ui-v2/pages/classes.css`
- `app/css/ui-v2/pages/financial.css`
- `app/css/ui-v2/pages/reports.css`
- `app/css/ui-v2/pages/automation.css`
- `app/css/ui-v2/pages/profile.css`
- `app/css/ui-v2/pages/onboarding.css`

**Modify**
- `app/index.html`
- `app/js/core/script.js`
- `app/js/features/theme-controller.js`
- `app/js/features/ui-state.js`
- `app/js/features/custom-select.js`
- `app/js/features/dashboard.js`
- `app/js/features/reports.js`
- `app/js/features/automation-center.js`
- `app/js/features/academy-profile.js`
- `app/js/core/academy-onboarding.js`

**Retire only in final task after proven independence**
- `app/css/style.css`
- `app/css/style-base.css`
- `app/css/custom-select-fix.css`
- `app/css/app-shell.css`
- `app/css/design-tokens.css`
- `app/css/ui-states.css`
- `app/css/auth-surface.css`
- `app/css/academy-profile.css`
- `app/css/academy-onboarding.css`

---

### Task 1: UI v2 foundation, semantic tokens, and theme contract

**Files:**
- Create: `app/css/ui-v2/tokens.css`
- Create: `app/css/ui-v2/base.css`
- Create: `app/css/ui-v2/components.css`
- Create: `app/css/ui-v2/motion.css`
- Create: `app/js/tests/ui-v2-foundation.test.mjs`
- Modify: `app/index.html`
- Modify: `app/js/features/theme-controller.js`

**Interfaces:**
- Consumes: `document.documentElement.dataset.theme`, localStorage key `dassaevy-theme`, `window.DassaevyTheme`.
- Produces: semantic theme tokens and reusable motion/skeleton primitives.

- [ ] **Step 1: Write the failing foundation test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../../index.html');
const tokens = read('../../css/ui-v2/tokens.css');
const motion = read('../../css/ui-v2/motion.css');

test('UI v2 exposes approved palettes and semantic tokens', () => {
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

test('UI v2 styles are loaded, and when legacy is present UI v2 loads after it', () => {
  const v2 = index.indexOf('./css/ui-v2/tokens.css');
  const legacy = index.indexOf('./css/style.css');
  assert.ok(v2 >= 0);
  assert.ok(legacy === -1 || v2 > legacy);
});

test('motion layer provides quiet entry and reduced-motion support', () => {
  assert.match(motion, /prefers-reduced-motion:\s*reduce/);
  assert.match(motion, /translateY/);
  assert.match(motion, /opacity/);
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test app/js/tests/ui-v2-foundation.test.mjs
```

Expected: FAIL because UI v2 files do not exist.

- [ ] **Step 3: Implement theme tokens**

Use these semantic foundations:

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
  --border-default: rgba(245,245,220,.10);
  --border-strong: rgba(245,245,220,.18);
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
  --border-default: rgba(111,78,55,.18);
  --border-strong: rgba(111,78,55,.30);
  --status-success: #557962;
  --status-warning: #9a7339;
  --status-danger: #9a554b;
}
```

Also define `--radius-sm`, `--radius-md`, `--radius-lg`, `--motion-fast: 160ms`, `--motion-normal: 240ms`, `--motion-slow: 320ms`, `--motion-ease: cubic-bezier(.22,1,.36,1)`.

- [ ] **Step 4: Add base/component/motion primitives**

`components.css` must include a reusable skeleton primitive:

```css
.ui-skeleton {
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, var(--surface-elevated) 82%, var(--border-default));
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

`motion.css` defines `.ui-enter`, `.ui-exit`, `.ui-stagger-item`, dropdown/modal/toast transitions and disables meaningful motion under `prefers-reduced-motion: reduce`.

- [ ] **Step 5: Load UI v2 after transitional legacy styles**

Append to the existing CSS links in `app/index.html`:

```html
<link rel="stylesheet" href="./css/ui-v2/tokens.css?v=1">
<link rel="stylesheet" href="./css/ui-v2/base.css?v=1">
<link rel="stylesheet" href="./css/ui-v2/components.css?v=1">
<link rel="stylesheet" href="./css/ui-v2/motion.css?v=1">
```

Do not remove legacy CSS yet.

- [ ] **Step 6: Update browser theme-color only**

Keep `window.DassaevyTheme = {getTheme, setTheme, toggleTheme}` unchanged. In `applyTheme()`:

```js
if (meta) meta.content = normalized === 'dark' ? '#000000' : '#F5F5DC';
```

- [ ] **Step 7: Verify**

```bash
node --test app/js/tests/ui-v2-foundation.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add app/css/ui-v2 app/index.html app/js/features/theme-controller.js app/js/tests/ui-v2-foundation.test.mjs
git commit -m "feat: add UI v2 visual foundation"
```

---

### Task 2: Rebuild Login and app shell

**Files:**
- Create: `app/css/ui-v2/layout.css`
- Create: `app/css/ui-v2/pages/auth.css`
- Create: `app/js/tests/ui-v2-auth-shell.test.mjs`
- Modify: `app/index.html`

**Interfaces:**
- Consumes: all current auth IDs, `.app-shell`, `.app-sidebar`, `.view-tabs`, `#themeToggle`, existing tab-bar JS.
- Produces: fully new auth/shell visuals while preserving auth and navigation behavior.

- [ ] **Step 1: Write failing contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const index = read('../../index.html');
const layout = read('../../css/ui-v2/layout.css');
const auth = read('../../css/ui-v2/pages/auth.css');

test('shell and auth have dedicated UI v2 styles', () => {
  assert.ok(index.includes('./css/ui-v2/layout.css'));
  assert.ok(index.includes('./css/ui-v2/pages/auth.css'));
});

test('desktop hover never repositions navigation labels or icons', () => {
  assert.doesNotMatch(layout, /view-tab:hover[^\{]*\{[^}]*translateY/s);
  assert.match(layout, /@media[^\{]*max-width:\s*768px[\s\S]*bottom:/s);
});

test('auth uses semantic surfaces and no hardcoded white background', () => {
  assert.match(auth, /var\(--surface-page\)/);
  assert.match(auth, /var\(--surface-input\)/);
  assert.doesNotMatch(auth, /background:\s*(?:white|#fff(?:fff)?)/i);
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --test app/js/tests/ui-v2-auth-shell.test.mjs
```

- [ ] **Step 3: Implement `layout.css`**

Own shell/sidebar/topbar/footer/tab bar entirely with semantic tokens. Desktop uses vertical sidebar; mobile ≤768px uses fixed bottom nav with safe-area inset. Selected item uses `--accent-primary` and `--text-on-accent`. Hover changes only color/background/border.

- [ ] **Step 4: Implement `pages/auth.css`**

Create centered premium auth surface, sans-serif type hierarchy, theme-aware fields, no gloss/large gradients. Preserve current markup IDs and flow.

- [ ] **Step 5: Load the new files**

```html
<link rel="stylesheet" href="./css/ui-v2/layout.css?v=1">
<link rel="stylesheet" href="./css/ui-v2/pages/auth.css?v=1">
```

- [ ] **Step 6: Verify full suite**

```bash
node --test app/js/tests/ui-v2-auth-shell.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

- [ ] **Step 7: Commit and publish branch state for manual review**

```bash
git add app/css/ui-v2/layout.css app/css/ui-v2/pages/auth.css app/index.html app/js/tests/ui-v2-auth-shell.test.mjs
git commit -m "feat: migrate auth and shell to UI v2"
```

- [ ] **Step 8: Manual checkpoint**

User verifies login dark/light, typing visibility, sidebar active state, footer controls, hover stability, and mobile bottom bar. Do not continue until approved.

---

### Task 3: Rebuild shared controls and async-state primitives

**Files:**
- Modify: `app/css/ui-v2/components.css`
- Modify: `app/css/ui-v2/motion.css`
- Modify: `app/js/features/custom-select.js`
- Modify: `app/js/features/ui-state.js`
- Create: `app/js/tests/ui-v2-components.test.mjs`

**Interfaces:**
- Consumes: native selects `select.class-filter, #coupleClass`, current custom-select behavior, `window.DassaevyUI.setButtonState`, `setProgress`.
- Produces: shared visual controls plus `window.DassaevyUI.setLoadingState(container, loading)`.

- [ ] **Step 1: Write failing contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const select = read('../features/custom-select.js');
const state = read('../features/ui-state.js');
const css = read('../../css/ui-v2/components.css');

test('custom select stops injecting legacy CSS', () => {
  assert.doesNotMatch(select, /custom-select-fix\.css/);
  assert.doesNotMatch(select, /createElement\(['"]link['"]\)/);
});

test('custom select is theme aware', () => {
  assert.match(css, /\.custom-select-trigger[\s\S]*var\(--surface-input\)/s);
  assert.match(css, /\.custom-select-menu[\s\S]*var\(--surface-elevated\)/s);
});

test('UI state exposes reusable loading state', () => {
  assert.match(state, /function setLoadingState\(/);
  assert.match(state, /setLoadingState/);
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --test app/js/tests/ui-v2-components.test.mjs
```

- [ ] **Step 3: Remove only the custom-select stylesheet injection block**

Keep registry, MutationObserver, ARIA, keyboard Escape, selected-option synchronization and `change` dispatch behavior untouched.

- [ ] **Step 4: Expand shared component CSS**

Own `.btn`, `.btn-primary`, `.btn-light`, `.btn-account`, `.field input`, `.field select`, `.custom-select*`, `.panel`, metric cards, tables, `.pill`, `.month`, `.icon-btn`, badges, switches, progress, skeleton variants, dialogs, toasts and empty/error states. Theme-sensitive styles use semantic tokens.

- [ ] **Step 5: Add loading helper**

```js
function setLoadingState(container, loading) {
  if (!container) return;
  container.classList.toggle('is-loading', Boolean(loading));
  container.setAttribute('aria-busy', String(Boolean(loading)));
}
```

Expose without removing current API:

```js
window.DassaevyUI = {setButtonState, setProgress, setLoadingState};
```

- [ ] **Step 6: Verify**

```bash
node --test app/js/tests/ui-v2-components.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

- [ ] **Step 7: Commit, then manual checkpoint**

```bash
git add app/css/ui-v2/components.css app/css/ui-v2/motion.css app/js/features/custom-select.js app/js/features/ui-state.js app/js/tests/ui-v2-components.test.mjs
git commit -m "feat: migrate shared controls to UI v2"
```

User verifies class dropdown readability/open/close in dark/light, buttons, one input, one dialog field.

---

### Task 4: Migrate Visão Geral and remove dashboard CSS injection

**Files:**
- Create: `app/css/ui-v2/pages/dashboard.css`
- Modify: `app/js/features/dashboard.js`
- Modify: `app/index.html`
- Create: `app/js/tests/ui-v2-dashboard.test.mjs`

**Interfaces:**
- Consumes: all existing dashboard IDs, calculations, `renderDashboard()`, current `setView` wrapper.
- Produces: neutral dashboard cards, one accent metric, semantic icons, geometry-matched skeletons, no injected CSS.

- [ ] **Step 1: Write failing contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../features/dashboard.js');
const css = read('../../css/ui-v2/pages/dashboard.css');

test('dashboard no longer injects CSS', () => {
  assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
  assert.doesNotMatch(js, /style\.textContent\s*=/);
});

test('dashboard uses neutral cards and one accent featured metric', () => {
  assert.match(css, /\.dashboard-stat-card[\s\S]*var\(--surface-card\)/s);
  assert.match(css, /\.dashboard-stat-featured[\s\S]*var\(--accent-primary\)/s);
});

test('dashboard includes skeleton contract', () => {
  assert.match(js, /dashboard-skeleton/);
  assert.match(css, /\.dashboard-skeleton/);
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --test app/js/tests/ui-v2-dashboard.test.mjs
```

- [ ] **Step 3: Move dashboard presentation to page CSS**

Do not carry forward Georgia headings, white diagonal reflections, bright borders or large legacy shadows. Use sans-serif hierarchy, semantic surfaces and 1–2px hover elevation maximum.

- [ ] **Step 4: Delete dashboard style injection only**

Remove the `document.createElement('style')` block and `style.textContent`; preserve markup, metrics, setView integration, calculations and event handlers.

- [ ] **Step 5: Add geometry-matched dashboard skeleton**

Show skeleton cards/panels before data render and hide immediately after `renderDashboard()` has real values. Never delay loaded data for animation.

- [ ] **Step 6: Load CSS, verify, commit, manual checkpoint**

```bash
node --test app/js/tests/ui-v2-dashboard.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
git add app/css/ui-v2/pages/dashboard.css app/js/features/dashboard.js app/index.html app/js/tests/ui-v2-dashboard.test.mjs
git commit -m "feat: migrate dashboard to UI v2"
```

User reviews Dark/Light dashboard, icons, progress, hover restraint and skeleton.

---

### Task 5: Migrate Alunos and add mobile record cards

**Files:**
- Create: `app/css/ui-v2/pages/students.css`
- Modify: `app/index.html`
- Modify: `app/js/core/script.js`
- Create: `app/js/tests/ui-v2-students.test.mjs`

**Interfaces:**
- Consumes: `#studentsView`, `#search`, `#classFilter`, `#exportClassBtn`, `#newClassBtn`, `#newBtn`, `#list`, `render()`, `editCouple`, `removeCouple`, `toggleEntry`, `toggleMonth`.
- Produces: desktop table + `#studentCards` mobile representation from same data and actions.

- [ ] **Step 1: Write failing contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const index = read('../../index.html');
const core = read('../core/script.js');
const css = read('../../css/ui-v2/pages/students.css');

test('students keeps desktop list and adds mobile cards target', () => {
  assert.match(index, /id=["']list["']/);
  assert.match(index, /id=["']studentCards["']/);
});

test('render updates mobile student cards using current actions', () => {
  assert.match(core, /studentCards/);
  assert.match(core, /editCouple\('/);
  assert.match(core, /removeCouple\('/);
});

test('mobile layout swaps table for cards', () => {
  assert.match(css, /@media[^\{]*max-width:\s*768px[\s\S]*students-table-wrap[\s\S]*display:\s*none/s);
  assert.match(css, /@media[^\{]*max-width:\s*768px[\s\S]*student-cards[\s\S]*display:\s*grid/s);
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --test app/js/tests/ui-v2-students.test.mjs
```

- [ ] **Step 3: Add mobile container without renaming existing IDs**

```html
<div id="studentCards" class="student-cards" aria-label="Alunos cadastrados"></div>
```

Keep `#list` for desktop and all toolbar IDs unchanged.

- [ ] **Step 4: Extend `render()` minimally**

Keep filtering/payment calculations unchanged. Add `studentCardMarkup(c)` using the same current actions. Empty state must render coherently in table and card containers.

- [ ] **Step 5: Replace text-only initial loading with table/card skeletons**

`loadData()` still performs the same two Supabase reads; only loading markup changes.

- [ ] **Step 6: Implement students CSS, verify, commit, manual checkpoint**

```bash
node --test app/js/tests/ui-v2-students.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
git add app/css/ui-v2/pages/students.css app/index.html app/js/core/script.js app/js/tests/ui-v2-students.test.mjs
git commit -m "feat: migrate students to UI v2"
```

User verifies search, class filter, edit/delete, payment toggles, skeleton, desktop and mobile layouts in both themes.

---

### Task 6: Add dedicated Turmas destination using existing class persistence

**Files:**
- Create: `app/css/ui-v2/pages/classes.css`
- Create: `app/js/features/classes-view.js`
- Modify: `app/index.html`
- Modify: `app/js/core/script.js`
- Create: `app/js/tests/ui-v2-classes.test.mjs`

**Interfaces:**
- Consumes: global lexical `classes`, `couples`, `escapeHtml`, existing `#classModal`, `#newClassBtn`, `removeClass(id)`, `setView(view)`.
- Produces: `#classesTab`, `#classesView`, `#classesPageList`, `#classesPageNewBtn`, `window.renderClassesPage()`.

- [ ] **Step 1: Write failing contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const index = read('../../index.html');
const core = read('../core/script.js');
const feature = read('../features/classes-view.js');

test('classes is a stable navigation destination', () => {
  for (const id of ['classesTab', 'classesView', 'classesPageList', 'classesPageNewBtn']) {
    assert.match(index, new RegExp(`id=["']${id}["']`));
  }
});

test('core recognizes classes view', () => {
  assert.match(core, /view\s*===\s*['"]classes['"]/);
  assert.match(core, /renderClassesPage/);
});

test('classes page reuses existing class mutations', () => {
  assert.match(feature, /newClassBtn/);
  assert.match(feature, /removeClass\(/);
  assert.doesNotMatch(feature, /\.from\(['"]classes['"]\)/);
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --test app/js/tests/ui-v2-classes.test.mjs
```

- [ ] **Step 3: Add static Classes tab/view**

Add the four IDs above. The view contains page header, new-class button, responsive class cards/list and skeleton target.

- [ ] **Step 4: Implement `classes-view.js` as presentation only**

Render current class name/place/schedule/student count from `classes` + `couples`. New class reuses current handler:

```js
document.getElementById('classesPageNewBtn')?.addEventListener('click', () => {
  document.getElementById('newClassBtn')?.click();
});
```

Delete action calls existing `removeClass(id)`. No Supabase call exists in this new module.

- [ ] **Step 5: Extend core view state minimally**

Core `setView()` toggles `#classesView`/`#classesTab`; on entry:

```js
if (view === 'classes') window.renderClassesPage?.();
```

Keep current class create/delete persistence unchanged.

- [ ] **Step 6: Verify, commit, manual checkpoint**

```bash
node --test app/js/tests/ui-v2-classes.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
git add app/css/ui-v2/pages/classes.css app/js/features/classes-view.js app/index.html app/js/core/script.js app/js/tests/ui-v2-classes.test.mjs
git commit -m "feat: add UI v2 classes destination"
```

User creates/deletes disposable class, verifies counts, dark/light and mobile layout.

---

### Task 7: Migrate Financeiro

**Files:**
- Create: `app/css/ui-v2/pages/financial.css`
- Modify: `app/index.html`
- Modify: `app/js/core/script.js` only for visual loading markup if required.
- Create: `app/js/tests/ui-v2-financial.test.mjs`

**Interfaces:**
- Consumes: current financial IDs and `renderFinancial()`/`financialValues(c)`.
- Produces: analytical UI with deep charcoal dark surfaces and theme-aware filters.

- [ ] **Step 1: Write failing contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../../css/ui-v2/pages/financial.css', import.meta.url), 'utf8');

test('finance uses semantic surfaces and one accent metric', () => {
  assert.match(css, /var\(--surface-card\)/);
  assert.match(css, /var\(--accent-primary\)/);
});

test('finance avoids hardcoded white and #464646 slabs', () => {
  assert.doesNotMatch(css, /background:\s*(?:white|#fff(?:fff)?)/i);
  assert.doesNotMatch(css, /background:\s*#464646/i);
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --test app/js/tests/ui-v2-financial.test.mjs
```

- [ ] **Step 3: Implement finance page CSS**

Style header/filter, four metrics and table with tabular numeric alignment. Reuse shared select/table/button surfaces.

- [ ] **Step 4: Add metric/table skeleton state without touching calculations**

- [ ] **Step 5: Verify, commit, manual checkpoint**

```bash
node --test app/js/tests/ui-v2-financial.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
git add app/css/ui-v2/pages/financial.css app/index.html app/js/core/script.js app/js/tests/ui-v2-financial.test.mjs
git commit -m "feat: migrate finance to UI v2"
```

User verifies totals, filtering, empty state and both themes.

---

### Task 8: Migrate Relatórios and chart loading/theming

**Files:**
- Create: `app/css/ui-v2/pages/reports.css`
- Modify: `app/js/features/reports.js`
- Modify: `app/index.html`
- Create: `app/js/tests/ui-v2-reports.test.mjs`

**Interfaces:**
- Consumes: current reports IDs, `loadChartJs()`, `renderCharts()` and existing report calculations.
- Produces: no injected CSS, semantic Chart.js colors, chart-shaped skeleton while lazy library/data loads.

- [ ] **Step 1: Write failing contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../features/reports.js');
const css = read('../../css/ui-v2/pages/reports.css');

test('reports no longer injects CSS', () => {
  assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
  assert.doesNotMatch(js, /style\.textContent\s*=/);
});

test('charts use semantic UI v2 variables', () => {
  for (const token of ['--accent-primary', '--status-success', '--text-muted', '--border-default']) {
    assert.ok(js.includes(token), `missing ${token}`);
  }
});

test('reports exposes chart skeleton', () => {
  assert.match(js, /reports-chart-skeleton/);
  assert.match(css, /\.reports-chart-skeleton/);
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --test app/js/tests/ui-v2-reports.test.mjs
```

- [ ] **Step 3: Move all report presentation into page CSS**

Do not carry forward serif headings, pure-white cards or old wine/terracotta decorative backgrounds.

- [ ] **Step 4: Remove only the report style-injection block**

Keep markup, filters, calculations, lazy Chart.js loading and chart lifecycle.

- [ ] **Step 5: Derive chart colors from semantic variables**

```js
const css = getComputedStyle(document.documentElement);
const accent = css.getPropertyValue('--accent-primary').trim();
const success = css.getPropertyValue('--status-success').trim();
const muted = css.getPropertyValue('--text-muted').trim();
const grid = css.getPropertyValue('--border-default').trim();
```

Use them in datasets/ticks/grid.

- [ ] **Step 6: Show chart skeleton around `await loadChartJs()` and clear it in `finally`**

Keep the current failure message if the CDN cannot load.

- [ ] **Step 7: Verify, commit, manual checkpoint**

```bash
node --test app/js/tests/ui-v2-reports.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
git add app/css/ui-v2/pages/reports.css app/js/features/reports.js app/index.html app/js/tests/ui-v2-reports.test.mjs
git commit -m "feat: migrate reports to UI v2"
```

User verifies KPIs, charts, filter, skeleton, theme switching and responsive charts.

---

### Task 9: Migrate Central de Automações

**Files:**
- Create: `app/css/ui-v2/pages/automation.css`
- Modify: `app/js/features/automation-center.js`
- Modify: `app/index.html`
- Create: `app/js/tests/ui-v2-automation.test.mjs`

**Interfaces:**
- Consumes: all current automation IDs/settings/status functions.
- Produces: semantic metrics, switches, readiness/status/activity surfaces, skeletons, no injected CSS.

- [ ] **Step 1: Write failing contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../features/automation-center.js');
const css = read('../../css/ui-v2/pages/automation.css');

test('automation no longer injects CSS', () => {
  assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
  assert.doesNotMatch(js, /style\.textContent\s*=/);
});

test('automation avoids hardcoded white and medium-gray slabs', () => {
  assert.doesNotMatch(css, /background:\s*(?:white|#fff(?:fff)?)/i);
  assert.doesNotMatch(css, /background:\s*#464646/i);
  assert.match(css, /var\(--surface-card\)/);
});

test('automation exposes skeleton state', () => {
  assert.match(js, /automation-skeleton/);
  assert.match(css, /\.automation-skeleton/);
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --test app/js/tests/ui-v2-automation.test.mjs
```

- [ ] **Step 3: Move all presentation into `pages/automation.css`**

Use shared switch component for existing checkboxes. Connected/read/delivered = success token; waiting = warning; failed = danger. Status must still include text, never color only.

- [ ] **Step 4: Add geometry-matched skeletons around settings/messages loading**

Do not change automation persistence, eligibility, retry or Meta status logic.

- [ ] **Step 5: Verify, commit, manual checkpoint**

```bash
node --test app/js/tests/ui-v2-automation.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
git add app/css/ui-v2/pages/automation.css app/js/features/automation-center.js app/index.html app/js/tests/ui-v2-automation.test.mjs
git commit -m "feat: migrate automation to UI v2"
```

User verifies integration status, switches, readiness, activity, retry and both themes.

---

### Task 10: Migrate profile, onboarding, dialogs, toast, and supporting surfaces

**Files:**
- Create: `app/css/ui-v2/pages/profile.css`
- Create: `app/css/ui-v2/pages/onboarding.css`
- Modify: `app/css/ui-v2/components.css`
- Modify: `app/css/ui-v2/motion.css`
- Modify: `app/js/features/academy-profile.js` only for loading/busy classes.
- Modify: `app/js/core/academy-onboarding.js` only for loading/busy classes.
- Modify: `app/index.html`
- Create: `app/js/tests/ui-v2-supporting-surfaces.test.mjs`

**Interfaces:**
- Consumes: profile modal/fields, legacy academy onboarding flow, `#modal`, `#classModal`, `openDialog()`, `closeDialog()`, `#toast`.
- Produces: one shared modal/toast language and fully migrated profile + onboarding presentation.

- [ ] **Step 1: Write failing contracts**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const components = read('../../css/ui-v2/components.css');
const motion = read('../../css/ui-v2/motion.css');
const profileCss = read('../../css/ui-v2/pages/profile.css');
const onboardingCss = read('../../css/ui-v2/pages/onboarding.css');

test('dialogs use shared theme-aware elevated surface', () => {
  assert.match(components, /dialog[\s\S]*var\(--surface-elevated\)/s);
  assert.match(components, /dialog::backdrop/);
});

test('dialog motion supports quiet close and reduced motion', () => {
  assert.match(motion, /is-closing/);
  assert.match(motion, /prefers-reduced-motion:\s*reduce/);
});

test('profile and onboarding have UI v2 page styles', () => {
  assert.match(profileCss, /var\(--surface-/);
  assert.match(onboardingCss, /var\(--surface-/);
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --test app/js/tests/ui-v2-supporting-surfaces.test.mjs
```

- [ ] **Step 3: Implement shared dialog/toast visual language**

Modal open motion: opacity + `scale(.985)` + `translateY(6px)` at normal duration. Closing is shorter. Preserve current `transitionend`-based `closeDialog()` behavior.

- [ ] **Step 4: Migrate profile CSS and loading states**

Move all profile presentation into `pages/profile.css`; preserve active-academy lookup/update logic.

- [ ] **Step 5: Migrate academy onboarding CSS and loading states**

Move onboarding presentation into `pages/onboarding.css`; preserve bootstrap RPC/auth-release logic and current accessibility/status semantics.

- [ ] **Step 6: Verify, commit, manual checkpoint**

```bash
node --test app/js/tests/ui-v2-supporting-surfaces.test.mjs
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
git add app/css/ui-v2 app/js/features/academy-profile.js app/js/core/academy-onboarding.js app/index.html app/js/tests/ui-v2-supporting-surfaces.test.mjs
git commit -m "feat: migrate profile onboarding and dialogs to UI v2"
```

User verifies profile load/save, onboarding if reproducible, student/class dialogs, Escape/cancel, toast, focus and dark/light.

---

### Task 11: Remove legacy visual layer and run final release gate

**Files:**
- Modify: `app/index.html`
- Create: `app/js/tests/ui-v2-legacy-removal.test.mjs`
- Delete after audit: all legacy CSS listed in File Map.

**Interfaces:**
- Consumes: completed UI v2.
- Produces: final frontend with no loaded legacy visual layer and no feature-level page CSS injection.

- [ ] **Step 1: Write failing independence contract**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const index = read('../../index.html');

for (const legacy of [
  './css/style.css', './css/style-base.css', './css/custom-select-fix.css',
  './css/app-shell.css', './css/design-tokens.css', './css/ui-states.css',
  './css/auth-surface.css', './css/academy-profile.css', './css/academy-onboarding.css'
]) {
  test(`final UI does not load ${legacy}`, () => assert.ok(!index.includes(legacy)));
}

test('dashboard reports and automation inject no presentation CSS', () => {
  for (const path of ['../features/dashboard.js', '../features/reports.js', '../features/automation-center.js']) {
    const js = read(path);
    assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
    assert.doesNotMatch(js, /style\.textContent\s*=/);
  }
});

test('critical functional modules remain loaded', () => {
  for (const src of [
    './js/core/script.js', './js/core/academy-context.js', './js/core/academy-data-context.js',
    './js/core/academy-onboarding.js', './js/features/payment-automation.js', './js/features/dashboard.js',
    './js/features/reports.js', './js/features/automation-center.js', './js/features/academy-profile.js'
  ]) assert.ok(index.includes(src), `missing ${src}`);
});
```

- [ ] **Step 2: Confirm RED while legacy links remain**

```bash
node --test app/js/tests/ui-v2-legacy-removal.test.mjs
```

- [ ] **Step 3: Audit remaining legacy references**

```bash
grep -R "style-base.css\|custom-select-fix.css\|auth-surface.css\|design-tokens.css\|app-shell.css\|ui-states.css\|academy-profile.css\|academy-onboarding.css" app --exclude-dir=tests
```

Expected: only known transitional stylesheet links remain. If runtime JS or a migrated page still references one, fix that dependency before deletion.

- [ ] **Step 4: Remove legacy links and files**

Remove all nine legacy CSS links from `index.html`, then delete the files. Do not remove any UI v2 stylesheet.

- [ ] **Step 5: Run full automated gate**

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Expected: 0 failures.

- [ ] **Step 6: Inspect scope**

```bash
git diff --name-only main...HEAD
```

There must be no unintended redesign changes under `supabase/`, `app/database/`, RLS/schema files, or payment/receipt persistence code.

- [ ] **Step 7: Commit final cleanup**

```bash
git add -A app docs/superpowers
git commit -m "refactor: remove legacy visual layer"
```

- [ ] **Step 8: Final manual browser gate with disposable data**

Verify in order: login; create student/couple; edit; create/assign class; mark/unmark permitted payment; receipt flow; Finance; Reports; Automation; delete disposable student/couple and class; Dark/Light across all major pages; mobile bottom nav and student cards.

Do not merge if any manual step fails.

- [ ] **Step 9: Fresh verification immediately before PR/merge**

```bash
node --test app/js/tests/*.test.mjs
node app/js/tests/money-input.test.js
```

Record the exact pass/fail counts and final commit SHA in the PR description.

---

## Self-Review

- **Spec coverage:** both palettes, semantic tokens, sans-serif visual system, shell, Auth, Dashboard, Alunos, dedicated Turmas, Financeiro, Relatórios, Automação, Profile, academy onboarding, dialogs/toasts, mobile behavior, skeletons, lazy Chart.js, Motion Principles, reduced motion, legacy removal and manual release gate all have explicit tasks.
- **Legacy-removal safety:** the Task 1 load-order test permits `style.css` to be absent, so the final cleanup will not invalidate the foundation test.
- **Presentation cleanup:** known CSS injection in Dashboard, Reports and Automation is explicitly removed and tested.
- **Functional safety:** no schema/RLS/database task exists; existing public theme/UI APIs and functional IDs remain stable; Classes reuses current class persistence rather than adding a second data path.
- **No placeholders:** each task contains concrete files, contracts, commands, expected failure/pass state and implementation boundaries.
