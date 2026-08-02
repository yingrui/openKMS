# Frontend design system

SCSS tokens, shared layouts, and UI conventions for the SPA (`frontend/src/styles/` + design-system React components). Code is the source of truth; this page is the map.

## Entry

**`frontend/src/index.scss`** loads, in order: **`design-system/_css-variables`** (`var(--*)` tokens) → **`design-system/_global`** (reset, links, `.btn*`) → **`design-system/_utilities`** (shared modifiers — prefer over TSX `style={{}}` for static chrome).

## Design system modules

| File | Role |
|------|------|
| **`_css-variables.scss`** | Theming: palette, semantic surfaces, status pills, typography (**DM Sans** + **Source Serif 4** via `@fontsource/*` in **`fonts.ts`**; Chinese: **PingFang SC** / **Microsoft YaHei**), spacing, radius, shadows, **`--overlay-backdrop`**, z-index, motion, focus rings, print vars. `:root` + **`[data-theme='dark']`**. |
| **`_tokens.scss`** | Compile-time mirrors: breakpoints (see below), grid mins, dialog widths, spacing (`$space-*`), z-index. `@use '…/tokens' as ds`. |
| **`_mixins.scss`** | **`max-width` / `min-width`**, **`focus-ring-accent`**, **`text-truncate`**, **`motion-tokens`**. |
| **`_global.scss`** | Reset, `body`, links, buttons. |
| **`_utilities.scss`** | Cross-route helpers + **`.ds-compact-label`**, **`.ds-tap-target`**. |
| **`_table-wrap.scss`** | **`.ds-table-wrap`** — scrollable table card (`overflow-x: auto`). |
| **`_dialog.scss`** / **`Dialog.tsx`** | Modal shell: Escape / overlay dismiss, focus trap, scroll lock, `min(--dialog-w, 100vw - 2rem)`, `max-height: 90dvh`. |
| **`_empty-state.scss`** / **`EmptyState.tsx`** | Zero-results panel (`icon` / `title` / `description` / `action`). |
| **`_panel-toolbar.scss`** / **`PanelToolbar.tsx`** | Detail panel header: leading / tabs / actions. |
| **`_metric.scss`** / **`Metric.tsx`** | Compact metric grid for entity detail headers. |
| **`_checkbox.scss`** | Shared checkbox skin (`.ds-checkbox`) + dense multi-select list (`.ds-check-list`). |
| **`_check-row.scss`** / **`CheckRow.tsx`** | Checkbox + title + hint card row (uses `.ds-checkbox`). |
| **`CheckList.tsx`** | Dense membership / filter lists (`CheckList` / `CheckListItem`). |
| **`_field.scss`** / **`FormField.tsx`** | Labeled text field stack (`.ds-field`) + shared control look (`.ds-control`). |
| **`_index.scss`** | Optional Sass barrel (`@forward` tokens + mixins). |
| **`knowledge-map/`** | Map-only compile-time sizes. |

Export surface for TSX: **`styles/design-system/index.ts`** (`Dialog`, `EmptyState`, `PanelToolbar`, `Metric` / `MetricGrid`, `CheckRow`, `CheckList` / `CheckListItem`, `FormField`, `Pagination`, …).

## Shared UI primitives

Use these instead of per-page copies. **`npm run check:styles`** blocks regressions (see § Style guardrails).

| Primitive | When to use |
|-----------|-------------|
| **`.ds-table-wrap`** | Any bordered table/list card that may overflow horizontally on phone. |
| **`<Dialog>`** | New modals. Legacy overlay class names may remain as CSS aliases during migration. |
| **`useConfirm()`** | Destructive or blocking confirms — not `window.confirm`. Provider: **`ConfirmProvider`** in **`MainLayout`**. |
| **`<EmptyState>`** | Standalone zero-results blocks. **`.channel-page-empty*`** remains the channel-list alias. |
| **`PanelToolbar`** | Detail split panels and section headers with leading + actions (Document/Article detail, KB sections, eval subsections, knowledge-map tree). |
| **`<Metric>` / `<MetricGrid>`** (`.ds-metric*`) | Compact label/value metrics on entity detail headers. Prefer over **`list-index-stat`** when there is no icon and several metrics share a row. |
| **`.ds-checkbox`** | Opt-in checkbox skin (accent fill + focus ring). Prefer over bare native checkboxes. |
| **`<CheckRow>`** (`.ds-check-row`) | Card-style checkbox with title + optional hint (settings / entity toggles). |
| **`<CheckList>` / `<CheckListItem>`** (`.ds-check-list*`) | Dense multi-select lists (e.g. group ↔ object-type membership). |
| **`<FormField>`** (`.ds-field` / `.ds-control`) | Label + text input / select / textarea in dialogs and forms. Prefer over bare `<input>` or page-local **`console-form-control`** / **`account-input`** for new UI. |
| **`.ds-compact-label`** | Hide button/link text ≤768px; keep **`aria-label`**. |
| **`--tap-min` (40px)** | Minimum hit area for icon buttons on phone (via **`.ds-tap-target`** or component rules). |

**Confirm example:**

```tsx
const confirm = useConfirm();
if (!(await confirm({ title: t('deleteTitle'), message: t('deleteBody'), danger: true }))) return;
```

**Breakpoint in JS:** **`useIsMobile()`** (`hooks/useIsMobile.ts`) mirrors **`$bp-md-min`** — do not call `matchMedia` elsewhere. Detail info panel default: **`useDetailInfoVisible()`** from the same module.

## Breakpoints

Six compile-time tokens in **`_tokens.scss`** — use **`@include max-width(ds.$…)`**, not raw `px`:

| Token | px | Typical use |
|-------|-----|-------------|
| `$bp-phone-max` | 520 | Very narrow field grids |
| `$bp-xs-max` | 640 | Extra-small layouts |
| `$bp-sm-min` | 720 | Small two-column min |
| `$bp-md-min` | 768 | **Phone shell** — must match `MOBILE_BREAKPOINT_PX` in `useIsMobile.ts` |
| `$km-layout-max` | 900 | Settings width cap; narrow column; comments overlay |
| `$bp-wide-max` | 1050 | Wide two-column stacks (ontology playground) |

## Spacing rhythm

4px grid — **`var(--space-*)`** in rules. Common: label↔control **`--space-2`**, form gap **`--space-3`**, card stack **`--space-5`**, actions **`--space-6`**, page header→content **`--space-6`**. App gutters: **`--app-page-padding-x/y`** on **`.app-content`** or **`.app-page-pane`** only. Half-step: **`--gap-compact`**, **`--padding-compact-*`**.

## App shell layout

**Goal:** one gutter source per scroll column — no stacked padding on shell + page root.

### Mobile shell (≤ `$bp-md-min`)

| Element | Behavior |
|---------|----------|
| App / Console sidebar | Hidden; `--sidebar-width: 0` |
| App Launcher | Full-width under header + **`--overlay-backdrop`** |
| Channel apps (Docs / Articles / Media) | No drawer — section index shows channel tree; **All channels** back link in channel view |
| Ontology second rail | Overlay drawer; Header toggle; **`OntologyMobileRailContext`** — not for channel rails |
| Header | Logo only; hide ⌘K and Console link; compact login |
| Tables / dialogs | **`.ds-table-wrap`** or `<Dialog>` sizing; channel rows → cards via **`_channel-table-as-cards.scss`** |
| Comments | Push panel → overlay at ≤900 → bottom sheet at ≤768 (`ContentCommentsRail.scss`) |
| Channel row actions | Single **`<TableRowActions>`** in **`.channel-item-actions`** — CSS places desktop vs mobile |

### Gutter decision tree

| Route shape | Gutter provider | Page rules |
|-------------|-----------------|------------|
| Default list / settings / console | **`.app-content`** | **`.page-header`** + **`.page-subtitle`**; no root padding |
| Channel or ontology rail layout | **`.app-page-pane`** on `*__main` | Channel/ontology SCSS must not pad `__main` |
| Home | **`.app-content`** | Optional **`.app-page-shell`** (max-width only) |
| Full-bleed | Exception row below | SCSS comment **`app-layout-exception:`** |

**Shell classes** (`app-page.scss`): **`.app-page-pane`**, **`.app-page-shell`**, **`.app-page-section*`**, **`.page-header`**, **`.page-subtitle`**.

### Layout exceptions

| Pattern | Reason |
|---------|--------|
| `.app-content--search` | Wider search gutters |
| `.app-content--with-*-rail` → `padding: 0` | Gutter on pane only; `:not(rail…)` avoids double padding on ≤768 detail |
| `.app-content--function-editor-workspace` | Full-height IDE |
| `.app-content--compact:has(.kb-detail--qa-fullpage)` | KB Q&A full page |
| `.app-content--compact .wiki-page-editor-outer` | Wiki editor edge-to-edge |
| `body.openkms-kb-qa-fullpage` / `openkms-agents-fullpage` | Hide header; Agents phone IA is chat-primary + full-width Sessions / Files panels (≤ `$bp-md-min`), not a stacked three-pane layout |
| `.app-content--object-explorer` | Flex fill, token padding |
| `.app-page-pane:has(> .entity-view)` | Ontology Manager entity detail fills the pane; scroll inside `.entity-view__main` only |

New exceptions: one-line SCSS comment + row here.

### Large page files

Reference: **`DocumentDetail`** — thin route entry + splits by concern:

| Suffix | Role |
|--------|------|
| `X.tsx` | Route entry — layout wiring |
| `useX.ts(x)` | Fetch, mutations, derived state |
| `X.splitPanel.tsx` / `X.infoPanel.tsx` | Layout regions |
| `X.modals.tsx` / `X.dialogs.tsx` | Dialogs |
| `X.types.ts` / `X.utils.ts` | Types, pure helpers |

Soft limit **700 lines** per page `.tsx` / hook (enforced by **`check:styles`** allowlist — shrink the allowlist, do not grow it).

## Shared layout SCSS (`frontend/src/styles/`)

| File | Role |
|------|------|
| **`account-page.scss`** | Profile, Settings, Git credentials |
| **`app-page.scss`** | Page header, shell sections (loaded from `index.scss`) |
| **`channel-page.scss`** | Docs / Articles / Media browse; imports **`_channel-toolbar-compact.scss`**, **`_channel-table-as-cards.scss`** |
| **`list-index.scss`** | Section landing (stats + quick actions) |
| **`channel-tree.scss`** | Channel admin tree |
| **`settings-page.scss`** | Settings shell (tabs, fields, actions) |
| **`resource-list.scss`** | KB and Wiki card-grid lists |
| **`document-detail.scss`** | Shared Document / Article / Media detail chrome |

Import from page TSX: **`import '../../styles/<name>.scss'`**. Never import another page's colocated SCSS.

### Account pages

**`.account-page`** → header + **`.account-stack`** → **`.account-card`** (head + content on white surface, no inner gray box). Forms: **`.account-field`**, **`.account-form-grid`**, **`.account-form-actions`** (`margin-top: var(--space-6)`). Lists: **`.account-list-item`**. **`.account-empty`** for list-only empty states.

### Channel pages

**`.channel-page*`** (header, toolbar, bulk bar), **`.channel-table*`** (wrap uses **`.ds-table-wrap`** or transparent mobile wrap), **`.channel-item*`** (primary cell + **`.channel-item-actions`**). At ≤768, generic rule hides non-primary `<td>`; card styles live in the channel partials above.

## Conventions

1. **Colors** — **`var(--color-*)`**, **`var(--status-doc-*)`**; no new raw hex in feature SCSS (charts/print excepted).
2. **Spacing & type** — **`var(--space-*)`**, **`var(--text-*)`**; **`$space-*`** only in Sass `calc`.
3. **Breakpoints & z-index** — tokens + mixins; **`var(--z-*)`** for overlays.
4. **TSX styling** — `className` + SCSS; `style={{}}` only for data-driven geometry.
5. **Settings width** — `max-width: ds.$km-layout-max`, left-aligned.
6. **Reuse** — shared SCSS + design-system components before one-off patterns.
7. **Gutters & exceptions** — § App shell layout; run **`check:app-layout`** when touching shell files.

## Style guardrails

From **`frontend/`**:

```bash
npm run check:app-layout   # single gutter source (.app-content / .app-page-pane)
npm run check:styles       # table below
npm run build
```

**`check-shared-styles.sh`** (`npm run check:styles`) — allowlists are **known debt, not permission**:

| # | Blocks | Use instead |
|---|--------|-------------|
| 1 | Page importing another page's SCSS | Move rules to **`src/styles/`** |
| 2 | `matchMedia` outside `useIsMobile.ts` | **`useIsMobile()`** |
| 3 | Raw `px` in `@media` / `@include max-width(Npx)` | **`ds.$bp-*`** tokens |
| 4 | `MOBILE_BREAKPOINT_PX` ≠ `$bp-md-min` | Keep TS and Sass in sync |
| 5 | Multiple **`<TableRowActions>`** per channel row | One instance in **`.channel-item-actions`** |
| 6 | New `*-table-wrap` class | **`.ds-table-wrap`** |
| 7 | New `*-modal-overlay` / `*-dialog-overlay` | **`<Dialog>`** |
| 8 | `window.confirm(` | **`useConfirm()`** |
| 9 | Raw `rgba(0,0,0,…)` modal backdrop | **`var(--overlay-backdrop)`** |
| 10 | New page `.tsx` > 700 lines | Split like **`DocumentDetail`** |

Run **`check:app-layout`** when editing **`App.scss`**, **`app-page.scss`**, **`ChannelSectionLayout*`**, **`MainLayout.tsx`**.

## New feature stylesheet

```scss
@use '../../styles/design-system/mixins' as *;
@use '../../styles/design-system/tokens' as ds;
```

(Adjust `../` depth for `components/` vs `pages/`.)

## Updating this doc

When shared SCSS, tokens, guard rules, or cross-route React primitives change, update this file. If **`design-system/`** layout changes, also refresh the frontend section in **[architecture.md](architecture.md)**.
