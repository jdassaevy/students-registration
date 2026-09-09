# Dassaevy Labs Dashboard 2.0 — UI Redesign Specification

## Goal
Modernize the entire application interface using the referenced fintech dashboard as visual inspiration while preserving Dassaevy Labs' identity and, above all, preserving all existing business functionality.

The redesign must be treated as a presentation-layer evolution, not a rewrite of the application's business logic.

## Non-regression rule
The redesign must not change existing behavior for authentication, academy context, multi-academy isolation, students/couples, classes, payments, receipts, financial totals, reports, WhatsApp automation, exports, or profile flows unless a separate functional change is explicitly requested.

When visual work touches an existing flow, the implementation must reuse the current event handlers, data sources, permissions, Supabase queries, and domain rules wherever possible.

Every implementation phase must end with regression checks before the next phase starts.

## Visual direction
The interface should use the Behance fintech dashboard as inspiration for hierarchy, density, navigation, composition, spacing, modular cards, and premium dashboard feel, while retaining Dassaevy Labs branding.

### Brand tokens
Primary brand accents remain based on the current identity:
- Wine / deep burgundy for primary actions and active navigation
- Terracotta for secondary accents
- Cream / warm off-white in light theme
- Warm graphite / near-black in dark theme
- Green, amber, and red reserved for semantic states such as paid, pending, success, warning, and error

The redesign must not reproduce the reference brand colors or visual identity directly.

## Theme system
The system will support both Dark and Light themes.

### Dark
Dark is the default theme.
- Warm graphite background
- Slightly elevated neutral surfaces for cards and panels
- Minimal shadows
- Fine borders with subtle contrast
- Wine/terracotta accents

### Light
- Cream/off-white application background
- White or warm-paper surfaces
- Soft shadows only where elevation is useful
- Same wine/terracotta identity as dark theme

Theme implementation should be token-based so components are shared between both themes rather than duplicated.

## Navigation architecture
### Desktop
Replace the current top-level navigation with a compact vertical sidebar.

Primary sections:
1. Visão Geral
2. Alunos
3. Turmas
4. Financeiro
5. Relatórios
6. Automação

Secondary controls remain near the bottom of the sidebar:
- Profile
- Settings/theme
- Sign out

The active item should have a clearly animated selection state.

### Mobile
The primary navigation becomes a bottom tab bar optimized for thumb reach.

Less frequently used destinations may be exposed through a secondary menu if necessary to avoid overcrowding.

## Overview dashboard
The Overview page becomes the default dashboard home.

Order and content:
1. Greeting and active academy context
2. Primary KPI cards
   - Total received
   - Students/couples
   - Active classes
   - Pending items
3. Financial chart
4. Monthly-payment progress
5. Recent payments
6. Quick actions

Cards use moderate rounded corners around 16–20px, very subtle borders, restrained shadows, and clear hierarchy.

Important cards may use wine or an extremely subtle brand gradient.

## Students and Financial interfaces
### Desktop
Keep tabular layouts where data density benefits from them, but redesign them as premium dashboard tables:
- Cleaner headers
- Better vertical spacing
- Initials/avatar area
- Semantic badges
- Visual payment progress
- Search and filters integrated into the panel header
- Secondary actions moved into a compact overflow menu where appropriate

### Mobile
Do not squeeze desktop tables into small screens.

Rows become compact cards with:
- Main identity
- Key status
- Payment/progress summary
- Primary action
- Secondary actions accessible without horizontal overflow

## Motion Principles
Motion is part of the product system, not decoration.

Implementation should follow the Motion Principles direction requested by the user:
- Smooth and brief entry/exit transitions
- No excessive bounce or playful motion in administrative workflows
- Navigation indicator transitions between destinations
- Subtle staged card entrances where appropriate
- Coordinated modal opening/closing
- Filter/search updates without flashing or abrupt layout jumps
- Visible press/loading/success/error states on actions
- Respect `prefers-reduced-motion`

Animations must not delay user actions or make the application feel slower.

## Loading and perceived performance
No asynchronous operation should appear visually inert.

Use a consistent state model where appropriate:
`idle -> loading -> success/error`

Required patterns:
- Skeleton cards for dashboard KPIs
- Skeleton rows for tables
- Skeleton cards for mobile lists
- Lazy loading for modules/content not required for the initial view
- Progressive loading for heavier dashboard/report modules
- Button-level loading indicators for writes
- Progress indicators for operations that can take noticeable time
- Stable skeleton dimensions to avoid layout shift

Lazy loading must not alter domain behavior or delay critical authentication/academy context initialization.

## Component architecture
The redesign should create or consolidate reusable presentation components/styles for:
- App shell
- Sidebar
- Bottom tab bar
- Theme tokens
- Cards
- KPI cards
- Badges
- Progress bars
- Skeletons
- Loading buttons
- Tables
- Mobile data cards
- Modal transitions
- Empty states
- Toast/status feedback

The UI layer must remain separated from existing Supabase/business logic.

Avoid placing all new behavior into `app/js/core/script.js`; new visual concerns should be split into focused modules when needed.

## Functional isolation strategy
To minimize regression risk:

1. Preserve existing element IDs and event contracts where practical during the first visual pass.
2. Prefer restyling/restructuring wrappers before replacing existing functional controls.
3. Reuse current handlers rather than duplicating payment, deletion, export, or filtering logic.
4. Avoid database/schema changes for this redesign.
5. Avoid changing RLS, Supabase queries, financial calculations, receipt rules, or automation rules.
6. Introduce new UI state modules only when they do not become a second source of truth for business data.

## Implementation phases
### Phase 1 — Foundation
- Create redesign branch from current main
- Introduce theme tokens
- Add Dark/Light theme switching
- Build desktop sidebar
- Build mobile bottom tab bar
- Add core motion primitives
- Add skeleton/loading primitives
- Keep existing application logic wired to current flows

### Phase 2 — Overview
- Build new Overview dashboard
- Add KPI cards
- Add financial visualization
- Add recent activity/payment modules
- Add quick actions
- Add dashboard skeleton/lazy-loading states

### Phase 3 — Students and Classes
- Redesign students table
- Build mobile student cards
- Redesign class controls and class management surfaces
- Preserve add/edit/delete/payment behavior

### Phase 4 — Financial
- Redesign finance summary and tables
- Add responsive mobile cards
- Preserve all existing financial calculations and filters

### Phase 5 — Reports and Automation
- Apply the same design system to reporting and automation modules
- Add appropriate progressive loading and status feedback

### Phase 6 — Polish and regression
- Responsive pass
- Accessibility pass
- Reduced-motion pass
- Empty/error/loading state pass
- Cross-theme visual verification
- Full functional regression before PR/merge

## Testing strategy
The redesign is only considered complete if core user journeys behave exactly as before.

Regression checks should cover at minimum:
- Login
- Registration and password reset UI compatibility
- Academy onboarding/context
- Academy profile
- Multi-academy isolation
- Student/couple create
- Student/couple edit
- Student/couple delete
- Class create/manage/filter
- Payment status changes
- Individual payment values
- Financial totals
- Receipt flows and preserved receipt history
- DOCX/export actions
- Reports
- WhatsApp/payment automation UI flows
- Sign out
- Dark/light switching
- Desktop/mobile navigation

For each implementation phase, tests/checks should be run against the branch before merging that phase into the redesign branch or progressing further.

## Success criteria
The redesign succeeds when:
- The interface visually feels like a modern premium dashboard inspired by the chosen reference
- Dassaevy Labs branding remains recognizable
- Dark and Light themes both feel native rather than one being an afterthought
- Desktop navigation uses a sidebar and mobile uses a bottom tab bar
- Loading, skeleton, progress, and transition states exist consistently throughout the interface
- Tables remain efficient on desktop and become cards on mobile
- Existing business behavior remains unchanged
- No database migration is required for the visual redesign
- Functional regression checks pass before the redesign is merged to main
