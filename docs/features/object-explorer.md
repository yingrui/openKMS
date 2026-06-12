# Object Explorer

Run Cypher (or plain-language text-to-Cypher) against the configured **Neo4j** data source and inspect results as a **list** or **instance graph** at `/object-explorer`. Sidebar checkboxes filter which object/link types appear in generated queries; ACL limits which types are listed.

Broader ontology schema, datasets, and indexing are documented in [Ontology — objects, links, datasets](ontology.md). This page focuses on **Graph view** behavior and implementation lessons.

## Surfaces

| Surface | Description |
|---------|-------------|
| Query | **Cypher** tab (manual) or **Natural language** tab (generate + run); checkbox selection for object/link types seeds `buildCypher` when link types are selected |
| List view | Paginated table (25–200 rows per page, client-side) to limit DOM size on large `RETURN` sets |
| Graph view | `react-force-graph-2d` canvas; fills remaining main-column height (`app-content--object-explorer` flex layout) |
| Style panel | Collapsed-by-default legend on the right: per object-type node stroke color, per link-type edge color |
| Controls | Layout mode select, reheat simulation, center view, zoom in/out/fit, fullscreen overlay |

## Graph data pipeline

Implementation lives in `frontend/src/pages/ontology/ObjectExplorer.tsx` (`resultToGraph`, inline).

1. **Execute** posts Cypher to Neo4j; API returns `{ columns, rows }`.
2. For each row, every column value that looks like a node object (`isNodeLike`: has `id` / `name` / multiple keys) is collected in column order.
3. **Nodes** are deduped by `getNodeId` (`n-{id}` or `n-{_id}` from the Neo4j payload; row/column fallback if missing).
4. **Links** are inferred by connecting **consecutive node columns within the same row** (`nodeColumns[i]` → `nodeColumns[i+1]`). Link type id is taken from the selected link-type list at the same index when the query was built from checkboxes.
5. `objectTypeId` on nodes is assigned from `buildNodeColIndexToObjectType` (mirrors `buildCypher`: each selected link type contributes source then target type in order).

### Limitations of link inference

| Case | Behavior |
|------|----------|
| Checkbox-built `MATCH (a)-[r0]->(b), (c)-[r1]->(d) RETURN a,r0,b,c,r1,d` | Works: node columns alternate with relationship columns; consecutive nodes match the pattern |
| Custom Cypher with extra node columns or different column order | May create **spurious edges** or miss real ones — the graph reflects column adjacency, not parsed relationship variables |
| Multi-hop paths in one row | Only adjacent node columns are linked; intermediate hops need to appear as consecutive node values in `RETURN` |
| Duplicate edges across rows | Deduped by `source→target` key |

When debugging a confusing graph, compare **List** column order to the inferred edges.

## Layout modes

`ForceGraph2D` is configured in `ObjectExplorer.tsx`. Default is **force-directed** (`dagLayoutMode === ''`, no `dagMode`).

| Mode | Mechanism | Best for |
|------|-----------|----------|
| **Default** (empty) | d3 force simulation: charge ≈ `-400`, link distance ≈ `80`; nodes are **not** pinned | General instance exploration; graphs with **cycles**; hub-and-spoke (many leaves → few categories) |
| **LR / RL / TD / BU / radial** | `dagMode` + dagre via `react-force-graph-2d`; charge ≈ `-500`, link distance ≈ `150`; `dagLevelDistance` 150 | **DAGs** only — trees or strict pipelines with no directed cycles |

On simulation end, **Default** calls `zoomToFit(400, 50)` so the graph uses the viewport once forces settle.

### DAG layout cycle warning

Hierarchical modes require a **directed acyclic graph**. When dagre detects a cycle, `onDagError` shows a toast (`toastDagWarning`): layout name + up to three node ids in the loop.

Cycles are common in real ontology data (e.g. self-referential link types like `Has_Parent`, `CascadesTo`) or from query paths that return `A → … → A`. The layout may still render something, but layering is unreliable — prefer **Default** for cyclic instance graphs.

Unlike the [ontology schema graph](ontology.md#ontology-overview-graph) on `/ontology`, Object Explorer does **not** omit self-referential link types; it shows whatever the Cypher result implies.

## Rendering choices that work

These details explain why **Default** tends to show readable links and label size without extra layout code.

### Keep force simulation authoritative

Node positions come from the simulation (`node.x`, `node.y`). Custom `nodeCanvasObject` draws a rounded rect **centered on those coordinates**, so edge endpoints align with box centers. Replacing Default with fixed grids, viewport normalization, or pinned `fx`/`fy` + `cooldownTicks={0}` broke the coordinate system relative to links and `zoomToFit` — edges collapsed or nodes stacked.

**Do not** replace Default force layout wholesale for instance graphs; at most tune forces or result size.

### Label size vs zoom

```ts
const fontSize = Math.max(10, 12 / globalScale);
```

`globalScale` is the canvas zoom factor: when zoomed out, labels grow in graph space so **screen size stays ~12px**. Capping font size without matching spacing caused overlap; removing the inverse scale made labels illegible when zoomed out.

### Edge visibility

- `linkCurvature={0.15}` — slight curve separates parallel edges.
- `linkDirectionalArrowLength={6}` — direction hint on instance edges.
- Per-link stroke from link-type color picker (default gray).

### Reheat

The refresh control calls `d3ReheatSimulation()` to re-run forces after manual pan/zoom or when the graph feels stuck in a local minimum.

## What we tried and reverted (instance graph)

Experiments on Object Explorer Graph view (not the ontology **schema** graph) showed:

| Approach | Problem |
|----------|---------|
| Custom layered / grid layout + pinned positions | Dense bands, radial single-node layers at one angle, links detached from boxes |
| Large `spacingScale` + `zoomToFit` | Huge graph coordinates compressed into unreadable lines |
| Replacing `resultToGraph` without preserving force + fit | Incorrect edges plus broken layout |
| Hierarchical layout as default | Cycle warnings; poor fit for hub-and-spoke query results |

**Takeaway:** Instance graphs are **query-result-shaped** and often cyclic; force simulation + auto fit matches that better than schema-style DAG layout.

## Contrast with Ontology overview graph

| | Object Explorer (`/object-explorer`) | Ontology overview (`/ontology` Graph) |
|---|--------------------------------------|----------------------------------------|
| Data | Neo4j **instances** from user Cypher | **Schema**: object types + link types from API |
| Model | `resultToGraph` in `ObjectExplorer.tsx` | `ontologySchemaGraphModel.ts` + `OntologySchemaGraph.tsx` |
| Self-ref links | Shown when data/query includes them | Omitted from diagram |
| Default layout | Force simulation | Custom layered schema layout (`lr` internally) |
| Edges | Curved (`0.15`) | Straight (`linkCurvature=0`) |
| Click | — | Opens object/link type browse pages |

Reuse patterns (colors, layout select UI, zoom controls) but **not** the schema layout engine for instance exploration.

## Operational notes

- Generated checkbox Cypher uses `LIMIT 100`; dense graphs are expected — reduce scope in Cypher or use List view for full row sets.
- Graph view requires at least one node-like column in results; otherwise **no graph data** empty state.
- Fullscreen graph uses `object-explorer-graph-fullscreen`; canvas size tracked with `ResizeObserver` on the graph container.
- i18n namespace: `objectExplorer` (`frontend/src/i18n/locales/*/objectExplorer.json`).

## Likely follow-ups (not implemented)

- Build links from **relationship columns** in each row (skip rel objects when pairing nodes) to support arbitrary `RETURN` shapes.
- Optional force tuning UI (charge / link distance) without changing layout mode.
- Soft limit or sampling hint when node count exceeds a threshold.
