# Palantir Object Explorer vs openKMS

Comparative research for product decisions, written 2026-11-24. **Palantir** is described only from its public
documentation: sixteen Object Explorer pages fetched on 2026-11-23 (≈1,270 lines of prose, 92 screenshots; an
offline copy lives outside the repository, each file carrying its `source:` URL). **openKMS** is described from this
repository's code — every claim below points at a route or a file, so it can be checked rather than believed.

**Related:** [Architecture](../developer/architecture.md) · [API reference](../developer/api-reference.md) ·
[Design system](../developer/design-system.md) · [Foundry Rules](foundry-rules.md) ·
[Ontology Functions & Actions](ontology_functions_and_actions.md)

---

## Executive summary

| | **Palantir Object Explorer** | **openKMS Explorer** |
|---|---|---|
| **Identity** | Analysis surface over an ontology: object sets, charts, pivots, comparison, saved explorations | The same shape, over the ontology this platform already has (`object_types`, `link_types`, actions) |
| **Entry point** | Home search → an object type → exploration | Explorer home (groups + my explorations) → a type, or a saved exploration |
| **Unit** | An object set: a type + conditions, optionally compared with another set | The same, plus an explicit `scope` union when the reader widens it |
| **Write path** | Action types, offered per set/selection; inline edit in the results table | Action types, offered per selection or per set; inline edit; submission criteria and permissions |
| **Maturity of this area** | A shipped, documented product | Built here over roughly one week of iterations, with the same recurring mistake made three times (below) |
| **Verdict** | The shape is right and worth following; three of its rules we had to learn by shipping their negation | — |

The useful finding is not a feature list. It is that **every rule the documentation takes for granted is a rule we
broke**, and each break produced a bug rather than a missing feature. Section 4 records them with the evidence.

---

## 1. What the sixteen pages establish

| Page | What it fixes in the design |
|---|---|
| `08-getting-started`, `09-overview` | Home = search + type cards; an exploration is the unit you save and revisit |
| `13-search-objects`, `15-understanding-text-search` | Global search, tabs by object/link type, one text analyzer decides matching |
| `06-filter-results` | The search bar is the hub: property pickers, and value-first filtering ("where city is Los Angeles") |
| `13`/`14-search-syntax` | Boolean/quoting/wildcard grammar, deferred in their own docs |
| `05-explore-charts` | One chart per prominent property; **charts may aggregate a linked type**; add/remove/reorder/resize; a saved layout is charts + columns + sorts |
| `16-view-results` | Sortable columns, column order/hide/freeze/resize, inline edit gated by submission criteria |
| `10-pivot-linked` | Change the subject by following a link, keeping the conditions |
| `03-compare-object-sets` | Compare two sets — a current one and a saved one — side by side, across every chart |
| `11-save-explorations`, `12-save-lists` | Explorations store parameters; lists store objects (a different contract) |
| `02-apply-actions` | Top-right Actions/Open In/Export; the selection (or all objects, ≤1000) is passed to the form; parameters are prefilled only when the docs are confident |
| `04-configure` | Hide or attach actions per type (`hubble-oe:hide-action`, `hubble-oe-object-set-rid`), and a success toast that links to the object |
| `07-generate-urls`, `01-analyze-sql` | Explorations are addressable; SQL analysis reads a materialization that may trail by 30 seconds |

Two statements in that corpus are load-bearing and easy to skim past:

> **Charts**: "Each chart represents an aggregation of a property field on **the main object type, or linked object
> types**." (`05-explore-charts`)

> **Actions**: "The current set of selected objects … (**or all objects, if none are selected**) is passed directly to
> the form." (`02-apply-actions`)

---

## 2. Capability matrix

Status: **yes** = implemented and used in this deployment; **partial** = the mechanism exists, the coverage does not;
**different** = deliberately not the same; **no** = absent.

| Capability | Palantir (documented) | openKMS | Status |
|---|---|---|---|
| Object set = type + conditions | Search menu with property pickers and value-first filtering | `f=<prop>:<op>:<value>`, `@<link>/<prop>:…`, one-hop `EXISTS` (`services/ontology/object_query.py`); chips + a collapsed condition builder | partial — no value-first search, no boolean grammar |
| Charts per property | One per prominent property; click to filter | Same, order and metric per chart (`ObjectSetCharts.tsx`), click to add a condition | yes |
| Charts on a **linked** type | Explicitly documented | `prop=@<link>/<prop>`; `metric=linked` counts the neighbours | yes |
| Numeric distribution | Histogram, interval count in chart config | `buckets` per chart (5/8/12/20) | yes |
| Period as an axis | Not documented (their axes are categorical) | `time_format` decides: the chart keeps the periods' own order and is drawn as a trend | different (an addition) |
| Cross-tab (two dimensions) | Not in the charts page | `split=<prop>` → heat matrix, cells clickable | different (an addition) |
| Measures | Aggregation type per chart | `metric=count\|sum\|avg\|min\|max\|p50\|p90` × `measure` | yes |
| Compare two sets | Compare button; a saved exploration or a fresh set; all charts become two-series | `vs=<id>` or `vs=all`; paired bars, cells with a delta | yes — but only same-type baselines |
| Pivot to a linked type | Explicit | `pivotTo` moves every condition one hop | yes |
| Saved exploration | Stores search parameters and layout | `explorations` + `exploration_layouts`; conditions + charts + columns + sorts, never results | yes |
| Personal / global layout | Documented with an admin default | `exploration_layouts.owner_sub=''` for global, personal wins | yes |
| Column configuration | Order, hide, freeze, resize | Choose and order, multi-sort with precedence | partial — no resize or freeze |
| Results paging | Infinite scroll | A page size (50–500) and "load more" | different — deliberate, no infinite scroll |
| Inline edit | Pen in a cell, gated by submission criteria | `inline_edit` on an action; the pen appears when that row satisfies the criteria | yes |
| Actions on a selection | Top-right; selection passed to the form; ≤1000 objects | Top-right menu; per object or per set; batch cap 200 | yes — with declared scope (below) |
| Action submission criteria | Gate the action and the pen | `submission_criteria` evaluated per set, per selection and per object | yes |
| Action permissions | Not in these pages | `submission_permissions` — an action a caller lacks is not offered | different (an addition) |
| Open In / Export | Two of the three categories | Absent | no — Export deferred by request, Open In needs a destination |
| Hide an action per type | `hubble-oe:hide-action` type class | Not present; active/inactive is the only switch | no |
| Attach an action to another type's exploration | `hubble-oe-object-set-rid`, storing a **dynamic object set** as a property value | Absent; there is no object-set-as-value concept | no — and this is the largest structural gap |
| Undo / redo | Last 5 exploration states | 10 snapshots of URL + charts + columns; `Cmd/Ctrl+Z` | yes |
| Addressable exploration | URL generation documented | Everything is in the URL except charts/columns, which live in component state | partial — the known wart below |
| Analyzed with SQL | Reads a materialization, 30 s behind | The graph is the read path; `data as of` comes from `object_types.last_indexed_at` | different (same idea, different store) |

---

## 3. Where we deliberately differ

| Difference | Why |
|---|---|
| **Lists and CRUD live in Ontology Manager**, not the Explorer | Their Explorer also carries the object page; we have a Manager that already owns it. Two places for one list is two behaviours to keep equal. |
| **One type per exploration, with pivot to change the subject** | Palantir is the same; we made it explicit by redirecting `/object-explorer/objects` and `/links` to the Manager. |
| **"All objects" is an explicit choice, never the default** | Acting on 1,620 objects because nothing was ticked is not a mistake you can undo. Their ≤1000 cap is a bound, not a safeguard. |
| **Batch cap 200** | Each object writes its own audit row; sequential, so the cap is honest about the cost. |
| **Charts and rows are always both on screen** | We removed a Charts/Table mode switch: twice it was reported as "there is no table". |
| **No infinite scroll** | A page size the reader chooses beats a scrollbar that lies about how much is loaded. |
| **Periods are an axis with an order of their own** | `time_format` is a data fact in this platform; ranking weeks by volume destroys the only reading a timeline has. |
| **Undo covers charts and columns, which are not in the URL** | Their state model is their own; ours has two homes, so a private snapshot is the truthful implementation until charts move into the URL. |

---

## 4. Three rules we learned by shipping their negation

Each of these was a bug found in this deployment, not a missing feature. They share one cause: a mechanism that
**infers** what an action is, instead of the action **declaring** it.

| Bug | What we had assumed | What the documentation implies | Fix |
|---|---|---|---|
| "录入分货假设 — run on all 7" would have created seven assumptions | "Any action can be applied per object" | An action with a *create* rule produces one object; a *modify*/*delete* acts on one | `per_object` declares it; a once-only action is offered once, and the batch endpoint refuses it |
| "标记采用该方案 — run on all" would have marked every plan adopted | "Any per-object action can be batched" | Adopting a plan is a **choice**: one of a set | `exclusive` declares it; the menu shows it only for exactly one object; the batch endpoint refuses it by name |
| A chart of a linked property counted the **plans**, not the distributors | "Counting is counting" | "…aggregation of a property on the main object type, **or linked object types**" — the count has to be of the thing the reader is looking at | `metric=linked` counts the neighbour; the default stays "objects of the queried type" |

Two more, in the same family:

- **Submission criteria were absent**, so every action was offered and then failed downstream. Palantir gates the
  button and the pen on them; ours now gates the menu, the selection and the executor, naming the condition.
- **A write through a Function was invisible** to the screen that wrote it: the function writes the source table, the
  object layer reads the graph. Their docs note a 30-second materialization lag; ours now re-reads the type after a
  Function-rule action and says so (`refreshed`).

---

## 5. Gaps, with the trigger condition for closing them

Ordered by value, each with what would make it worth doing — because "they have it" is not a reason.

| Gap | Trigger |
|---|---|
| **Object set as a value** (dynamic set RID on a property) | A real consumer: "assign this filtered group to a field". Without one it is a feature looking for a use. |
| **Object-reference list parameters** | Partly closed: `object_refs` with `many` sends a list and the selection prefills it. Still open: a Function that consumes it. |
| **Column resize / freeze** | A type with more than ~10 visible columns; today the picker is enough. |
| **Boolean / quoted search grammar** | A complaint of "cannot find it" that a single substring cannot answer. |
| **Open In** | A second application worth opening into; the Cypher page is the only candidate and it is one click away. |
| **Export** | Deferred by product decision, not by capability. |
| **Hiding an action per use** | A type where an action is right for one screen and wrong for another. |
| **Charts and columns in the URL** | Would delete the private history stack and make the browser's Back an undo. Worth doing as its own change, not folded into a feature. |

---

## 6. What this implementation does that the documentation does not describe

Stated plainly, because a comparison that only counts absences is not a comparison.

| Addition | Value |
|---|---|
| **Before → after verification of an action** | Their success is a toast; ours re-reads the set and lists which bars moved (`diffCharts`, `ObjectSetActionOutcome`). An action that changed nothing says so. |
| **Submission conditions in one grammar across menu, form and executor** | Three answers from one declaration: which actions to offer, which objects qualify, what the error says. |
| **Row policy translated into object-set filters** | A restricted source model becomes `f=…` conditions ANDed with the reader's, so charts and rows agree instead of being post-filtered. |
| **`metric=linked`, cross-tabs, period axes, p90** | Four ways to ask a question the two documented chart families cannot. |
| **`data as of` on the page** | The mirror's age is visible, which their materialization note describes in prose only. |

---

## 7. The lesson worth keeping

The three action bugs are the same bug: **a generic mechanism over actions whose semantics differ**. The
documentation's model is declarative — an action type has rules (create / modify / delete / function), parameters,
criteria — and each of those changes what the UI may offer. Inferring "batch is fine because it is a modify" is exactly
where we went wrong, three times, in a week.

The rule this repository should keep: **the action declares what it is; the mechanism only executes the declaration.**
Today that means `per_object`, `exclusive`, `submission_criteria`, `submission_permissions`, `object_refs`,
`inline_edit` — six declarations and no inference beyond "modify/delete act on an object". Anything further the
Explorer wants to offer should arrive the same way.
