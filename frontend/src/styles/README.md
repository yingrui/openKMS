# Styles (SCSS design system)

## Entry

- **`src/index.scss`** — loads **`design-system/_css-variables`** (all `var(--*)` tokens) then **`design-system/_global`** (reset, links, `.btn*`, motion reduction) then **`design-system/_utilities`** (shared modifiers: page subtitle errors, table empty rows, error banner/boundary, flex helpers — avoids TSX `style={{}}` for static chrome).

## `src/styles/design-system/`

| File | Role |
|------|------|
| **`_css-variables.scss`** | **Source of truth for theming:** palette, semantic surfaces (error/warning/success/info), document status pill tokens, typography scale, **spacing** (`--space-*`, **`--gap-compact`** / **`--padding-compact-*`** for half-step rhythm), radius, shadows (**incl. `--shadow-elevated`**, modal scrim **`--overlay-backdrop`**), **z-index** layers, **motion**, focus ring vars, **`--color-surface` / `--color-bg-subtle` / `--color-muted` / `--color-fg`** aliases, **`@media print`** vars (**`--print-paper-bg`** / **`--print-ink`** / border + muted surfaces). `:root` + **`[data-theme='dark']`** overrides. |
| **`_tokens.scss`** | **Compile-time** mirrors: breakpoints (`$bp-*`), **`$grid-min-*`**, **`$playground-messages-*`**, **`$bp-dialog-sm`**, spacing (`$space-*` for `calc` / Sass), z-index (`$z-*`), `$km-layout-max`. Use with `@use '…/tokens' as ds`. |
| **`_mixins.scss`** | **`max-width` / `min-width`**, **`focus-ring-accent`**, **`text-truncate`**, **`motion-tokens`** (duration + easing; set `transition-property` yourself). `@use '…/mixins' as *` for bare `@include`. |
| **`_global.scss`** | Global reset, `body` / links, buttons (uses spacing + type + motion tokens). |
| **`_utilities.scss`** | Cross-route helpers (`.page-subtitle--error`, `.table-empty`, `.error-banner`, `.openkms-error-boundary*`, flex/spacing modifiers). Loaded once from `index.scss`. |
| **`_index.scss`** | Optional barrel: `@forward` tokens + mixins — `@use '../styles/design-system' as *` from a feature file (path depth varies). |
| **`knowledge-map/`** | Map-only compile-time sizes; `@use '…/knowledge-map/tokens' as km`. |

## Conventions

1. **Colors & surfaces** — Prefer **`var(--color-*)`**, **`var(--status-doc-*)`**, **`var(--color-*-bg)`** / **fg** / **border** so dark mode stays correct. Avoid new raw hex in feature SCSS unless print/PDF or a one-off chart.
2. **Spacing** — Prefer **`var(--space-*)`** for padding/gap/margin; use **`$space-*`** only inside `calc()` or Sass math.
3. **Type** — Prefer **`var(--text-*)`** + **`var(--text-*--line)`** for new UI; existing `rem` literals can migrate gradually.
4. **Breakpoints** — Use **`@include max-width(ds.$bp-md-min)`** (etc.) from **`_mixins.scss`** + **`_tokens.scss`**, not raw `@media` with magic pixels.
5. **Stacking** — Prefer **`z-index: var(--z-dropdown)`** (etc.) for overlays so layers stay consistent.
6. **Motion** — Use **`var(--duration-fast)`** / **`var(--ease-standard)`** (or **`@include motion-tokens`** plus an explicit **`transition-property`**); global stylesheet respects **`prefers-reduced-motion`**.
7. **TSX** — Prefer **`className`** + **`_utilities.scss`** / colocated SCSS for colors and spacing. Keep **`style={{…}}`** only for **data-driven geometry** (percent widths, tree indent from depth, crop box coordinates, CSS variables like `--home-knowledge-map-depth`).

## New feature stylesheet

Colocate **`Feature.scss`** next to the component, then:

```scss
@use '../../styles/design-system/mixins' as *;
@use '../../styles/design-system/tokens' as ds;
```

(Adjust `../` depth from `src/components/…` vs `src/pages/…`.)

Vite compiles SCSS with the **`sass`** package (`devDependency` in `package.json`).
