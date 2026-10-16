# Chart library selection (Data Explorer)

**Revisited (2026-10):** [Tremor](tremor-evaluation.md) was suggested as an alternative — it is a
*Tailwind*-styled dashboard grammar built **on** recharts (peer React 18), so we kept recharts and
adopted Tremor's vocabulary instead (`view.kind` = chart / metric / bar list).

**Context.** The Data Explorer's blocks hold a query's `columns`/`rows`. Drawing them needs a chart
library in the SPA. Scope is deliberately small — **line and bar, no dashboards, no pivot** — so the
evaluation weighs licence, React fit and bundle cost, not feature count.

## Candidates

| Library | Licence | React fit | Weight (min+gz) | Notes |
|---------|---------|-----------|-----------------|-------|
| **recharts** | MIT | Declarative components, React 19 peer support | ~110 KB, tree-shakeable | SVG; axes/tooltip/legend out of the box; the de-facto React choice |
| Apache ECharts | Apache-2.0 | Imperative `setOption`, wrapped by hand or `echarts-for-react` | ~350 KB | Strongest feature set; overkill and imperative here |
| visx | MIT | Low-level primitives (Airbnb) | modular | Full control, but axes/scales/legend are ours to build — too much for two chart types |
| Plotly.js | MIT | Imperative; `react-plotly.js` wrapper | ~1 MB+ | Already used for **static report HTML** in the skill; far too heavy for the SPA |
| Chart.js | MIT | Canvas + wrapper | ~70 KB | Canvas means no DOM-level a11y/tooltips as nodes; wrapper adds a layer |

## Decision

**recharts.** MIT (vendor-neutral, no attribution requirement beyond the licence), first-class React
19 support, declarative enough that a series is one element per column, and the two chart types we
need are its bread and butter. The repo already ships mermaid + three.js + CodeMirror, so a ~110 KB
chart library is not the binding constraint — API fit and licence are.

Kept out on purpose: canvas (Chart.js) because SVG keeps ticks and tooltips as real DOM, and Plotly
because the static-HTML report path already covers heavy/exportable charts.

**Contract this choice does not affect:** a block's `chart` is presentation only. The query belongs
to the source (a dataset rows/summary query, or a model metric query), a run writes the rows, and a
spec the result cannot satisfy falls back to the table. Swapping the drawing library later changes
one component (`ExplorerChart.tsx`), not the document or the API.
