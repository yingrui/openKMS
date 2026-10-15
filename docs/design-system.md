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
| **`_a2ui-platform.scss`** | Shared **A2UI platform** theme: maps suite `var(--color-*)` → `--a2ui-*` tokens; COMPOSER-like Card elevation, type hierarchy, Modal/TextField/Button polish. Host surfaces add **`.a2ui-platform-surface`**; not app-specific recipes. |

Export surface for TSX: **`styles/design-system/index.ts`** (`Dialog`, `EmptyState`, `PanelToolbar`, `Metric` / `MetricGrid`, `CheckRow`, `CheckList` / `CheckListItem`, `FormField`, `Pagination`, …).

## A2UI platform surfaces

**Google A2UI** renders in Light DOM. openKMS hosts (Knowledge Map overview, …) wrap content in **`.a2ui-platform-surface`** and call **`ensureA2uiPlatformStyles()`** once at startup (`src/a2uiPlatform.ts` → `@a2ui/react/styles` `injectStyles()`). Product **Apps** are hosted module iframes — they do not use A2UI.

| Piece | Role |
|-------|------|
| **`design-system/_a2ui-platform.scss`** | Token bridge + primitive polish (Cards, Buttons, Modal/TextField, type hierarchy). |
| **Host wrapper** | e.g. `.km-overview-a2ui.a2ui-platform-surface` — surface owns content inset (`padding`) |
| **Catalog components** | `KmOverviewNodeLink`, … — behavior + domain wiring, not visual theme |

Extend `_a2ui-platform.scss` when a primitive pattern is reusable across A2UI hosts. Do not add feature-named layout rules for a single screen.


## Shared UI primitives

Use these instead of per-page copies. **`npm run check:styles`** blocks regressions (see § Style guardrails).

| Primitive | When to use |
|-----------|-------------|
| **`.ds-table-wrap`** | Any bordered table/list card that may overflow horizontally on phone. |
| **`<Dialog>`** | New modals. Legacy overlay class names may remain as CSS aliases during migration. |
| **`useConfirm()`** | Destructive or blocking confirms — not `window.confirm`. Provider: **`ConfirmProvider`** in **`MainLayout`**. |
| **`<EmptyState>`** | Standalone zero-results blocks. **`.channel-page-empty*`** remains the channel-list alias. |
| **Doc-inspector drawer** | `.model-yaml` (ontology-manager) — a right-docked **full-height** panel for reading a long document (folding tree + raw text). A deliberate exception to "use `<Dialog>`": a dialog caps at `90dvh` and wastes height. It uses the `--z-modal` / `--overlay-backdrop` tokens and names its backdrop `__scrim` (not `*-modal-overlay`) so `check:styles` stays meaningful. |
| **`PanelToolbar`** | Detail split panels and section headers with leading + actions (Document/Article detail, KB sections, eval subsections, knowledge-map tree). A whole **entity detail page** with several such sections uses `EntityViewShell` (sidebar identity + `navItems`) instead — see the dataset and semantic-model pages. Always use it instead of a hand-rolled flex toolbar — a page-local `*__toolbar` class only ships in its own lazy route chunk, so it silently loses its layout on any other page. |
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

### App layers (Application / Ontology / Data)

The App Rail, App Launcher, and Home apps group suite apps into three layers — `application` → `ontology` → `data` (top to bottom) — declared by `layer` in `frontend/src/config/appModules.ts`. The rail inserts a thin **`.sidebar-layer-divider`** between groups; the Launcher renders a titled section per layer (**`.app-catalog-section--launcher`** + **`.app-catalog-section-label`**). Console stays outside the layers (shared platform). Group with **`groupModulesByLayer()`**; do not re-sort in UI code.

### Mobile shell (≤ `$bp-md-min`)

| Element | Behavior |
|---------|----------|
| Header | Logo only (brand text via **`.ds-compact-label`**); hide ⌘K; **Console** enter lives in the user menu (**admin** role or **`console:access`** only); Exit Console stays in the header while inside the console shell; Console shell adds PanelLeft drawer toggle for admin nav |
| App / Console sidebar | App rail hidden (`--sidebar-width: 0`); **Console** admin sidebar becomes overlay drawer when open (`ConsoleMobileNavContext`) |
| App Launcher | Full-width under header + **`--overlay-backdrop`** |
| Channel apps (Docs / Articles / Media) | No drawer — section index shows channel tree; **All channels** back link in channel view |
| Ontology second rail | Overlay drawer; Header toggle; **`OntologyMobileRailContext`** — not for channel rails |
| Tables / dialogs | **`.ds-table-wrap`** or `<Dialog>` sizing; channel rows → cards via **`_channel-table-as-cards.scss`** |
| Comments | Push panel → overlay at ≤900 → bottom sheet at ≤768 (`ContentCommentsRail.scss`) |
| Channel row actions | Single **`<TableRowActions>`** in **`.channel-item-actions`** — CSS places desktop vs mobile |

### Immersive views (header hidden)

Views that take over the viewport add a `body` class that hides the header — `openkms-agents-fullpage` (Agents session + Session Review) and `openkms-kb-qa-fullpage` (KB Q&A full page). Claim it through **`useImmersiveView(bodyClass, active?)`** (`contexts/ImmersiveShellContext.tsx`), which applies the class and flags **`useImmersiveShell()`**. Never add the class by hand: the rail reads the flag, so a manual class would hide the header without restoring its navigation.

With the header gone, the left rail is the only chrome: brand → Home at the top (`sidebar-header--collapsed`, 56 px rail) and the account menu at the bottom (**`.sidebar-footer`** + `UserMenu placement="up"`). The header and the rail share **`components/Layout/UserMenu`**, so the menu is defined once.

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
| `.app-content--apps-run` → `padding: 0` | Apps Run gutters on `.apps-page--run` (not editor workspace) |
| `.app-content--compact:has(.kb-detail--qa-fullpage)` | KB Q&A full page |
| `.app-content--compact .wiki-page-editor-outer` | Wiki editor edge-to-edge |
| `body.openkms-kb-qa-fullpage` / `openkms-agents-fullpage` | Hide header (rail keeps Home + account — see **Immersive views**); phone IA (≤ `$bp-md-min`) is chat-primary + full-width Sessions / Chats panel (Agents also has Files) — not a stacked rail that eats chat height |
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

From **`frontend/`** — one command, the same one CI runs:

```bash
npm run check   # typecheck → check:app-layout → check:app-modules → check:styles
                # → check:lint (eslint ratchet) → vitest → build
```

| Gate | Covers |
|------|--------|
| `check:app-layout` | single gutter source (`.app-content` / `.app-page-pane`) |
| `check:app-modules` | the Suite app list/order lives in `APP_MODULES` |
| `check:styles` | the rules in the table below |
| `check:lint` | eslint, ratcheted: `scripts/eslint-baseline.txt` freezes the 152 errors we have (mostly the React Compiler rules in `eslint-plugin-react-hooks` v6, systemic in two large pages) — a file that *gains* one fails |
| `test` | vitest |

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
| 11 | `select` / text `input` with no skin (outside `<FormField>`, no `.ds-control`) | **`<FormField>`**, or **`className="ds-control"`**; `// ds-control-exempt` when a bespoke wrapper styles it. `scripts/ds-controls-baseline.txt` freezes the legacy hits (273) — a file only fails when it *adds* one |
| 12 | `t('key')` missing from the locale files (i18next prints the key, so the UI shows `dataModel.removeDimension`) | add the key, or fix the reference. Only files whose namespace is knowable are checked; a dynamic `useTranslation(ns)` falls back to "exists in some namespace" |
| 13 | Icon-only `<button>` with no accessible name | **`aria-label`** (or `title`) |
| 14 | `console.log` / `console.debug` / `debugger` | remove before shipping |
| 15 | `font-size: <n>px` in SCSS | **`var(--text-*)`**; the root `html { font-size }` is exempt |
| 16 | A class used from 2+ routes but defined in one route's SCSS (Vite ships it with that route's chunk only) | move it to **`src/styles/`**. The check counts only classes a **page** sheet *defines*: a class also defined globally, one owned by a component's own sheet, and a *scoped override* (`.page--fill .component-class`, `.a.b`) are not ownership. `scripts/global-classes-baseline.txt` is a ratchet and is **0** — a new page-owned shared class fails the check. `pages/ontology/ontology-admin.scss` no longer acts as an app sheet (its shared half is `src/styles/design-system/_console.scss`) |
| 17 | New hand-rolled `console-modal-overlay` markup (dialog migration debt) | **`<Dialog>`** — every hand-rolled modal is gone (`scripts/legacy-modals-baseline.txt` is **0**, so a new one fails the check). The dead `.console-modal-overlay` / `.console-modal` / `-header` / `-body` / `-actions` chrome and the legacy field rules that were scoped to `.console-modal-body` were deleted with them; the content-level helpers (`.console-modal-hint`, `-section`, `-fk-*`, `-index-*`) remain |

**`check:styles` is currently clean** (all pre-existing findings cleared: the two over-long files were split, the raw `px` media query / `rgba` backdrop / `window.confirm` / A2UI overlay allowlist entry are gone or justified). Keep it that way — a new finding should be fixed, not allowlisted.

Run **`check:app-layout`** when editing **`App.scss`**, **`app-page.scss`**, **`ChannelSectionLayout*`**, **`MainLayout.tsx`**.

## Which control do I use?

Reach for a **shared primitive** before writing markup. The list below is the answer to
"how do I build X here?" — each row is what the rest of the app already does.

| Need | Use | Notes |
|------|-----|-------|
| Labelled field (text / number / select / textarea) | **`<FormField label hint>`** from `styles/design-system` | supplies ids, label, hint, and the control skin |
| A control with no visible label | **`className="ds-control"`** | same skin, standalone |
| Checkbox / switch row | **`.ds-check-row`** (or `<CheckRow>`) | never a bare `<input type=checkbox>` |
| Multi-select list (pick several) | **`<CheckList>` + `<CheckListItem>`** | scrollable, uses the shared checkbox skin |
| Buttons | **`btn btn-primary` / `btn-secondary` / `btn-danger`** | `btn-danger` for destructive actions only |
| Destructive action (delete, purge) | **`.ontology-danger-zone`** + **`btn-danger`** + **`useConfirm()`** | never `window.confirm` |
| Confirm / blocking prompt | **`useConfirm()`** (`ConfirmProvider` in `MainLayout`) | |
| Modal dialog | **`<Dialog>`** (`_dialog.scss`) | `size="sm|md|lg"`, `footer` slot |
| Panel / section header with actions | **`<PanelToolbar leading tabs actions>`** | actions are pushed right |
| Whole detail page with several sections | **`<EntityViewShell>` + `navItems`** (see the dataset and semantic-model pages) | sidebar identity + routed sections |
| Collapsible section | **`<EntityViewPanel title defaultCollapsed>`** | not a hand-rolled `<details>` |
| Card surface | **`.account-card`** / **`<EntityViewPanel>`** | |
| Tabs | page-local tab row (KB) **or** `EntityViewShell` nav | no `ds-tabs` primitive exists |
| Pagination | **`<Pagination>`** | server-side when the API supports it, otherwise slice |
| Empty / loading state | **`<EmptyState>`** / `console-loading` | |
| Search box | **`.console-datasets-search`** (list) or `ds-control` (in a header) | no primitive; do not invent a third |
| Row actions | **`<TableRowActions>`** / **`.table-row-actions`** | |
| Table | **`.ds-table-wrap`** (+ `.ds-table-wrap--flush`) + `.console-table` | |
| Overlay backdrop / stacking | **`var(--overlay-backdrop)`**, **`var(--z-*)`** | |

**No primitive exists yet** — build it, but keep it honest:

| Thing | Where the CSS lives |
|-------|--------------------|
| Chip / tag (e.g. the Playground's group-by chips) | page-local (`.playground__chip`), styled to match `.model-scope__chip` |
| Code / YAML / SQL block | page-local (`<pre>` + a small class) |
| Right-docked drawer (the Ossie document inspector) | page-local `.model-yaml`, using `--z-modal` + `--overlay-backdrop`; a deliberate `<Dialog>` exception (see § Style guardrails) |

**The trap that keeps biting:** a page-local `*__toolbar` / tab stylesheet ships **only in its own
lazy route chunk**, so reusing it from another page silently loses the layout (this is how the model
page's Add buttons ended up unstyled). Shared looks belong in `src/styles/design-system/` (loaded by
`src/index.scss`) — see the `_tabs.scss` note in the git history for that lesson.

## New feature stylesheet

```scss
@use '../../styles/design-system/mixins' as *;
@use '../../styles/design-system/tokens' as ds;
```

(Adjust `../` depth for `components/` vs `pages/`.)

## Updating this doc

When shared SCSS, tokens, guard rules, or cross-route React primitives change, update this file. If **`design-system/`** layout changes, also refresh the frontend section in **[architecture.md](architecture.md)**.
