# Dassaevy Labs UI v2 — Full Visual Redesign

## Status
Approved in conversation on 2026-09-10. This document supersedes the earlier visual-layer direction for the Dashboard 2.0 branch while preserving the same functional-safety goals.

## Goal
Rebuild the entire visual layer of the Dassaevy Labs student-management system from scratch, without preserving the legacy look-and-feel, while preserving the existing functional contracts and business logic.

The redesign must eliminate conflicts caused by legacy CSS, hardcoded light surfaces, page-specific visual rules injected from JavaScript, and inconsistent component styling. The result should be a coherent, premium administrative product with two first-class themes, subtle motion, skeleton loading, responsive navigation, and shared components.

## Non-goals
This redesign must not intentionally change business rules, Supabase data access, RLS, multi-academy isolation, payment calculations, receipt rules, WhatsApp automation rules, authentication flows, or database schema.

The redesign itself is not justification to rename or remove DOM IDs used by existing JavaScript. Functional contracts are preserved unless a separate, explicitly justified and tested change is required.

## Core architectural decision
The visual layer is rebuilt from scratch, while the existing frontend behavior and data logic remain in place.

- JavaScript owns behavior, data loading, events, and state transitions.
- HTML owns structure, semantics, and stable DOM contracts.
- `app/css/ui-v2/` owns all presentation.
- Page JavaScript must stop injecting CSS into the document.
- Legacy CSS may remain temporarily during migration, but no migrated screen may depend on it.
- Legacy CSS is removed only after all screens have migrated and regression gates are green.

## Target CSS architecture

```text
app/css/ui-v2/
├── tokens.css
├── base.css
├── layout.css
├── components.css
├── motion.css
└── pages/
    ├── auth.css
    ├── dashboard.css
    ├── students.css
    ├── financial.css
    ├── reports.css
    └── automation.css
```

Additional page/component files may be introduced only when they represent a clear reusable or page-level boundary. Avoid unrelated refactors.

## Theme system

### Dark — Urban Loft
Primary palette:
- Black: `#000000`
- Industrial gray reference: `#464646`
- Brick accent: `#A35E47`
- Secondary neutral: `#9C9A9A`
- Primary text borrowed from the light palette: `#F5F5DC`

The dark theme must not use `#464646` as a large flat surface everywhere. It is a reference tone from which darker charcoal surfaces are derived. Depth comes from subtle surface differences, restrained borders, and short shadows rather than white highlights.

Expected atmosphere: industrial, deep, calm, premium, charcoal + brick + cream.

### Light — Spiced Mocha
Primary palette:
- Cream: `#F5F5DC`
- Mocha: `#6F4E37`
- Cinnamon accent: `#D47E30`
- Dark brown: `#6D3B07`

Surfaces should stay warm and cream-based rather than pure white. The current light-theme direction that the user approved should be preserved conceptually while replacing legacy implementation details.

Expected atmosphere: warm, sophisticated, mocha + cream + cinnamon.

### Semantic tokens
Components must consume semantic tokens instead of hardcoded colors. The final naming may evolve slightly during implementation, but must include equivalents of:

```css
--surface-page;
--surface-sidebar;
--surface-card;
--surface-elevated;
--surface-input;
--text-primary;
--text-secondary;
--text-muted;
--text-on-accent;
--accent-primary;
--accent-hover;
--accent-soft;
--border-default;
--border-strong;
--status-success;
--status-warning;
--status-danger;
```

Green, amber, and red are reserved for semantic states, not decoration.

## Visual principles
- Remove legacy white reflections, diagonal gloss overlays, and bright borders.
- No pure-white dropdowns in dark mode.
- Avoid large mid-gray slabs in dark mode, especially in Finance and Automation.
- Prefer neutral surfaces with one strong accent color used intentionally.
- Use a modern sans-serif hierarchy throughout the product; phase out serif headings used by legacy pages.
- Moderate corner radii, thin borders, minimal shadow, and restrained elevation.
- Selected navigation items use the active theme accent and a high-contrast foreground.
- Icons must be monochrome/theme-aware where they represent system UI. Avoid colored emoji for dashboard controls and metrics.

## Navigation and shell
Desktop uses a vertical sidebar. Mobile uses a bottom tab bar.

Primary destinations:
- Visão Geral
- Alunos
- Financeiro
- Relatórios
- Automação

Turmas remain reachable through the student-management flow unless implementation reveals a clear existing dedicated route. Profile, theme toggle, and logout remain secondary controls.

The active indicator should animate smoothly between items without moving labels or icons. Hover changes surface/border/color only; it must not cause layout movement.

## Motion system
Motion follows the principles requested by the user: subtle, functional, polished, and unobtrusive.

### Rules
- Repeated enterprise interactions must avoid elastic/bouncy motion.
- Entry transitions use small combinations of opacity, `translateY`, and optional short blur.
- Exit transitions are faster and quieter than entry transitions.
- Hover elevation is typically 1–2 px at most.
- Dropdowns expand from the trigger.
- Modals use fade + very small scale/translate.
- Toasts enter/exit smoothly.
- Progress indicators animate only when meaningful.
- `prefers-reduced-motion` must be respected throughout.

### Timing guidance
- Fast feedback: about 160 ms.
- Standard transitions: about 220–260 ms.
- Larger transitions: up to about 320 ms.

Motion is centralized in `ui-v2/motion.css`; page JavaScript toggles state/classes and must not define presentation rules.

## Loading, skeleton, and async-state system
No major screen should appear blank while waiting for data.

Skeletons must match the final content geometry rather than use generic placeholder rectangles.

Expected loading behavior:
- Dashboard: metric-card and content skeletons.
- Students: table-row skeletons on desktop and card skeletons on mobile.
- Finance: metric and table skeletons.
- Reports: chart skeletons while data/Chart.js loads.
- Automation: settings, status, and activity skeletons.
- Profile/dialogs: contextual skeleton or busy state when async data is required.

Async actions should expose a consistent state model:

`idle -> loading -> success | error`

Buttons must prevent accidental duplicate submission while loading. Use determinate progress only when real progress data exists; otherwise use an indeterminate but restrained indicator.

Lazy loading should defer heavy modules/resources until needed where safe, without changing business behavior.

## Shared component system
The UI v2 must provide reusable visual contracts for:
- Buttons
- Inputs
- Selects/custom dropdowns
- Checkboxes
- Switches
- Cards
- Metric cards
- Tables
- Mobile record cards
- Badges
- Progress bars
- Empty states
- Error states
- Skeletons
- Modals/dialogs
- Toasts
- Tooltips
- Page headers
- Toolbars

The same component must look coherent in every page and theme. Page-specific CSS may arrange components but should not reinvent them.

## Screen designs

### Authentication
Rebuild the login/register/recovery/update-password surface from scratch while preserving existing auth IDs and behavior.

Design:
- Simple centered composition.
- Dassaevy Labs branding.
- Wide, legible fields.
- Theme-aware inputs.
- No heavy gradients or decorative gloss.
- Smooth transitions between auth modes.
- Busy state on submit.

### Visão Geral
Primary dashboard experience.

Structure:
- Greeting, academy context, date.
- Metrics: students, active classes, total received, pending payments.
- Financial summary and payment-completion progress.
- Pending-payment summary.
- Class summary.

Only one primary metric card should receive strong accent fill at a time (recommended: total received). Other cards remain neutral.

Metrics and progress should animate subtly after data loads.

### Alunos / Turmas
Desktop:
- Premium data table.
- Unified toolbar for search, class filter, export, new class, and new student/couple.
- Clean payment/status badges and progress.
- Secondary actions grouped to reduce visual noise.

Mobile:
- Replace compressed table with stacked record cards.
- Preserve quick access to class, payment state, progress, and actions.

Class selectors use the shared UI v2 dropdown component.

### Financeiro
The page should feel analytical rather than like a legacy table.

Structure:
- Metrics: total received, registration revenue, monthly revenue, payment count.
- Class filter using shared dropdown.
- Clear financial table below.
- Strong alignment of amounts and hierarchy of labels.

Dark mode must use deep charcoal surfaces, not large medium-gray containers.

### Relatórios
Use a fintech-inspired visual hierarchy without copying the reference brand.

Structure:
- Four KPI cards.
- Main monthly revenue chart.
- Secondary paid-vs-pending chart.
- Class performance chart/table.

Chart colors must come from semantic theme tokens. Chart.js loading displays chart-shaped skeletons. Remove page CSS currently injected by `reports.js`.

### Automação
Rebuild this page strongly; the current page has the most visible legacy-surface mismatch.

Structure:
- Integration status at top with semantic dot/status/detail.
- Metrics for sent, delivered, read, failed, skipped.
- Academy automation settings using shared switches.
- Readiness checklist.
- Recent activity table/list.

No large gray slabs. Use the same card and surface hierarchy as the rest of the application. Remove page CSS currently injected by `automation-center.js`.

### Profile, dialogs, and supporting UI
Profile, student/couple creation, class creation, confirmations, and other dialogs use one shared modal language:
- Darkened overlay.
- Elevated theme-aware surface.
- Fade + small scale/translate entry.
- Faster exit.
- Consistent fields/actions.
- Busy/skeleton states when applicable.

Toasts, badges, switches, empty states, errors, and progress indicators are shared components, not page inventions.

## JavaScript presentation cleanup
The migration must remove page-level CSS injection from JavaScript. Known examples include:
- `app/js/features/dashboard.js`
- `app/js/features/reports.js`
- `app/js/features/automation-center.js`

These modules may continue generating markup and handling behavior/data, but their visual rules must move to `app/css/ui-v2/pages/` or reusable component CSS.

## Functional contract preservation
Preserve existing IDs and integration points used by business logic, including the current auth, students, finance, class, modal, profile, reports, automation, receipt, and payment flows.

The redesign must not modify functional code merely to make CSS easier.

If a DOM contract truly must change, implementation must:
1. identify the dependent JavaScript,
2. add/update a regression test first,
3. make the smallest compatible change,
4. verify the full suite before continuing.

## Migration strategy
Migration is progressive and isolated rather than a single destructive rewrite.

### Phase 1 — Foundation
Create UI v2 tokens, base, layout, components, motion, and skeleton system without changing business logic.

### Phase 2 — Auth + shell
Migrate authentication, sidebar, top-level layout, theme toggle, and mobile navigation.

### Phase 3 — Dashboard
Migrate Visão Geral and remove its injected legacy CSS.

### Phase 4 — Students/classes
Migrate student/class table, toolbar, forms, filters, progress, and mobile card layout.

### Phase 5 — Finance
Migrate finance metrics, filter, and table using shared components.

### Phase 6 — Reports
Migrate reports, charts, shared selectors, and remove injected report CSS.

### Phase 7 — Automation
Migrate automation metrics, integration status, settings, readiness, history, and remove injected automation CSS.

### Phase 8 — Profile/dialogs/supporting components
Migrate profile, dialogs, toasts, empty/error states, and remaining shared controls.

### Phase 9 — Legacy removal
Only after every migrated page is independent from legacy styling and all gates are green:
- remove `style.css`,
- remove `style-base.css`,
- remove `custom-select-fix.css`,
- remove superseded theme/override files,
- remove remaining inline/injected presentation rules.

Do not remove a legacy stylesheet merely because a new equivalent exists; remove it only when no current screen relies on it.

## Regression strategy
The branch keeps automated protection for both functional and visual contracts.

### Functional regression gates
Must continue covering, at minimum:
- authentication contracts,
- active academy resolution and isolation,
- students/classes CRUD contracts,
- payment calculations,
- finance totals,
- receipts,
- reports data logic,
- automation settings/messages,
- multi-academy protections,
- existing money tests.

No database/schema/RLS change is part of this redesign unless separately approved.

### UI v2 contract gates
Add tests that prevent reintroduction of:
- legacy stylesheet dependencies after final migration,
- page CSS injection from feature JS,
- hardcoded pure-white dark dropdown surfaces,
- colored emoji as core UI icons,
- layout-moving hover behavior,
- missing reduced-motion behavior,
- missing theme-aware custom select surfaces,
- missing skeleton/loading contracts for major pages.

Tests should validate intent and contracts rather than overspecify exact CSS implementation details.

## Manual validation checkpoints
After each migrated screen, perform a short manual browser pass before continuing. The user will review screenshots during the migration.

Final browser gate uses a disposable test record and covers:
1. login,
2. create student/couple,
3. edit record,
4. create/assign class,
5. mark/unmark payment as appropriate,
6. receipt flow,
7. finance view,
8. reports,
9. automation,
10. delete disposable record,
11. dark/light theme switching,
12. desktop/mobile responsive navigation.

The redesign is not merge-ready until automated checks and this final manual flow are both successful.

## Accessibility and responsiveness
- Maintain visible keyboard focus.
- Preserve labels and accessible names.
- Theme contrast must remain readable in both modes.
- Interactive elements must remain usable at mobile sizes.
- Respect safe-area insets for the bottom navigation.
- Respect `prefers-reduced-motion`.
- Avoid relying on color alone for critical status meaning.

## Success criteria
The UI v2 is successful when:
- no migrated screen visually depends on legacy CSS,
- the final app no longer loads the legacy visual layer,
- no feature module injects page presentation CSS,
- dark mode consistently follows Urban Loft,
- light mode consistently follows Spiced Mocha,
- shared controls render correctly in both themes,
- major async screens use skeletons/loading states,
- motion is smooth and restrained,
- desktop and mobile navigation are coherent,
- existing business behavior remains intact,
- automated regression suites pass,
- the complete manual test flow passes before merge.
