# Academy Profile and Receipts — Design

Date: 2026-08-29
Branch: `feat/academy-profile-and-receipts`
Base: `main`

## Goal

Move academy institutional identity from user-owned `academy_profiles` to the academy tenant itself, expose those data through a tenant-aware "Meu Perfil" experience, and use the academy as the authoritative source for receipt and messaging identity.

This phase builds on the Stage 1 multi-academy foundation already merged into `main`.

## Scope

### In scope

- Extend `public.academies` with institutional fields:
  - `responsible_name`
  - `support_phone`
  - `display_name`
- Keep `academies.name` as the official academy name.
- Migrate legacy values from `academy_profiles` to the academy owned by that user when the target academy fields are empty.
- Add secure update access for the active academy owner.
- Replace the old user-owned academy settings flow with a tenant-aware "Meu Perfil" / "Dados da academia" experience.
- Show account email as read-only account information.
- Load and save institutional data through `currentAcademyId`.
- Update receipt/payment lifecycle to read academy identity from `academies` through `student.academy_id`.
- Continue feeding these values into receipt PDF generation and WhatsApp payment templates.
- Preserve `academy_profiles` temporarily for rollback/compatibility; do not delete it in this phase.
- Test on the existing Supabase DEV environment before merge.

### Out of scope

- Academy logo upload/storage.
- Multiple institutional responsible persons.
- User/teacher management inside an academy.
- Roles beyond the existing Stage 1 `owner` role.
- Plan/subscription management.
- Password change UI.
- Account email change.
- Deleting `academy_profiles`.
- Redesigning the receipt PDF layout beyond wiring the correct institutional data source.
- Redesigning WhatsApp templates.

## Data model

`public.academies` becomes the authoritative academy identity record:

```text
academies
├── id uuid PK
├── name text NOT NULL
├── responsible_name text NOT NULL DEFAULT ''
├── support_phone text NULL
├── display_name text NULL
├── created_at timestamptz
└── updated_at timestamptz
```

Semantics:

- `name`: official academy name and required tenant identity.
- `responsible_name`: one principal teacher/responsible person for institutional display.
- `support_phone`: optional academy contact number, stored normalized when present.
- `display_name`: optional short/public name for messages. If absent, consumers use `name`.

The account email remains in `auth.users` and is not duplicated in `academies`.

## Ownership and authorization

Institutional data belongs to the academy, not to an individual user.

Relationship:

```text
auth.users
   │
   └── academy_members
          │
          └── academies
                 ├── name
                 ├── responsible_name
                 ├── support_phone
                 └── display_name
```

Stage 1 currently allows one active academy per ordinary user and only the `owner` role. This phase uses that model.

### RLS

- Active members can continue to read their academy.
- Updating academy institutional data requires an active membership with `role = 'owner'`.
- No client operation may update another academy by supplying a foreign UUID.
- The frontend uses direct `select`/`update` operations on `academies`, always constrained by `currentAcademyId` as defense-in-depth; database RLS remains authoritative.
- No new profile RPC is introduced in this phase.
- Missing `currentAcademyId` fails closed before profile data access.

## Legacy migration

`academy_profiles` remains present during this phase.

Migration rules:

1. Add the new columns to `academies` additively.
2. For each existing active `academy_members` owner, locate the user's `academy_profiles` row.
3. Copy values only when the destination value is empty/null:
   - `academy_profiles.academy_name` → `academies.name` only if the academy name is blank (normally it will already exist because `academies.name` is required).
   - `academy_profiles.responsible_name` → `academies.responsible_name` if empty.
   - `academy_profiles.support_phone` → `academies.support_phone` if null/empty.
   - `academy_profiles.display_name` → `academies.display_name` if null/empty.
4. Never overwrite a non-empty academy value with a legacy profile value.
5. Preserve all legacy profile rows and IDs.

The migration must be idempotent and safe to run on databases that already have some of the new columns/data.

## Meu Perfil / Dados da academia

The current "Configurações da academia" behavior is replaced by a tenant-aware profile surface.

### Information architecture

```text
Meu Perfil
│
├── Dados da academia
│   ├── Nome da academia
│   ├── Professor / responsável
│   ├── Telefone para contato
│   └── Nome de exibição (opcional)
│
└── Conta
    └── E-mail da conta (somente leitura)
```

### Behavior

- Opening the profile loads the active academy using `currentAcademyId`.
- The form never queries academy identity by `currentUser.id`.
- Academy name is required.
- Responsible name is optional at database level for migration compatibility, but the UI should encourage filling it because receipts/messages use it.
- Support phone is optional and normalized/validated using the project's existing phone normalization rules.
- Display name is optional; blank saves as null.
- Save disables duplicate submission and exposes a real loading state.
- Success and error feedback must be explicit.
- Account email is sourced from the authenticated session and is read-only in this phase.

### Motion/loading standard

This UI follows `docs/ui-motion-standard.md`:

- skeleton only while remote academy data is genuinely loading;
- no fake delay;
- indeterminate loading for save duration because completion time is unknowable;
- subtle entry/exit motion using transform/opacity/filter only;
- frequent form interactions are instant;
- `prefers-reduced-motion` support is mandatory;
- no decorative looping animation.

## Receipt and payment lifecycle

The receipt generator already accepts:

- `academyName`
- `displayName`
- `responsibleName`
- `supportPhone`

Therefore this phase does not redesign `receipt.ts` unless a small compatibility change is required.

### Current source (to retire)

```text
payment-lifecycle
   ↓
academy_profiles WHERE user_id = authenticated user
```

### New source

```text
student.academy_id
   ↓
academies.id
   ↓
name / display_name / responsible_name / support_phone
   ↓
receipt PDF + payment confirmation template
```

The Edge Function must authorize the payment operation against academy membership, not rely solely on `student.user_id === user.id`, because future academy members may legitimately operate the same academy data.

For this phase, with only the owner role active, the authenticated user must be an active member of `student.academy_id`.

Display rules are explicit:

- receipt/PDF academy header always uses official `academies.name`;
- WhatsApp payment/receipt messaging uses `academies.display_name` when non-empty, otherwise `academies.name`;
- responsible missing: existing neutral fallback text remains;
- support phone missing: existing neutral fallback text remains.

## Existing `academy_profiles`

`academy_profiles` becomes legacy compatibility data after this phase.

Rules:

- no new profile UI writes to `academy_profiles`;
- receipt/payment lifecycle no longer reads it;
- existing rows are retained untouched;
- deletion is deferred to a later cleanup migration after repository-wide usage is proven absent.

## Error handling

- No active academy: profile data access fails closed and surfaces a user-friendly error rather than querying broadly.
- Profile read failure: keep the profile surface visible with an error/retry state; do not fabricate empty data as if load succeeded.
- Save validation failure: do not call Supabase.
- Save database/RLS failure: preserve form values and allow retry.
- Receipt lifecycle cannot resolve academy/membership: return an authorization/not-found error and do not generate a receipt under generic identity.
- Missing optional responsible/phone values do not block receipt generation; neutral fallback labels are used.

## Testing strategy

All production changes follow TDD.

### Database contract tests

- migration adds academy institutional columns;
- legacy profile backfill is present and non-destructive;
- non-empty academy values are not overwritten;
- owner update policy exists and is academy-scoped;
- foreign academy update is denied by policy contract;
- legacy `academy_profiles` table is retained.

### Frontend tests

- profile loads by `currentAcademyId`, never by `currentUser.id`;
- missing academy context fails closed;
- save writes only the active academy;
- phone validation/normalization is preserved;
- blank display name becomes null;
- loading/aria-busy and reduced-motion contracts are present;
- account email is read-only.

### Receipt lifecycle tests

- academy identity is loaded from `academies` by `student.academy_id`;
- `academy_profiles` is no longer queried by payment lifecycle;
- active academy membership is verified before processing;
- PDF receives official academy name, responsible and phone;
- WhatsApp uses `display_name || name` from the same academy identity source;
- existing receipt idempotency and void behavior remain green.

### DEV integration validation

Before merge:

1. Apply migration to `students-registration-dev`.
2. Create/update academy profile through UI.
3. Reload and confirm persistence.
4. Confirm another academy cannot read/update those values.
5. Mark a monthly payment as paid.
6. Open generated PDF and verify official academy name, responsible and phone.
7. Confirm WhatsApp identity selection uses display name fallback correctly without changing template structure.
8. Confirm receipt/payment rows remain tenant-scoped.
9. Run complete Node test suite.
10. Merge only after manual preview validation and explicit user approval.

## Rollback strategy

Because this phase is additive:

- new academy columns can remain unused if frontend/function code is rolled back;
- `academy_profiles` remains intact as a compatibility source during rollback;
- no legacy table or column is dropped;
- no existing receipt/student/payment IDs are rewritten.

## Success criteria

The phase is complete when:

- academy institutional identity has one authoritative tenant-owned source;
- the owner can view/edit it from "Meu Perfil";
- existing account email is visible read-only;
- legacy `academy_profiles` data is preserved and safely backfilled;
- receipts use the academy tenant identity automatically;
- payment/receipt authorization is membership-aware;
- Academy A cannot read/update Academy B profile data;
- full automated suite and DEV manual validation pass;
- no unrelated account/admin/subscription functionality is introduced.
