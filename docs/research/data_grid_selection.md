# Data grid selection — Datasets data view

Technical evaluation for the Datasets **Data** tab, which must grow from a read-only preview into a **large-dataset, editable data grid** (inline row editing for data maintenance). Selection weighs **mainstream adoption** and **software-supply-chain safety (China)** alongside compatibility with React 19.2 / Vite 7 / TS 5.9 and the in-house design system.

**Status:** draft — no library chosen. Companion to [Data layer plan](../features/data-layer.md) / [Interaction design](../features/data-layer-interaction.md).

---

## Requirements

| # | Requirement | Implication |
|---|-------------|-------------|
| R1 | **Large datasets, real paging** — no 500-row ceiling | Server-side **cursor paging + stable sort/filter**; client must not assume the whole table fits. |
| R2 | **Inline editing** of row data (data maintenance) | Editable cells by type, dirty-state, save/discard, batch update API. |
| R3 | React **19.2** + Vite 7 + TS 5.9 | Library peer range must include React 19. |
| R4 | Keep the **in-house design system** (`.console-table`, tokens) | Prefer **headless**; a styled design system (antd/MUI) forces a parallel visual language. |
| R5 | **China supply-chain safety** | Permissive license, mainstream, vendor-neutral, mirror-installable, **vendorable/forkable**, low discontinuation risk. |

---

## Criteria

1. Mainstream adoption (downloads, maintenance recency).
2. React 19 compatibility (peer range).
3. Headless vs styled (design-system fit).
4. Editing capability (cell/row editors, batch).
5. License (permissive vs commercial).
6. Supply chain (origin/maintainer, vendor lock, discontinuation risk, provenance, mirrors).
7. Performance (row/column virtualization).

---

## Candidates (npm facts, 2026-10)

| Package | Weekly DL | License | React peer | Maintainer / origin | Notes |
|---------|-----------|---------|-----------|---------------------|-------|
| **@tanstack/react-table** | **24.0M** | MIT | `>=18` | TanStack (community/company, US) | **Headless**; de-facto standard; no built-in editors |
| **antd** | 3.8M | MIT | `>=18` | Ant Group / Alibaba (CN) | Full design system; Chinese-origin; strong CN ecosystem |
| **@mui/x-data-grid** | 3.2M | MIT (community) | `^17–19` | MUI (company, US) | Pro/Premium (pivot, aggregation) are **commercial**; brings MUI |
| **ag-grid-react** | 2.7M | MIT (community) | `^16.8–19` | AG Grid Ltd (UK) | Editing/enterprise (batch, SSRM) **commercial** |
| **react-data-grid** | 0.75M | MIT | `^19.2` | Comcast (US) | Latest is **7.0.0-beta** → stability risk |
| **@glideapps/glide-data-grid** | 0.37M | MIT | `^16.12 || 17 || 18` | Glide (US) | **React 19 not in peer range**; canvas rendering |
| **handsontable** | 0.34M | **commercial** (`SEE LICENSE`) | — | Handsontable (company) | Spreadsheet editors; **non-free** for commercial |
| **@douyinfe/semi-ui** | 26K | MIT | `>=16` | ByteDance (CN) | Full design system; low adoption |
| **@arco-design/web-react** | 54K | MIT | `>=16` | ByteDance (CN) | Full design system; low adoption |
| **@visactor/vtable** | 28K | MIT | framework-agnostic (canvas) | ByteDance VisActor (CN) | High-perf canvas grid; CN-origin; low adoption |

---

## Supply-chain analysis (China)

- **Commercial licenses are a first-class risk.** Handsontable is non-free; **AG Grid Enterprise** and **MUI X Pro/Premium** keep exactly the advanced grid/editing features behind a paid license. For a "modify data" feature these are the parts you actually need → vendor lock + procurement exposure.
- **Single-US-company vendors** (Glide, MUI, AG Grid, Comcast) carry **continuation risk** — the library can be relicensed, discontinued, or region-restricted. AG Grid and MUI are UK/US companies; Glide is a small startup.
- **Permissive + widely adopted + headless is the safest** combination: MIT code is **forkable/vendorable**, and TanStack's 24M weekly downloads make abandonment unlikely. No runtime vendor dependency.
- **Domestic (CN) options** are the most supply-chain-friendly by origin, but: **antd** is a *whole design system* (adopting its Table drags in antd's tokens/ConfigProvider, conflicting with our design system); **Arco / Semi / VTable** have **low adoption** (26K–54K/week) → higher maintenance risk, weaker external support.
- **React 19 gaps** rule out glide-data-grid (peer ≤18) unless we polyfill peers; **react-data-grid is still beta**.
- **Installability**: every npm package is available via `npmmirror`; additionally recommend **lockfile pinning**, `npm audit signatures` (provenance), and an **SBOM / license scan** in CI regardless of choice.

---

## Scoring (relative)

| Criterion | TanStack Table | antd Table | MUI X | AG Grid | glide | react-data-grid |
|-----------|---------------|-----------|-------|---------|-------|-----------------|
| Mainstream | ★★★★★ | ★★★★ | ★★★★ | ★★★★ | ★★ | ★★★ |
| React 19 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ (beta) |
| Design-system fit | ★★★★★ (headless) | ★ (full DS) | ★ (MUI DS) | ★★ | ★★ | ★★★ |
| Editing out-of-box | ★★ (self-built) | ★★★ | ★★★ | ★★★ (enterprise) | ★★★ | ★★ |
| License safety | ★★★★★ | ★★★★★ | ★★★ | ★★ | ★★★★ | ★★★★ |
| Supply chain (CN) | ★★★★ | ★★★★★ (CN origin) | ★★ | ★★ | ★★ | ★★ |
| Perf / virtualization | ★★★★ | ★★ | ★★★ | ★★★★ | ★★★★★ | ★★★ |

---

## Recommendation

**Primary: TanStack Table (headless, MIT).**
- Most mainstream grid library overall (24M/wk) → lowest abandonment risk.
- **Headless** → keeps our `.console-table` + tokens; no second design system (R4).
- React 19 satisfied (`>=18`); MIT → vendorable; no commercial/enterprise gate.
- Cost: **editors are ours to build** — which is inherent to inline editing anyway (type coercion, dirty state, validation, save).

**Domestic alternative: antd Table (Alibaba, MIT)** — only if "China-origin + 中文 docs + domestic support" outweighs design-system consistency. Because antd is a full design system, this implies **committing the whole app to antd**, not just the grid; treat as an app-wide decision, not a Data-view one.

**Ruled out for this use case:** Handsontable (commercial), glide-data-grid (React 19 gap), react-data-grid (beta), and the **enterprise tiers** of AG Grid / MUI X (editing/pivot behind paid license).

---

## Prerequisites (independent of the library)

These are backend/product decisions that must land **before** the grid matters:

1. **Primary key** — a dataset today has columns but **no PK concept**; row edits cannot target rows without one. Add `primary_key_columns` to the dataset.
2. **Editability opt-in** — `is_editable` per dataset (default off). Not every table should be writable.
3. **Optimistic concurrency** — guard lost updates (`WHERE pk=? AND old values`, or a version column).
4. **Permission** — editing *data* is more sensitive than editing *metadata*; consider a distinct `data:edit` key rather than reusing `data:write`.
5. **Cursor paging + server sort/filter** — required by R1; also what makes the grid's sorting/filtering meaningful.
6. **Audit** — who changed which rows when.

## Decision (recorded)

**Chosen: `@tanstack/react-table` v8.21.3 (headless, MIT).**

v9 (9.3.1, released 2026-08) rewrote the API (`useTable` / store / `Subscribe`) and is only ~2 months old with thin documentation. By this page's own **stability + supply-chain** criteria, the mature, widely-documented **v8** line is the safer pin for now; revisit v9 later. Inline editors are our own components (kept on the design system) — `Build →` passes with v8 on React 19.2.

**Shipped alongside:** dataset `primary_key_columns` + `is_editable`, `data:edit` permission, keyset paging, `POST /api/datasets/{id}/rows/apply` (+ `dataset_edits` audit), and the Data tab migrated to TanStack Table.

**Still open:** add/delete rows in the UI; keyset/infinite paging in the UI; richer editors (date/bool/select); optimistic-concurrency UX (refresh-and-retry); enterprise-grade column resize/pin.

## Next steps

1. **Spike**: TanStack Table + our design tokens + one editable cell type against React 19.2 (1–2 days).
2. **Backend first**: PK + `is_editable` + cursor paging + batch update/insert/delete API (parameterized, dry-run, optimistic concurrency).
3. **Supply-chain process**: pin + `npm audit signatures` + SBOM/license scan in CI, regardless of the chosen library.
4. Re-confirm **antd** only if the team decides to standardize the frontend on a design system.
