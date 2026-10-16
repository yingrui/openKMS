# Tremor evaluation (report visualisation)

**Asked for:** look at [tremor.so](https://www.tremor.so/) — reported as a good frontend component
library. This note records what it is, what it would cost here, and what we take from it.

## What it is (verified, not assumed)

| Fact | Value | How it was checked |
|------|-------|--------------------|
| Package | `@tremor/react` **3.18.7** ("The React library to build dashboards faster.") | `npm view @tremor/react` |
| Licence | **Apache-2.0** | `npm view @tremor/react license` |
| Its own deps | **`recharts ^2.13.3`**, `tailwind-merge`, `@headlessui/react`, `@floating-ui/react`, `date-fns`, `react-day-picker` | `npm view @tremor/react dependencies` |
| Peer React | **`^18.0.0`** (a 4.0 line exists as `4.0.0-beta-*` only) | `npm view @tremor/react peerDependencies versions` |
| Size | ~494 KB unpacked, 436 files | `npm view @tremor/react dist.unpackedSize` |
| The site's own words | "**Copy-and-Paste Tailwind CSS UI Components** for Charts and Dashboards"; "Tremor Raw … requires **Tailwind CSS v4.0+**"; "**Tremor is joining Vercel**" | tremor.so/docs |
| What it exports | `Card` `Metric` `Text` `Title` `BadgeDelta` `DeltaBar` `BarList` `CategoryBar` `MarkerBar` `ProgressBar` `ProgressCircle` `Tracker` `SparkAreaChart` `SparkLineChart` `SparkBarChart` `AreaChart` `BarChart` `ComboChart` `DonutChart` `LineChart` `ScatterChart` `FunnelChart` + inputs/overlays/`Table` | its published `dist/index.d.ts` |

So Tremor is **not a chart engine**: it is a *dashboard grammar* — KPI cards, deltas, sparklines,
ranked bar lists, trackers — drawn with **recharts** (the library we already use, one major version
behind us) and styled with **Tailwind**.

## Fit against our constraints

| Our constraint | Tremor | Verdict |
|----------------|--------|---------|
| React **19** | peer `^18`; React 19 only on beta | blocking |
| **One** styling system: SCSS + `--*` design tokens (`docs/design-system.md` is the source of truth) | Tailwind v4 utility classes, its own theme | blocking — two styling systems, two theming stories |
| One chart library, on its current major (`recharts` 3.10) | depends on `recharts ^2.13.3` | a second copy in the bundle (~+110 KB gz) and two chart runtimes behaving differently |
| Vendor neutrality | "Tremor is joining Vercel"; the v4 line is beta | concentration risk, and we already verify our supply chain |
| Our own primitives (`Dialog`, `Card`, `Table`, `Select`, `Tabs`, `Badge`, `Tooltip`, `FormField`, `CheckList`, `Metric`…) | 15+ overlapping components | adopting it would mean replacing the design system, or running two |

**Decision: do not take the dependency.** Every route to it is expensive: the *packaged* library
fights React 19 and our SCSS; the *Raw* (copy-paste) route still needs Tailwind v4 and would put
Tailwind-classed components inside a token-driven system.

## What it gets right — and what we adopt

Tremor looks good because of a **vocabulary**, not its CSS. A dashboard is not four line charts; it is
a KPI, a sparkline, a ranking, a trend. We already have the engine (recharts) and the primitives; what
was missing is that vocabulary, so we take it, on our stack, as `view` (the same field that already
said "line or bar"):

| Tremor | Ours (`view.kind`) | Why it matters |
|--------|--------------------|----------------|
| `Card` + `Metric` | **`metric`** — one number, big, with its label | half of a real dashboard is single numbers; we could only draw charts or tables |
| `BarList` | **`bar_list`** — ranked rows with value + share, plain CSS (no chart runtime) | ranking 8 industries reads far better as a list than as 8 bars, and it never clips long labels |
| `Metric` + `BadgeDelta` + `SparkLineChart` | **`metric` with `trend`** — the series' last value, the change against the previous one, and a sparkline drawn as CSS bars | the KPI card: the number matters, the shape is context. No chart runtime for 24 points |
| `Tracker` | **`tracker`** — a strip of blocks, intensity = value / largest | a year of months or a month of days of coverage/missingness in one line, without a threshold rule |
| `CategoryBar`, `ProgressBar`, `ProgressCircle` | *not yet* | they need targets/limits, which the data layer does not declare — inventing them would be a lie |
| `ComboChart`, `ScatterChart`, `FunnelChart`, `DateRangePicker` | *not yet* | real gaps; a date-range picker is the most likely next one |

## Styling lessons taken (separate from the vocabulary)

Tremor's `className`s are Tailwind utilities and are not portable here, but three of its *styling
habits* are, and they are now ours:

| Tremor's habit | Ours |
|----------------|------|
| Chart colours come from the **theme** (`chartColors`), not from the calling component — so a dark theme can lift them | `--report-series-1…8` in `_css-variables.scss`, with a dark-mode override; `ExplorerChart` picks a token per series and never names a hex |
| One **formatter** per surface (`valueFormatter` passed in, one rounding rule) | `reportFormat.ts` (`formatNumber` / `formatPercent`) — the KPI, the ranking, the strip and the chart tooltip all format the same way |
| Data surfaces are **cards with one rhythm** (`rounded-lg p-4` everywhere), never free-floating blocks | the app's section card (`EntityViewPanel` → `.account-card`) with the shared spacing scale; the Explorer's tiles are those cards, and `.account-card-head` now takes section actions |
| Skeletons while loading | **not taken** — the app uses one spinner idiom (`.console-loading` / `EntityViewLoading`); adding skeletons to one area would be the inconsistency, not the improvement |
| Density props, theme object | **not taken** — no consumer needs them, and a config surface nothing sets is dead weight |

**What would change this answer:** if the app ever adopted Tailwind (it will not — the design system
is the contract), or if we needed its date-range picker and combo/heatmap charts *now*; then copying
Tremor **Raw** components (Apache-2.0) is a legitimate option, with the Tailwind cost accepted
explicitly rather than by accident.

**Sources:** `npm view @tremor/react` (version, licence, deps, peers, size), the package's published
`dist/index.d.ts` (export surface), and `https://www.tremor.so/docs/getting-started/installation`
(React/Tailwind requirements, "joining Vercel"). Recorded 2026-10, at `@tremor/react` 3.18.7.
