# Research reports (static HTML)

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**. Open when the user wants a **research / data-analysis presentation** as a local static file.

Command catalogs stay in [commands-content.md](commands-content.md), [commands-ontology.md](commands-ontology.md), [commands-ops.md](commands-ops.md). This guide covers **pull data from openKMS → analyse → write HTML**. There is **no fixed deck schema and no report builder** — layout is yours.

## Recommended stack

**Reveal.js + Plotly.js** (CDN, single self-contained `.html` when possible):

- Reveal: slides, keyboard nav, overview (Esc), speaker notes (`S`)
- Plotly: interactive charts from standard `{ "data": [...], "layout": {...} }` (same shape as Python `fig.to_json()`)

Study and adapt the shipped examples (open in a browser — **arrow keys / page controls**, not scroll; numbers are illustrative):

| Example | Role |
|---------|------|
| [assets/report-examples/market-overview.html](../assets/report-examples/market-overview.html) | **Business style (dark)** — GTM / market review. Copy tone + structure; no platform jargon in slide copy. |
| [assets/report-examples/risk-breakdown.html](../assets/report-examples/risk-breakdown.html) | **Business style (light)** — risk / claims review. Same idea. |
| [assets/report-examples/openkms-product.html](../assets/report-examples/openkms-product.html) | **Product intro** — openKMS surfaces, skill CLI, Reveal + Plotly tips. Use when explaining the platform, not for customer/ops deliverables. |

For research deliverables, match the **business** examples: cite real-sounding business sources in footers (e.g. “CRM closed-won extract”), not `dataset:` / `kb:` ids in the visible deck — keep technical ids in your working notes if needed. Copy slide patterns (`disableLayout`, lazy Plotly + `Plots.resize` on `slidechanged`); do **not** treat examples as a required JSON format.

Other stacks (plain HTML, ECharts, …) are fine if the user asks — default recommendation is still Reveal + Plotly.

### Practical tips (from the examples)

1. Init Reveal with **`disableLayout: true`** and size slides in `vw`/`vh` (or call `Plotly.Plots.resize` on `slidechanged` / `fragmentshown` / `resize`) so hover targets stay aligned under CSS scale.
2. Transparent `paper_bgcolor` / `plot_bgcolor`; match chart fonts/colours to the slide theme.
3. Pin CDN versions; use **plotly-basic** unless you need 3D / maps / finance traces.
4. One insight per slide; cite **business** sources in the footer (extract name, as-of date). Keep openKMS resource ids in speaker notes or a private appendix if operators need them.

## Pipeline

```
cli.py (search / kb ask / ontology ask / datasets rows / functions execute)
  → local JSON / CSV
  → Agent aggregates + cites sources
  → Agent writes report.html (adapt an example or invent layout)
```

Output is **local files**. Do not upload to openKMS unless the user asks.

## Data sourcing

Match the question to a CLI path. Prefer structured rows over prose when you need charts.

| Need | Command | What you get |
|------|---------|--------------|
| Narrative / evidence | `search`, `kb ask`, `documents markdown`, `articles markdown`, `wiki get-page` | Text + citations |
| Graph facts / tables | `ontology ask` | `{columns, rows, answer, cypher, …}` |
| Raw tabular data | `datasets metadata --id ID` then `datasets rows --id ID --limit N --offset M` | Paginated rows; page until done |
| Computed metrics | `ontology functions execute-by-api-name --api-name … --input-json …` | Function JSON result |

Flags and gotchas: use `--help` and the command guides above. Do **not** invent HTTP paths.

## Analysis rules

1. **Aggregate before plotting.** Cap ~5k points per series. Prefer top-N + `"other"`, buckets, or percentiles — not raw dumps.
2. **Keep source ids** (dataset / doc / KB / Function api_name) next to claims.
3. **Never invent numbers.** If a cell is missing, omit the point or note the gap in prose.
4. **Write HTML yourself** — start from an example above when you want a strong default look.

## Example walkthrough

1. Open [market-overview.html](../assets/report-examples/market-overview.html) once to see the target quality.
2. Discover a dataset: `python scripts/cli.py datasets list`
3. Inspect columns: `python scripts/cli.py datasets metadata --id <id>`
4. Page rows and aggregate locally:

```bash
python scripts/cli.py datasets rows --id <id> --limit 500 --offset 0
# repeat offset until empty / short page
```

5. Optionally ground narrative: `kb ask` / `ontology ask` / `documents markdown`.
6. Write `report.html` (copy an example, swap data + copy, keep source ids).
7. Open in a browser: arrows, hover alignment, notes (`S`).

Recipe shorthand: [workflows.md](workflows.md) **I**.
