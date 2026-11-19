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
| **`_query-failure.scss`** / **`QueryFailureNotice.tsx`** | A failed query, told apart by cause (`definition` / `request` / `data`) with the driver detail folded away. Shared by the Playground and the Data Insights — **not** a page sheet, because both routes need it. |
| **`Dialog.tsx`** | The modal shell. `dismissOnOverlay` defaults to **false** (closing is deliberate); Escape and the close button always work. Only a pick-or-confirm dialog should opt into backdrop dismissal |
| **`_view-toggle.scss`** / **`ResourceViewToggle.tsx`** | The list / graph / card switch (`modes`). `labels` overrides a word when the page has a better one (`依赖图` rather than `图谱`) — the override reaches the visible label *and* the tooltip, so a page does not ship two words for one control. Do not hand-roll a segmented control, and do not borrow `.settings-page-tab` inside a panel: that is the page-level tab strip (elevated bar, negative margin), which reads as loose links anywhere else |
| **`_status.scss`** / **`StatusChip.tsx`** | A short state word (`draft` / `ready` / …) as a chip, so list pages stop inventing their own pill. Tones: neutral (default) / accent / ok / warn. |
| **`--report-series-1…8`** (`_css-variables.scss`) | The Data Insights's series palette — distinguishable hues for charts and rankings, **themed** (dark mode lifts them) rather than hard-coded in a component. A caller may retheme without touching TS. |
| **`--sql-keyword/string/number/comment/placeholder`** | Syntax colours for the SQL rule editor — a *code* palette, themed like the series, muted so code reads as code rather than as status. **`--color-selection`** is translucent on purpose: that selection sits over a highlight layer. |
| **`CheckList.tsx`** | Dense membership / filter lists (`CheckList` / `CheckListItem`). |
| **`_field.scss`** / **`FormField.tsx`** | Labeled text field stack (`.ds-field`) + shared control look (`.ds-control`). |
| **`_index.scss`** | Optional Sass barrel (`@forward` tokens + mixins). |
| **`knowledge-map/`** | Map-only compile-time sizes. |
| **`_a2ui-platform.scss`** | Shared **A2UI platform** theme: maps suite `var(--color-*)` → `--a2ui-*` tokens; COMPOSER-like Card elevation, type hierarchy, Modal/TextField/Button polish. Host surfaces add **`.a2ui-platform-surface`**; not app-specific recipes. |

Export surface for TSX: **`styles/design-system/index.ts`** (`Dialog`, `EmptyState`, `PanelToolbar`, `Metric` / `MetricGrid`, `CheckRow`, `CheckList` / `CheckListItem`, `FormField`, `Pagination`, …).

## A2UI platform surfaces

**Google A2UI** renders in Light DOM. openKMS hosts (Knowledge Map overview, …) wrap content in **`.a2ui-platform-surface`** and call **`ensureA2uiPlatformStyles()`** once at startup (`src/a2uiPlatform.ts` → `@a2ui/react/styles` `injectStyles()`). Product **Chamber** apps are module iframes — they do not use A2UI.

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
| **`<QueryFailureNotice>`** (`.query-failure*`) | A query failure — anywhere a query can fail. Pass the classified cause (`kind`) so a definition problem never reads like a data one; the label is localized by the caller. |
| **Icon actions in a table row** | use **`TableRowActionCell` → `TableRowActions` → `TableRowActionButton`** (16px icon, borderless, `variant="danger"` for delete). A cluster of `btn btn-secondary btn-sm` icon buttons — what the metric list had — reads as four competing buttons per row; the DS cell is `width: 1%` so it takes exactly the width of its icons. A navigating action is a `Link` with `className="ds-table-row-action"`, not a button |
| **`<StatusChip>`** (`.ds-status`) | A state word in a list or a header. Neutral by default; only reach for `ok` / `warn` when the state really is one. |
| **`<EntityViewPanel actions>`** | What acts on a section (edit / reorder / remove) belongs in the card head, not above the card — and it reveals on hover/focus-within so a reader is not looking at a button wall. |
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

4px grid — **`var(--space-*)`** in rules. Common: label↔control **`--space-2`**, form gap **`--space-3`**, card stack **`--space-5`**, actions **`--space-6`**, page header→content **`--space-6`**. App gutters: **`--app-page-padding-x/y`**, from exactly one owner — **`.app-content`**, **`.app-page-pane`**, or a
**`.ds-page`** (which renders inside rail layouts that do not pad the shell, so it carries the gutter itself; the shell
stops padding when it wraps one). Two of them is how list pages ended up 24px further in than the pages beside them. Half-step: **`--gap-compact`**, **`--padding-compact-*`**.

**Dividers do not stack.** `.entity-view__main .page-header` carries `padding-bottom` and a
`border-bottom` because content usually follows it directly. When a **tab strip** follows instead,
the strip already draws the top edge of the card — a page-local rule therefore cancels the header's
own padding and border (`:has(+ .settings-page-tabs)`, `:has(+ .settings-page)` in `entity-view.scss`).
Two adjacent dividers plus two paddings is what reads as "a large unexplained gap".

**Every routed tab of an `EntityViewShell` page opens the same way.** `EntityViewHeader` — the tab's name and one line
saying what it holds — then `EntityViewPanel` cards beneath it. The header takes at most one primary action on the
right; anything a reader adjusts between looks at the same data (a type filter, refresh) belongs in a light toolbar
*inside* the panel, and the table itself is `.ds-table-wrap--flush` + `.ds-table` with its `Pagination` in the
same wrap. A page-level `PanelToolbar` as the top of a tab is what makes one tab look unlike the next. A tab strip directly under the header
is the header's own card head — `entity-view.scss` cancels the header's divider for it (`:has(+ .settings-page-tabs)`).
Do not fight that rule by wrapping the strip in a div: a strip that no longer touches the card it switches is the one
shape that reads as broken. If a page's header is a real header (Save on the right) and the sections are not siblings of
one form, make the section a `navItems` entry in the shell's rail instead — that is what Catalog does with Sharing.

**Section navigation moves the pane, and the rail follows a line.** A `sectionId` item scrolls
`.entity-view__main` — never `scrollIntoView`, which walks every scrollable ancestor and (with the shell
pinned at `100dvh`) pushed the document up by hundreds of pixels, taking the header and the rail with it;
`overflow: hidden` on `body` does not stop a programmatic scroll. The highlight follows the thin strip under
the pane's top edge — not the top 40%, where a short section and the start of the next one both counted and
clicking "Knowledge" lit "Data and ontology". Two ends are special: at the very top nothing is highlighted
(the header is what is being read), and at the very end the last section is (a short last section never
reaches the top edge). The rule is `pickActiveSection` in `hooks/useActiveSection.ts`, recomputed on scroll
as well as on intersection change, because both end cases keep the same sections intersecting.

**A panel's `onChanged` must not unmount the panel.** When a section asks its page to re-read the entity
after a change, that re-read has to be *silent* (`load(true)` — no `loading` flag). Flipping the page into its
loading state replaces the whole subtree, and anything the section was holding — a just-minted token, a
half-typed field — goes with it. This is how a credential dialog showed a token that had already been thrown
away.

**On phone the rail moves above the content.** `EntityViewShell`'s sidebar is a fixed 220px column on
desktop; at `$bp-md-min` and below it becomes a horizontal, scrollable strip of `navItems` and `.entity-view__main`
takes the full width. A fixed rail beside a 390px viewport left the content ~170px wide, which wrapped every
heading and button one character per line — that is a shell rule, not a page rule, so it lives in
`styles/entity-view.scss` and every shell page gets it.

**A tab strip and its panel are one card.** `EntityViewShell` puts page children in `.account-stack`
(`gap: var(--space-5)`). Render `.settings-page-tabs` and `.settings-page-form` as siblings there and
the ancestor's gap opens a 25px hole between the two halves of the card — no page rule can cancel a
flex `gap`. Wrap both in one `<div className="settings-page">`. Pages living in
`.ontology-admin-content` (e.g. `ConnectorDetailPage`) have no such gap and may keep them as siblings.
**`.ds-page` is a class name, not an owner.** It has exactly one writer — `ListPage` — and that is
not an accident: the class is what a *list page* renders, and every page-shaped shell above it (`ListPage`,
EntityViewShell, `.ds-page`) is a design-system component. The old name was `ontology-admin`; the rename
was a one-component change plus the selectors that scope under it (`_console.scss`, `ontology-admin.scss`,
`app-page.scss`). The class still carries the list page's padding and max-width, so a future change to
that shell is still a design-system change, not a page edit.

**A class used by more than one area belongs to the design system.** The name is the address: a shared
capability called `console-*` or `ontology-admin-*` records which page needed it first, and the next page
copies the markup instead of the object. `scripts/check-shared-classes.py` fails when a non-`ds-*` class
is used by two or more areas and is not in its (shrinking) baseline — the entry disappears when the object
moves into the design system, not when the name changes. Page-local classes are unaffected: one area, one
owner.

The baseline separates two kinds of debt, and only one of them is a mistake to fix:

* **Legacy page-era names** (`console-*`, `ontology-admin-*`): the name records which page needed the thing
  first. When the object moves to the design system the name goes with it — that is what `ds-table`,
  `ds-loading`, `ListPage` and `ds-resource-list` did.
* **Feature-level shared styles** (`channel-page*`, `channel-table*`, `agents-*`, `files-rail-*`): a *product
  concept* three apps share (channels, agent workspaces), already in one shared stylesheet under `styles/`.
  Renaming those to `ds-*` would say they are generic primitives, which they are not; they stay recorded in
  the baseline so that a new area reaching for them is still a deliberate decision.

`scripts/check-page-chrome.py` flags the entity-view case, and — the other half of the same rule — a page
that renders `DatasetAppTabs` (a Catalog **list**) must not wrap its content in `settings-page-form`: that
is an elevated card with its own padding, so the same table and the same 14px text sit in a card on one
list page and on the page itself on the four beside it. A Catalog list is `page-header` + `DatasetAppTabs`
+ `.ontology-admin-content` + `.console-datasets-toolbar` + `.ds-table-wrap > .ds-table`.

**Buttons in one group share one size.** `.btn` and `.btn-sm` differ in padding (10px vs 6px) *and*
line height (`--text-md--line` vs `--text-sm--line`). Under `align-items: center` their boxes centre
on each other, so the edges land at different heights — it reads as two rows. Pick one size for the
group; do not nudge one of them with a margin. `scripts/check-button-rows.cjs` checks this in the
JSX tree (including components that render a trigger button, resolved from their definition).

**A local margin on `.page-subtitle` must be scoped.** The global rule is `margin: 0`
(`app-page.scss`). A colocated `.foo { margin-bottom: … }` ties on specificity, so it only applies if
its sheet loads last. Scope it (`settings-page-form .foo`) instead of relying on import order.

## App shell layout

**Goal:** one gutter source per scroll column — no stacked padding on shell + page root.

### App layers (Application / Ontology / Data)

The App Rail and the Home page group suite apps into three layers — `application` → `ontology` → `data` (top to bottom) — declared by `layer` in `frontend/src/config/appModules.ts`. The rail inserts a thin **`.sidebar-layer-divider`** between groups; the Home grid renders a titled section per layer (`.app-catalog-section-<layer>` + `.app-catalog-section-label`). Console stays outside the layers (shared platform). Group with **`groupModulesByLayer()`**; do not re-sort in UI code.

The header's **app launcher is gone**: it listed exactly what the rail lists, and `npm run check:app-modules` now asserts that — a module marked `showInLauncher` without `showInMainSidebar` would be reachable from nowhere.

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

**List toolbar** (`design-system/_console.scss`): **`.console-datasets-toolbar`**, **`.console-datasets-search`** (the search pill, magnifier inside), **`.console-datasets-filter`** (a labelled select). Shared by every list — the catalog, the audit log — so one toolbar does not drift into four.

**Shell classes** (`app-page.scss`): **`.app-page-pane`**, **`.app-page-shell`**, **`.app-page-section*`**, **`.page-header`**, **`.page-subtitle`**.

### Layout exceptions

| Pattern | Reason |
|---------|--------|
| `.app-content--search` | Wider search gutters |
| `.app-content--with-rail` (and `--with-channel-rail`, `--with-ontology-*`) → `padding: 0` | **A page with its own left rail** — the gutter moves onto `.app-page-pane` (the main column) so the rail runs to the window edge. The audit log at `/audit-log` uses the generic `--with-rail`; `MainLayout` adds it per route |
| `.app-content--function-editor-workspace` | Full-height IDE |
| `.app-content--chamber-run` → `padding: 0` | Chamber Run gutters on `.chamber-page--run` (not editor workspace) |
| `.app-content--compact:has(.kb-detail--qa-fullpage)` | KB Q&A full page |
| `.app-content--compact .wiki-page-editor-outer` | Wiki editor edge-to-edge |
| `body.openkms-kb-qa-fullpage` / `openkms-agents-fullpage` | Hide header (rail keeps Home + account — see **Immersive views**); phone IA (≤ `$bp-md-min`) is chat-primary + full-width Sessions / Chats panel (Agents also has Files) — not a stacked rail that eats chat height |
| `.app-content--object-explorer` | Flex fill, token padding |
| `.app-page-pane:has(> .entity-view)` | Ontology Manager entity detail fills the pane; scroll inside `.entity-view__main` only |
| Route rendering `EntityViewShell` outside a pane | A shell only fills the window when a `.app-page-pane` is above it; without one the sidebar's right rule stops at the end of its own content. Put the route in `PagePaneLayout` (or the ontology rail layout) — `scripts/check-entity-view-routes.py` fails otherwise |
| `body:has(.app-page-pane > .entity-view)` (entity-view.scss) | Entity detail (`/datasets/:id`, `/data-model/:modelId`, `/knowledge-bases/:id`) has no rail marker to opt into the full-height chain, so the shell asks for it; `.app-content` gives up its padding to the pane. **These rules key on the direct child**, so **nothing may wrap `.entity-view`**: put page-level chrome (the comments shell, a provider that renders an element) *inside* the shell. A wrapper in between silently restores `.app-content`'s gutter on top of the pane's — two gutters, and no window-height chain |

New exceptions: one-line SCSS comment + row here.

### Large TS/TSX files

Reference: **`DocumentDetail`** — thin route entry + splits by concern:

| Suffix | Role |
|--------|------|
| `X.tsx` | Route entry — layout wiring |
| `useX.ts(x)` | Fetch, mutations, derived state |
| `X.splitPanel.tsx` / `X.infoPanel.tsx` | Layout regions |
| `X.modals.tsx` / `X.dialogs.tsx` | Dialogs |
| `X.types.ts` / `X.utils.ts` | Types, pure helpers |

Soft limit **700 lines** per TS/TSX file under `src/` — pages, hooks, API clients and graph models (enforced by **`check:styles`** allowlist — shrink the allowlist, do not grow it).

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
| **`entity-view.scss`** | The detail-page shell (`EntityViewShell`) — identity rail, nav, panels, and the pane layout exceptions. Shared, because every detail page renders the shell |
| **`report-view.scss`** | The Data Insights's report views — `metric` (a number, or a KPI with a trend), `bar_list` (a ranking), `tracker` (a coverage strip), and the chart host. Global **because the same components render in "save this query"**, which the Playground and the Data tab open |
| **`files-rail.scss`** | The right-hand files rail, chrome only: **`.files-rail-head`** (title row, back button, **`.files-rail-icon-btn`**, **`.files-rail-chip`**), **`.files-rail-toggle`** (the chip shown while the rail is collapsed), **`.files-rail-resize-handle`**, and the flat-list rows (**`.files-rail-row`**) the KB conversation renders. Shared because the project agent and the KB conversation dock the same rail; what is *inside* is not shared (a tree + viewer there, this conversation's artifacts here) |

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

## Renaming — or deleting — a class

A class edit has **two halves** (the SCSS and every `className`), and the missing half is silent:
no type error, no failing test, just something unstyled. Three times, each from a *mechanical* edit:

* `className="explorer-chart"` survived a rename to `.report-chart`, so the chart host lost its
  height;
* the report views' styles lived in one page's sheet while another route rendered them (a move's
  other half);
* tidying a sheet with a **line-range slice** cut `.dashboard-narrative` and its editor, and the
  narrative was a bare browser textarea until a reader said so.

So there are two checks, and both are worth running after a class edit:

```bash
python3 scripts/check-undefined-classes.py            # a class used in JSX exists in some sheet
python3 scripts/check-global-classes.py               # a shared class is not page-owned
rm -rf dist && npm run build && rg -l '\.class-name\b' dist/assets/*.css   # what shipped
# Clear dist first: chunk names are hashed, so a stale build leaves *older* files beside the new ones
# and a "missing" class may just be a stale file. And grep **all** chunks, never "the newest" — a
# shared sheet lands in whichever chunk imports its component (here: EntityViewShell-*.css).
```

The first is rule 11 in the list below (83 accepted classes style nothing today — dead markup or a
real gap — and the file only shrinks). It is deliberately flat: tokens, not ownership, because SCSS
nesting and compound selectors made a cleverer version wrong often enough to be ignored.

## Renaming a class

A rename is a **two-file edit** (the SCSS and every `className`), and the second half fails silently:
`className="explorer-chart"` survived a rename to `.report-chart` and the chart host quietly lost its
height — no type error, no test failure. So after renaming in a layout-critical sheet, check the build
output, which is the ground truth about what shipped:

```bash
npm run build && rg -l '\.new-class-name\b' dist/assets/*.css   # global sheet → index-*.css
rg -n 'old-class-name' src --glob '*.tsx' --glob '*.scss'          # no stragglers
```

(An "undefined class" checker was written and dropped: SCSS nesting and compound selectors
(`.a.b`) make the static answer wrong often enough — four false positives on the very files it was
meant to protect — that it would have been a checker nobody trusts.)

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
| `check:lint` | eslint, ratcheted: `scripts/eslint-baseline.txt` freezes the errors we have — a file that *gains* one fails. The baseline is **0**, and `eslint-disable` is **banned** (like `# noqa` in `backend/check.sh`): fix the finding instead. History — `react-hooks/refs` (108) came from view-models that return refs, because React's compiler flags **every** property read on an object containing a ref, so a hook's refs stay private (expose behaviour) and the view-model is destructured at the call site; `react-hooks/set-state-in-effect` (16) and `react-refresh/only-export-components` (19) are gone too (render-time state adjustment, and non-component exports moved to their own modules) |
| `test` | vitest |

**`check-shared-styles.sh`** (`npm run check:styles`) — allowlists are **known debt, not permission**:

| # | Blocks | Use instead |
|---|--------|-------------|
| 1 | Page importing another page's SCSS | Move rules to **`src/styles/`** |
| 2 | `matchMedia` outside `useIsMobile.ts` | **`useIsMobile()`** |
| 3 | Raw `px` in `@media` / `@include max-width(Npx)` | **`ds.$bp-*`** tokens |
| 4 | `MOBILE_BREAKPOINT_PX` ≠ `$bp-md-min` | Keep TS and Sass in sync |
| 5 | Multiple **`<TableRowActions>`** per channel row | One instance in **`.channel-item-actions`** |
| 6 | New `*-table-wrap` class | **`.ds-table-wrap`** (a bounded grid adds **`--scroll`**: the wrap scrolls, headers stick to it, the chrome around it stays put) |
| 7 | New `*-modal-overlay` / `*-dialog-overlay` | **`<Dialog>`** |
| 8 | `window.confirm(` | **`useConfirm()`** |
| 9 | Raw `rgba(0,0,0,…)` modal backdrop | **`var(--overlay-backdrop)`** |
| 10 | New TS/TSX file under `src/` > 700 lines | Split like **`DocumentDetail`**; the gate covers `pages/`, `contexts/`, `components/`, `data/` and `graph/` |
| 11 | `var(--token)` that no stylesheet defines | use a token from **`_css-variables.scss`** (or add an alias there). An undefined custom property does not fall back to a theme colour — `fill` becomes black, `stroke` disappears. `scripts/check-undefined-tokens.py` (inside `check:styles`) keeps the set closed; it ignores a `var(--x, fallback)` and names built at build time |
| 12 | `select` / text `input` with no skin (outside `<FormField>`, no `.ds-control`) | **`<FormField>`**, or **`className="ds-control"`**; use **`ds-control ds-control--compact`** when a dense wrapper owns the padding/type. `scripts/ds-controls-baseline.txt` freezes the remaining **16** bespoke controls — a file only fails when it *adds* one |
| 11b | A **built** key (`` t(`detail.tabs.${tab}`) ``) missing one member | The guardrail only checks the **prefix** exists, so adding a tab without its word ships the raw key. Pair every enumerable key set with a test that asserts the list and the locale name the same members (`KnowledgeBaseDetail.types.test.ts` does this for `TAB_ORDER`) |
| 12 | `t('key')` missing from the locale files (i18next prints the key, so the UI shows `dataModel.removeDimension`) | add the key, or fix the reference. Only files whose namespace is knowable are checked; a dynamic `useTranslation(ns)` falls back to "exists in some namespace" |
| 13 | Icon-only `<button>` with no accessible name | **`aria-label`** (or `title`) |
| 14 | `console.log` / `console.debug` / `debugger` | remove before shipping |
| 15b | A stylesheet in `src/components/**` **or `src/styles/**`** that nothing loads | add the `import './X.scss'`, or `@use` it from a sheet that is loaded. Writing both halves and skipping the import leaves every rule in a file no bundle loads. Sass imports are resolved (`@use 'x'` → `_x.scss` or `x/_index.scss`), because a partial is loaded through its parent, not by name. `scripts/check-component-sheets.py`. The `src/styles/**` half exists for one bug: the metric dependency graph's rules sat in an unimported `metrics.scss`, so every SVG `<rect>` painted **black** — an unstyled rect has no fill and no stroke, and neither the dead-class gate nor the build can see a file nobody links. `_index.scss` barrels are exempt: they only forward tokens/mixins, so they emit no CSS |
| 15 | `font-size: <n>px` in SCSS | **`var(--text-*)`**; the root `html { font-size }` is exempt |
| 16 | A class used by 2+ **routes** but defined in one route's SCSS (Vite ships it with that route's chunk only) | move it to **`src/styles/`**. Route membership comes from the import graph rooted at the lazily-imported pages in `App.tsx`, so two sections of *one* area count as two routes — an earlier area-based version missed exactly that (the report view styles lived in what is now `data-insights.scss` while the Playground and the Data tab rendered the same components). The check counts only classes a **page** sheet *defines*: a class also defined globally, one owned by a component's colocated sheet, and a *scoped override* (`.page--fill .component-class`, `.a.b`) are not ownership. `scripts/global-classes-baseline.txt` is a ratchet (**28** today, all pre-existing): fixing one is fine, adding one fails. The last one to leave was `entity-view__readonly` — the "nothing here yet" line, used by ~10 pages across several routes and defined in one page's sheet, so every other page rendered it unstyled |
| 20 | A `ds-table-wrap` inside an `EntityViewPanel` without **`--flush`** | `EntityViewPanel` **is** `.account-card` (border, radius, shadow, padding), so a table wrap keeps its own border and radius on top: a rounded card inside a rounded card. `--flush` is the documented answer — one grep, and it lists the seven places that had it |
| 19 | `.ds-table-wrap` without **`flex-shrink: 0`** | It **clips** (`overflow-y: hidden`) and is used as a flex item: a column flex parent shrinks it to the available height and the clip silently eats its last rows — and whatever sits under them. This is how the audit log's pagination went invisible: in the DOM, inside the card, clipped by 16 px. A card that clips must keep its height; the scroll container above it scrolls |
| 18 | A request with `body: JSON.stringify(…)` and **no `headers:`** | add **`'Content-Type': 'application/json'`** — `fetch` does not default to JSON, so the body reaches the server as a string and FastAPI answers *"Input should be a valid dictionary or object to extract fields from"*, which names neither the cause nor the file. Checks the shape, not the value: a headers object that is missing the type is not detected (and not claimed to be) |
| 17 | Hand-rolled modal chrome — any element whose class ends in **`-overlay`** that is not the DS dialog | **`<Dialog>`** (focus trap, Escape, scroll lock, `90dvh` cap). The old gate grepped one name, `console-modal-overlay`, so the migration looked finished once that name was gone: **35 copies** were still there under `glossary-dialog-overlay`, `sreview-modal-overlay`, `channel-page-modal-overlay`, `picker-overlay`… The gate counts the shape now and `scripts/modal-overlays-baseline.txt` is **0** — all 35 were migrated. The content-level helpers are dialog chrome too: `.console-modal-hint` / `-section` became `.ds-dialog__hint*` / `.ds-dialog__section*` in `_dialog.scss` |

| 21 | A page/component sheet defining its own table row-actions cell (`*-actions-col`, `*-row-actions`, `*-actions-cell`) | **`TableRowActionCell` / `TableRowActions` / `TableRowActionButton`**. The DS cell is `width: 1%; nowrap`, so it takes exactly what it holds; a page-local copy cannot know that in advance — `.eval-items-actions-col` was 80 px, right for two icon buttons and too narrow for a labelled button plus an icon, whose actions then ran off the right edge with no scrollbar to say so. `scripts/check-row-actions.py`, baseline **0** — the seven copies that existed were migrated; `src/styles/**` may define shared ones |

| 29 | A `<label>` with text beside a `.ds-control` **and no flex row** | `.ds-control` is a block (a form field stacks label over control), so a plain inline label pushes the control onto its own line — 状态 / 严重级别 filters rendered label-above-select this way. Fixed at the primitive: `label:not(.ds-field) > .ds-control { display: inline-block; width: auto }`, and `.console-datasets-filter` is an `inline-flex` row (`align-items: center`, `gap`, `nowrap`). `<FormField>` renders `label.ds-field`, so fields keep the stacked layout |
| 22 | A `<label>` laid out as a flex **row** with its control and a text `<span>`, without **`white-space: nowrap`** | The row shrinks the label to its minimum content width before it shrinks the select, so a Chinese label breaks between characters — 类型 rendered as 类 / 型, one per line, in the run-history toolbar. Latin text overflows instead, which is why it goes unnoticed in review. Column labels and checkbox / radio / file labels are exempt: they are meant to wrap. `scripts/check-inline-labels.py`, baseline **0** |

| 23 | A rule whose selector classes appear nowhere in `src/**/*.ts(x)` | delete it. CSS rots one way: the component changes and the rules stay, so a sheet keeps a dead half and the next reader cannot tell which half is real — `EvaluationDatasetDetail.scss` was 897 lines, 41 rules deep into a page that no longer existed, and 272 such blocks were spread over 128 sheets. A class is used if it appears as a token, as the base of a `--modifier` / `__element`, or as a template-literal prefix (`` `eval-report-finding--${area}` ``); `&` rules and vendor classes (`.cm-editor`, `.a2ui*`) are exempt. `scripts/check-dead-classes.py`, baseline **0** |

| 26 | A **retired Chinese term** reappearing (演练场 / 查询台 / 操场 / 质量问题) | the word that replaced it (`即席查询`, `数据质量`). Terminology is not cosmetic: 演练场 and 查询台 named the same page, and 质量问题 was a dataset-checks list sitting beside 指标勾稽. `scripts/check-terminology.py`, baseline **0** — adding a retired word is a one-line, deliberate decision |
| 27 | An operand-to-words call (`conditionLabel`, `conditionScopeNote`) **without both** `metricName` and `datasetName` | the missing one. A page that passed only `metricName` printed `b77c2c08…: count(*) != 1620` for a dataset operand — a lookup object's optional field, invisible to the type-checker. `scripts/check-label-lookups.py`, baseline **0** |
| 28 | A dialog whose body is a form, closing on a backdrop click | `<Dialog dismissOnOverlay={false}>` — which is now the **default**: a form with six fields must not vanish because the pointer landed a few pixels outside it. Short pick-or-confirm dialogs may opt in |
| 30 | A class used by **two or more areas** that is not named `ds-*` | move the object into the design system (or keep it page-local — one area, one owner). The name is the address: `console-table`, `console-loading`, `console-datasets-toolbar`, `console-form-control`, `console-modal-*`, `resource-list` were all shared capabilities named after the page that first needed them; each became `ds-table`, `ds-loading`, `ListToolbar`/`SearchField`/`FilterSelect`, `.ds-control`, `ds-dialog__*`, `ds-resource-list*`. `scripts/check-shared-classes.py`, baseline **115** — all feature-level styles three apps share on purpose (`channel-*`, `agents-*`, `files-rail-*`) — renaming those to `ds-*` would claim they are generic primitives |
| 31 | A **list** page that spells out the shell (`.ds-page` + `page-header` + tab strip + `ontology-admin-content`) | **`<ListPage title subtitle actions tabs toolbar>`** — five Catalog lists had drifted into five variants of it (one wrapped its table in the settings card, one put its switch at a different size, two borrowed another page's name style). `scripts/check-page-chrome.py`, baseline **0**; the one listed exception is a detail page (its own in-page tabs), which the entity-view guard owns |
| 32 | A Catalog list's name cell styled by hand (`<strong>`, a page-local link class, another area's class) | **`.ds-table-primary`** (14px / 600 / text colour). The dataset and model lists had borrowed `.ontology-manager-list__api-link` — the ontology manager's 13px monospace API-name style — so their names were a size smaller than every sibling list's |
| 24 | Hardcoded user-visible copy in JSX — a text node, or a literal `title` / `aria-label` / `placeholder` / `alt` | **`t()`**, with `<Trans>` where the sentence carries markup. The page then renders one language inside another's chrome; for attributes the audience is a screen reader or a tooltip, which nobody reviews. `<Trans>` children (the English fallback for a key), data values (timezone ids, file names, sample ids) and identifier-shaped placeholders are exempt. `scripts/check-hardcoded-text.py`, baseline **0** |

**`check:styles` is currently clean** (all pre-existing findings cleared: the two over-long files were split, the raw `px` media query / `rgba` backdrop / `window.confirm` / A2UI overlay allowlist entry are gone or justified). Keep it that way — a new finding should be fixed, not allowlisted.

Run **`check:app-layout`** when editing **`App.scss`**, **`app-page.scss`**, **`ChannelSectionLayout*`**, **`MainLayout.tsx`**.

### Local visual review

Screenshots are **review artifacts**, not a CI gate and not committed. `npm run screenshot` drives the
system Chrome over CDP (no Playwright dependency) and writes to **`tmp/visual/`**, which `.gitignore`
excludes via `**/tmp`:

```bash
cd frontend
npm run screenshot -- --cookie "$OPENKMS_SESSION_COOKIE" --path / --path /datasets
npm run screenshot -- --path /settings --viewport desktop --full-page
```

The script renders desktop (1440×900) and mobile (390×844) by default; pass `--base-url` when Vite is
not on `http://localhost:5173`, `--check-overflow` to print pages wider than the viewport, and `--help`
for every option. A logged-out run still captures public or login pages. Because the baseline images are deliberately outside git, this is **not** a CI visual
regression check; a real gate would need an external baseline store or a visual-testing service.

## Which control do I use?

Reach for a **shared primitive** before writing markup. The list below is the answer to
"how do I build X here?" — each row is what the rest of the app already does.

| Need | Use | Notes |
|------|-----|-------|
| Labelled field (text / number / select / textarea) | **`<FormField label hint>`** from `styles/design-system` | supplies ids, label, hint, and the control skin |
| A control with no visible label | **`className="ds-control"`** | same skin, standalone |
| A SQL query field | **`<SqlEditor>`** from `components/quality` | a textarea with syntax highlighting, **zero dependencies** (the textarea stays the input, a `<pre>` behind it paints). The two layers must lay text out identically — `join(highlightSql(x)) === x` is a test, not a hope. Tab indents |
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
| Tabs | **`.settings-page-tabs` + `.settings-page-form`** (shared, `src/styles/settings-page.scss`) for page sections; `EntityViewShell` nav when the page is an entity detail (datasets, semantic models, knowledge bases) — a page-local tab row only where no shell applies | no `ds-tabs` primitive exists. A page that uses these classes **must import `settings-page.scss`** — the class names match nothing otherwise, which renders unstyled buttons and a white gap where the card belongs. Inside `EntityViewShell`, wrap the strip and the panel in one **`.settings-page`** so `.account-stack`'s gap cannot split the card |
| Pagination | **`<Pagination>`** | server-side when the API supports it, otherwise slice |
| Empty / loading state | **`<EmptyState>`** / `console-loading` | |
| Search box | **`<SearchField>`** (`.ds-search`) and **`<FilterSelect>`** (`.ds-filter`) | one primitive for list toolbars and panel headers; pass `label` / `placeholder` / `className` / `disabled` / `autoFocus`. Do not hand-roll another magnifier + input wrapper |
| Row actions | **`<TableRowActions>`** / **`.table-row-actions`** | |
| Table | **`.ds-table-wrap`** (+ `.ds-table-wrap--flush`) + `.ds-table` (a row's name: `.ds-table-primary`) | |
| Overlay backdrop / stacking | **`var(--overlay-backdrop)`**, **`var(--z-*)`** | |

**No primitive exists yet** — build it, but keep it honest:

| Thing | Where the CSS lives |
|-------|--------------------|
| Chip / tag (e.g. the Playground's group-by chips) | page-local (`.playground__chip`) |
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
