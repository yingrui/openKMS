# Frontend design system

SCSS tokens, shared layouts, and styling conventions for the SPA (`frontend/src/styles/`). Code lives in the repo; this page is the reference.

## Entry

- **`frontend/src/index.scss`** — loads **`design-system/_css-variables`** (all `var(--*)` tokens) then **`design-system/_global`** (reset, links, `.btn*`, motion reduction) then **`design-system/_utilities`** (shared modifiers: page subtitle errors, table empty rows, error banner/boundary, flex helpers — avoids TSX `style={{}}` for static chrome).

## `frontend/src/styles/design-system/`

| File | Role |
|------|------|
| **`_css-variables.scss`** | **Source of truth for theming:** palette, semantic surfaces (error/warning/success/info), document status pill tokens, typography scale (**DM Sans** + **Source Serif 4** self-hosted via `@fontsource/*` in **`frontend/src/fonts.ts`**; Chinese uses system **PingFang SC** / **Microsoft YaHei**), **spacing** (`--space-*`, **`--gap-compact`** / **`--padding-compact-*`** for half-step rhythm), radius, shadows (**incl. `--shadow-elevated`**, modal scrim **`--overlay-backdrop`**), **z-index** layers, **motion**, focus ring vars, **`--color-surface` / `--color-bg-subtle` / `--color-muted` / `--color-fg`** aliases, **`--color-ontology-*`** (KB ontology source chrome), **`@media print`** vars (**`--print-paper-bg`** / **`--print-ink`** / border + muted surfaces). `:root` + **`[data-theme='dark']`** overrides. |
| **`_tokens.scss`** | **Compile-time** mirrors: breakpoints (`$bp-*`), **`$grid-min-*`**, **`$playground-messages-*`**, **`$bp-dialog-sm`**, spacing (`$space-*` for `calc` / Sass), z-index (`$z-*`), `$km-layout-max`. Use with `@use '…/tokens' as ds`. |
| **`_mixins.scss`** | **`max-width` / `min-width`**, **`focus-ring-accent`**, **`text-truncate`**, **`motion-tokens`** (duration + easing; set `transition-property` yourself). `@use '…/mixins' as *` for bare `@include`. |
| **`_global.scss`** | Global reset, `body` / links, buttons (uses spacing + type + motion tokens). |
| **`_utilities.scss`** | Cross-route helpers (`.page-subtitle--error`, `.table-empty`, `.error-banner`, `.openkms-error-boundary*`, flex/spacing modifiers). Loaded once from `index.scss`. |
| **`_index.scss`** | Optional barrel: `@forward` tokens + mixins — `@use '../styles/design-system' as *` from a feature file (path depth varies). |
| **`knowledge-map/`** | Map-only compile-time sizes; `@use '…/knowledge-map/tokens' as km`. |

## Spacing rhythm

4px grid — always **`var(--space-*)`** in rules (see **`_css-variables.scss`**). Common choices:

| Use | Token |
|------|--------|
| Label ↔ control | `--space-2` (8px) |
| Form grid row/column gap | `--space-3` (12px) |
| Card stack / create block bottom margin | `--space-5` (20px) |
| Last form row → primary actions | `--space-6` (24px) |
| Page header → content | `--space-6` (+ `--space-1` in account pages) |
| Settings / account page max width | **`ds.$km-layout-max`** (900px) — same cap as document channel, project, and evaluation settings pages |

Half-step helpers: **`--gap-compact`**, **`--padding-compact-y`**, **`--padding-compact-x`** (chips, compact inputs).

## Shared layout (`frontend/src/styles/`)

| File | Role |
|------|------|
| **`account-page.scss`** | Cross-route **account / personal settings** chrome (Profile, Settings, Git credentials). Import via **`@use '../styles/account-page'`** in page SCSS, or **`import '…/account-page.scss'`** in a colocated component. |

**Structure:** `.account-page` → `.account-page-header` + `.account-stack` → one or more `.account-card` sections.

**Card:** `.account-card-head` (`.account-card-icon` + title/desc) then content. Forms sit on the **white card surface** — no inner gray box or dashed wrapper (matches Wiki / channel / project settings).

**Forms:** `.account-field` + `.account-input` / `.account-select`; multi-field blocks use `.account-form-grid` (optional `.account-form-grid--2col`); single-line create uses `.account-create-row` inside `.account-create-panel`. Primary actions in `.account-form-actions` (**`margin-top: var(--space-6)`**, no divider line).

**Saved items:** `.account-section` (top border) below the create block; `.account-section-toolbar` + `.account-list` / `.account-list-item` (white row on card). Use `.account-empty` only for list-area empty states (not when a create form already sits above); empty is text-only, no gray dashed box.

**Actions:** `.account-btn`, `.account-btn--primary`, `--secondary`, `--danger` inside account cards; **`margin-top: var(--space-6)`** before primary row (no top border). Channel/project/console settings **`*-settings-actions`** follow the same spacing. Elsewhere (e.g. Wiki settings) global **`.btn*`** from **`_global.scss`** is still fine.

**Pills:** `.account-pill` / `.account-pill--accent` for role/status chips (Profile).

**Compile-time caps** (`_tokens.scss`): **`$km-layout-max`** (900px page width), **`$account-form-max-width`**, **`$account-input-min-flex`**, **`$z-settings-modal-overlay`** / **`$z-settings-import-overlay`** (wiki import stack).

## Conventions

1. **Colors & surfaces** — Prefer **`var(--color-*)`**, **`var(--status-doc-*)`**, **`var(--color-*-bg)`** / **fg** / **border** so dark mode stays correct. Avoid new raw hex in feature SCSS unless print/PDF or a one-off chart.
2. **Spacing** — Prefer **`var(--space-*)`** for padding/gap/margin; use **`$space-*`** only inside `calc()` or Sass math.
3. **Type** — Prefer **`var(--text-*)`** + **`var(--text-*--line)`** for new UI; existing `rem` literals can migrate gradually.
4. **Breakpoints** — Use **`@include max-width(ds.$bp-md-min)`** (etc.) from **`_mixins.scss`** + **`_tokens.scss`**, not raw `@media` with magic pixels.
5. **Stacking** — Prefer **`z-index: var(--z-dropdown)`** (etc.) for overlays so layers stay consistent.
6. **Motion** — Use **`var(--duration-fast)`** / **`var(--ease-standard)`** (or **`@include motion-tokens`** plus an explicit **`transition-property`**); global stylesheet respects **`prefers-reduced-motion`**.
7. **TSX** — Prefer **`className`** + **`_utilities.scss`** / colocated SCSS for colors and spacing. Keep **`style={{…}}`** only for **data-driven geometry** (percent widths, tree indent from depth, crop box coordinates, CSS variables like `--home-knowledge-map-depth`).
8. **Settings page width** — **`width: 100%`**, **`max-width: ds.$km-layout-max`**, left-aligned (no **`margin: 0 auto`**). Reuse **`account-page.scss`** for personal account surfaces; channel/project/wiki settings may keep colocated `*Settings.scss` but should use the same width and spacing tokens.
9. **Reuse before inventing** — Prefer **`account-page.scss`**, **`.btn*`** / **`_utilities.scss`**, and existing settings layouts over one-off hex, magic `px`, or inline **`style={{}}`** for static chrome.
10. **Tokens** — Add project-wide semantics in **`_css-variables.scss`** / **`_tokens.scss`**; do not copy token values into feature SCSS.

## New feature stylesheet

Colocate **`Feature.scss`** next to the component, then:

```scss
@use '../../styles/design-system/mixins' as *;
@use '../../styles/design-system/tokens' as ds;
```

(Adjust `../` depth from `src/components/…` vs `src/pages/…`.)

Vite compiles SCSS with the **`sass`** package (`devDependency` in `frontend/package.json`).

## Updating this doc

When you add a reusable pattern under **`frontend/src/styles/`**, rename a shared class family, or change token meaning, update **`docs/design-system.md`**. If the **`design-system/`** directory layout changes, also refresh the frontend section in **[architecture.md](architecture.md)**.
