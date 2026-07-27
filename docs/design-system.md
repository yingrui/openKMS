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
| **App page gutters** | **`--app-page-padding-x` / `--app-page-padding-y`** (default `--space-6`) — `.app-content`, `.app-page-pane`, channel/ontology main columns |
| **Ontology NavRail** | **`--ontology-app-rail-width`** (default `200px`) — Manager / Explorer / Function Editor second column |
| Settings / account page max width | **`ds.$km-layout-max`** (900px) — same cap as document channel, project, and evaluation settings pages |

Half-step helpers: **`--gap-compact`**, **`--padding-compact-y`**, **`--padding-compact-x`** (chips, compact inputs).

## App shell layout

**Goal:** one gutter source per scroll column — no stacked `padding` on shell + page root.

### Mobile shell (≤ `$bp-md-min` / 768px)

Phase 1 phone chrome — desktop (≥769px) unchanged:

| Element | Mobile behavior |
|---------|-----------------|
| App Rail / Console sidebar | Hidden from flow; `--sidebar-width: 0` via `.app-layout--sidebar-collapsed` / `--console` |
| App Launcher | Full-width panel under header + backdrop (`--overlay-backdrop`, `z-modal`) |
| Channel rail (Documents / Articles / Media) | No drawer — section index becomes the channel tree; channel pages show the **All channels** back link |
| Ontology rail (Manager / Explorer / Function Editor list) | Overlay drawer; Header **PanelLeft** toggle; backdrop + Escape + route change close |
| Header | Logo only (hide brand name); hide `⌘K`; hide Console link (keep Exit Console); login icon-only |

Context: ontology drawer state lives in `MobileShellContext` (`MainLayout`); its toggle uses `.header-rail-toggle` (visible only ≤768px). Components that need the breakpoint in JS use **`useIsMobile()`** (`src/hooks/useIsMobile.ts`) — the single TS mirror of `$bp-md-min`; do not re-write `matchMedia('(max-width: 768px)')`.

Reading surfaces (≤768): channel/KB tables use `overflow-x: auto`; list toolbars and wiki/article headers wrap; document split drops tall `min-height` when stacked; KB FAQ/chunk dialogs use `width: min(…, 100vw - 2rem)`; KB Q&A session rail stacks at `$bp-md-min`.

List footers (`.ds-pagination`, `_pagination.scss`): stack into range + page size on one line and a full-width `prev / status / next` row with 40px tap targets. Inside a channel list the footer drops its surface (`.channel-table-wrap .ds-pagination`) because the wrap is transparent on phones.

Documents / Articles / Media **section index** on ≤768: channel tree is the main pane (`channel-section-layout--mobile-landing`); stats/quick-actions index stays desktop-only. Inside a channel on mobile, use **All channels** back link (`.channel-browse-back`) — no header drawer for the channel tree.

### Decision tree

| Route shape | Who provides horizontal/vertical gutter | Page TSX / SCSS |
|-------------|----------------------------------------|-----------------|
| Default (list, settings, console page in main column) | **`.app-content`** in `App.scss` via `--app-page-padding-*` | Use **`.page-header`** + **`.page-subtitle`**; **do not** add root `padding` on the page wrapper |
| Documents / Articles / Media (channel rail) | **`.app-page-pane`** on `channel-section-layout__main` | Same; channel SCSS must **not** set `padding` on `__main` |
| Ontology app (second nav rail) | **`.app-page-pane`** on `ontology-section-layout__main` | Same |
| Platform Home | **`.app-content`** only | Optional **`.app-page-shell`** for max-width; **no extra page padding** |
| Full-bleed / immersive | **Exception** — see below | Comment **`app-layout-exception:`** + update this table |

### Primitives (`app-page.scss`, loaded from `index.scss`)

| Class | Role |
|-------|------|
| **`.app-page-pane`** | Scroll column inside channel / ontology layout; applies `--app-page-padding-*` |
| **`.app-page-shell`** | `max-width: $km-layout-max` only — not padding |
| **`.app-page-section*`** | Home-style sections (title, desc, spacing) |
| **`.page-header` / `.page-subtitle`** | Global page title block — **do not** re-declare `h1` font-size in feature SCSS unless truly different |

### Registered exceptions (`App.scss` / feature SCSS)

Mark with comment `app-layout-exception: <reason>` when bypassing shell gutters:

| Pattern | Reason |
|---------|--------|
| `.app-content--search` | Wider horizontal gutters for search results |
| `.app-content--with-channel-rail` / `--with-ontology-rail` / `--with-ontology-manager-rail` / `--with-object-explorer-rail` / `--with-function-editor-rail` → `padding: 0` | Rail layouts; gutter on `.app-page-pane` |
| `.app-content--function-editor-workspace` | Function Editor IDE — full-height workspace; negative margin in feature SCSS |
| `.app-content--compact:has(.kb-detail--qa-fullpage)` → `padding: 0` | KB Q&A full-page chat |
| `.app-content--compact .wiki-page-editor-outer` negative margin | Wiki editor edge-to-edge |
| `body.openkms-kb-qa-fullpage` / `openkms-agents-fullpage` | Hide header; zero shell padding |
| `.app-content--object-explorer` | Uses token padding but flex fill — not a second page root |

New exceptions require a row here and a one-line SCSS comment.

### Verification

From `frontend/`:

```bash
npm run check:app-layout   # gutter guardrails
npm run build
```

Agents: run **`check:app-layout`** when touching `App.scss`, `app-page.scss`, `ChannelSectionLayout*`, or `MainLayout.tsx`.

## Shared layout (`frontend/src/styles/`)

| File | Role |
|------|------|
| **`account-page.scss`** | Cross-route **account / personal settings** chrome (Profile, Settings, Git credentials). Import via **`@use '../styles/account-page'`** in page SCSS, or **`import '…/account-page.scss'`** in a colocated component. |
| **`app-page.scss`** | Global **`.page-header`**, **`.page-subtitle`**, **`.app-page-shell`**, **`.app-page-section*`** — loaded from **`index.scss`**. Use **`var(--app-page-padding-*)`** for in-app gutters. |
| **`channel-page.scss`** | Shared chrome for **channel browse pages** (Documents / Articles / Media). Import with **`import '../../styles/channel-page.scss'`** in the page TSX. |

**Structure:** `.account-page` → `.account-page-header` + `.account-stack` → one or more `.account-card` sections.

**Card:** `.account-card-head` (`.account-card-icon` + title/desc) then content. Forms sit on the **white card surface** — no inner gray box or dashed wrapper (matches Wiki / channel / project settings).

**Forms:** `.account-field` + `.account-input` / `.account-select`; multi-field blocks use `.account-form-grid` (optional `.account-form-grid--2col`); single-line create uses `.account-create-row` inside `.account-create-panel`. Primary actions in `.account-form-actions` (**`margin-top: var(--space-6)`**, no divider line).

**Saved items:** `.account-section` (top border) below the create block; `.account-section-toolbar` + `.account-list` / `.account-list-item` (white row on card). Use `.account-empty` only for list-area empty states (not when a create form already sits above); empty is text-only, no gray dashed box.

**Actions:** `.account-btn`, `.account-btn--primary`, `--secondary`, `--danger` inside account cards; **`margin-top: var(--space-6)`** before primary row (no top border). Channel/project/console settings **`*-settings-actions`** follow the same spacing. Elsewhere (e.g. Wiki settings) global **`.btn*`** from **`_global.scss`** is still fine.

**Pills:** `.account-pill` / `.account-pill--accent` for role/status chips (Profile).

**Compile-time caps** (`_tokens.scss`): **`$km-layout-max`** (900px page width), **`$account-form-max-width`**, **`$account-input-min-flex`**, **`$z-settings-modal-overlay`** / **`$z-settings-import-overlay`** (wiki import stack).

### Channel pages (`channel-page.scss`)

Documents, Articles and Media browse pages share one stylesheet; page SCSS keeps only what is unique to that area (upload dropzone, status pills, source cell).

| Class family | Role |
|--------------|------|
| **`.channel-page`** + **`.channel-page-header*`** / **`-main`** / **`-toolbar*`** / **`-search`** | Page root, title block, filter bar |
| **`.channel-page-bulk-*`** | Selection bar above the list |
| **`.channel-page-empty*`** / **`-loading`** / **`-error`** / **`-spinner`** | List states |
| **`.channel-page-modal*`** / **`-move-*`** | Upload, move and Media generate dialogs (header + hint + footer actions; fields sit in `.channel-page-move-form`) |
| **`.channel-table*`** | Table shell: `-wrap`, `-row` / `-row--selected`, `-select-col`, `-cell--primary` |
| **`.channel-item*`** | Primary cell content: leading icon + `-text` / `-title` / `-meta-row` / `-meta` / `-actions` |

**Responsive rule:** at ≤ `$bp-md-min` a `.channel-table` row becomes a card that shows **only** the checkbox and `.channel-table-cell--primary`; every other `<td>` is hidden generically, so new columns need no mobile rule. Row meta and row actions live in `.channel-item-meta-row`, which is desktop-hidden. Pages render row actions **once** — `useIsMobile()` decides between the meta line and the desktop action column.

## Conventions

1. **Colors & surfaces** — Prefer **`var(--color-*)`**, **`var(--status-doc-*)`**, **`var(--color-*-bg)`** / **fg** / **border** so dark mode stays correct. Avoid new raw hex in feature SCSS unless print/PDF or a one-off chart.
2. **Spacing** — Prefer **`var(--space-*)`** for padding/gap/margin; use **`$space-*`** only inside `calc()` or Sass math.
3. **Type** — Prefer **`var(--text-*)`** + **`var(--text-*--line)`** for new UI; existing `rem` literals can migrate gradually.
4. **Breakpoints** — Use **`@include max-width(ds.$bp-md-min)`** (etc.) from **`_mixins.scss`** + **`_tokens.scss`**, not raw `@media` with magic pixels.
5. **Stacking** — Prefer **`z-index: var(--z-dropdown)`** (etc.) for overlays so layers stay consistent.
6. **Motion** — Use **`var(--duration-fast)`** / **`var(--ease-standard)`** (or **`@include motion-tokens`** plus an explicit **`transition-property`**); global stylesheet respects **`prefers-reduced-motion`**.
7. **TSX** — Prefer **`className`** + **`_utilities.scss`** / colocated SCSS for colors and spacing. Keep **`style={{…}}`** only for **data-driven geometry** (percent widths, tree indent from depth, crop box coordinates, CSS variables like `--home-knowledge-map-depth`).
8. **Settings page width** — **`width: 100%`**, **`max-width: ds.$km-layout-max`**, left-aligned (no **`margin: 0 auto`**). Reuse **`account-page.scss`** for personal account surfaces; channel/project/wiki settings may keep colocated `*Settings.scss` but should use the same width and spacing tokens.
9. **Reuse before inventing** — Prefer **`account-page.scss`**, **`app-page.scss`** (`.page-header`, `.app-page-pane`), **`.btn*`** / **`_utilities.scss`**, and existing settings layouts over one-off hex, magic `px`, or inline **`style={{}}`** for static chrome.
10. **Tokens** — Add project-wide semantics in **`_css-variables.scss`** / **`_tokens.scss`**; do not copy token values into feature SCSS.
11. **App page gutters** — Use **`--app-page-padding-*`** only via **`.app-content`** or **`.app-page-pane`**. Do **not** add root `padding` on page wrappers. Full-bleed routes need **`app-layout-exception:`** comment + row in **`docs/design-system.md` § App shell layout**. Run **`npm run check:app-layout`** from `frontend/` when editing shell layout files.

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
