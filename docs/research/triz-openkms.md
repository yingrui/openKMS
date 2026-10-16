# TRIZ analysis of openKMS

Applying TRIZ (теория решения изобретательских задач — theory of inventive problem solving) to
openKMS: system definition, ideal final result, function/substance-field analysis, technical and
physical contradictions with the 40 inventive principles, laws of technical-system evolution, and
trimming. Ends with the highest-leverage moves the contradictions point to.

**Evidence legend.** Claims are marked **[code]** (verified in source, with `file:line`) or
**[doc]** (documented but not re-verified line-by-line this pass). This page deliberately starts
from executable facts — route tables, model columns, defaults — not from the vision narrative.
See [Goals](../goals.md) for the narrative and [Development plan](../development_plan.md) for status.

**Related:** [Goals](../goals.md) · [Development plan](../development_plan.md) · [Architecture](../architecture.md) ·
[Tech debt](../tech_debt.md) · [Security](../security.md) · [Agents](../features/openkms-agents.md) ·
[openkms-skill](../features/openkms-skill.md) · [Ontology Manager alignment](ontology_manager_alignment.md)

---

## 1. System definition (system operator / nine windows)

**Main useful function (MUF):** let one governed knowledge/data layer be **built and operated by
agents end to end**, while people can **review, correct, and cite** it — "agent-operated,
human-supervised". **[code]** The in-app agent's system prompt routes it to the installed skill
(`.openkms/skills/<id>/scripts/cli.py`, `backend/app/services/deep_agents/prompts.py:15-19`), and
the agent runtime registers only `run_python` plus optional web search
(`deep_agents/factory.py:108,111`; `deep_agents/sandbox.py:44`). There are no built-in openKMS HTTP
tools.

**Components [code]:**

| Layer | Components | Evidence |
|-------|------------|----------|
| Write surface | `/api/*` (people + agents), `/internal-api/*` (worker/CLI) | `backend/app/main.py`; [Security](../security.md) |
| Agent surface | openkms skill CLI (**31 command modules + `__init__.py`**), reached by in-app agents through the shell | `openkms-skill/scripts/openkms/commands/`; `deep_agents/sandbox.py`, `prompts.py` |
| Source of record | PostgreSQL; pgvector (`Vector(None)`); S3/MinIO | `backend/app/models/chunk.py:37`, `faq.py:26`, `wiki_models.py:82` |
| Projection | Neo4j — reads go through `asyncio.to_thread`, the index **write** path does not | `ontology/neo4j_async.py:45,55` vs `api/object_types.py:515,536` |
| Control | two-layer RBAC + resource ACL, feature toggles, lifecycle | [Security](../security.md); `models/document.py` |
| Generation fields | LLM (extraction/FAQ/review/map designer/agents), VLM (parse) | [Architecture](../architecture.md) |

**Nine windows:**

| | Past | Present **[code]** | Future ([doc]) |
|---|---|---|---|
| **Sub-system** | people author wiki/docs | agents write the full stack through the skill; people correct | agents autonomous, people sample-review |
| **System** | static document store | governed network for people **and** agents | self-maintaining knowledge/data layer |
| **Super-system** | single tool | connectors / Apps (K8s) / external skill hosts | data mesh + agent ecosystem |

**Observation:** the sub-system (agent writes) runs ahead of the system layer (oversight/attribution)
and the super-system layer (downstream loops). That gap generates every contradiction below.

---

## 2. Ideal final result (IFR)

> **"An agent builds and operates the whole knowledge/data layer end to end; a person reviews only
> the changes that carry risk; every write is attributable, reviewable, and reversible; routine
> creation never needs the SPA."**

Ideality = Σ useful functions / (Σ harmful functions + Σ cost). Current cost/harm terms, all
code-visible:

| Term | Evidence | Kind |
|------|----------|------|
| Skill hand-mirrors the API (every new endpoint is a manual command) | no OpenAPI generator; 31 hand-written modules; `scripts/` holds only an example script **[code]** | cost |
| Writes are not attributable to an agent/session | resources store `created_by=<human sub>`; `user_api_keys.purpose` is not propagated **[code]** | harm |
| Five structure types have no publish gate | see §5 TC-3 **[code]** | harm |
| No global change ledger | only `dataset_edits`, `metric_run`, ontology executions, ACL admin **[code]** | harm |
| Vector search is a sequential scan | `Vector(None)` + migration `e3f4a5b6c7d8_drop_embedding_hnsw_indexes.py` **[code]** | cost |
| Index writes block the event loop | `api/object_types.py:515,536` **[code]** | harm |

The IFR gap sits on the **oversight** side, not the **generation** side — generation is already
delegated to agents.

---

## 3. Function analysis and substance-field (Su-Field) models

### 3.1 Function ledger

| Function | Subject → Object | State | Evidence |
|----------|------------------|-------|----------|
| Build structure (OT / dataset / model / function) | agent → corpus | **sufficient** | skill covers all write paths **[code]** |
| Write content (doc / wiki / article) | agent → corpus | **sufficient** | `put-markdown`, `put-page`, `articles create` **[code]** |
| Attribute a write | org → writes | **insufficient** | `created_by=<human sub>` **[code]** |
| Review an agent change | person → change | **insufficient** | HITL empty; no ledger **[code]** |
| Keep the agent surface complete | system → agent | **insufficient** | hand-written CLI, no coverage check **[code]** |
| Index a write into Neo4j | write → graph | **harmful** | blocks the loop **[code]** |

### 3.2 Su-Field diagnoses

**A. Incomplete Su-Field ① — the oversight point is at the wrong layer (core).**

```
Supervisor S1 ──control field F──▶ agent S2        F has no landing point
```

Because agent openKMS writes go through `run_python` → shell → CLI, they are **not** at the
LangChain tool layer, so a tool-level interrupt can only gate the whole `run_python` call; and
`prompts.py:44` explicitly tells the agent to pass `--yes` on every mutating command. **[code]**

→ Standard solution: introduce **S3 as an intermediary at the write path** (carry actor/key id and
record changes), instead of an interrupt at the tool layer.

**B. Harmful Su-Field — agent generation lands directly in the SoT.**

```
agent S1 ──generation field F──▶ SoT S2        no gate
```

→ Standard solution: introduce filter **S3 = publish gate**. The shape already exists for
`ontology_function` (validate → publish → versions). **[code]**

**C. Incomplete Su-Field ② — the skill surface drifts from the API.**

→ Standard solution: derive/validate the CLI from the API catalog (principles 2, 10). See the
appendix for the coverage check.

**D. Harmful Su-Field — index writes.**

→ Standard solution: move F to `asyncio.to_thread`, the pattern the read path already uses. **[code]**

---

## 4. Technical contradictions (TC) → inventive principles

Parameter numbers: *24 loss of information · 25 loss of time · 27 reliability · 30/31 harmful
effects · 32 ease of manufacture · 34 ease of repair · 35 adaptability · 36 device complexity ·
37 difficulty of measurement · 38 extent of automation · 39 productivity.*

### TC-1 Agent-surface completeness ↔ hand-mirrored API **[code]**
- **Improves:** 24 loss of information ↓ (capabilities visible to agents), 39 productivity ↑
- **Worsens:** 13 stability of composition ↓ (API evolves, the hand-written CLI drifts), 25 loss of time ↑
- **Evidence:** 31 command modules, no OpenAPI generator, `scripts/` holds only `example_ontology_sdk_caller.py`
- **Principles:** 2 extraction · 10 preliminary action · 24 intermediary · 25 self-service
- **Move:** treat OpenAPI as the single catalog; generate *or* validate CLI coverage. Today
  `stale=0` (no dead calls) but `uncovered=402` — see appendix.

### TC-2 Agent autonomy ↔ attribution / review **[code]**
- **Improves:** 38 automation ↑, 25 loss of time ↓
- **Worsens:** 37 difficulty of measurement ↑, 27 reliability ↓
- **Evidence:** `created_by=<sub>` (`api/app_builder.py:72`, `api/knowledge_bases.py:105`, …);
  `user_api_keys.purpose` used only at auth/list (`api/auth.py:781`), never propagated;
  `agent_session_api_key.py:43-44` sets `purpose="agent_session"` and `agent_conversation_id`;
  `hitl.py:14` empty; audit is local-only
- **Principles:** 9 preliminary anti-action · 23 feedback · 24 intermediary · 34 discarding and recovering
- **Move:** propagate key id / purpose into the write path (one change, system-wide attribution),
  then add a change ledger and rollback.

### TC-3 Publish-gate coverage is asymmetric (3 of 8) **[code]**
- **Improves:** 27 reliability ↑ (controllable before publish)
- **Worsens:** 39 productivity ↓, 25 loss of time ↑ (if the gate is rebuilt per type)
- **Evidence:** `published_version_id` only on `app_builder.py:28` and `ontology_function.py:26`;
  `status=draft` only on `app_builder.py:30` and `explorer_dashboard.py:26`; absent on
  `dataset`, `semantic_model`, `object_type`, `link_type`, `metric_definition`
- **Principles:** 5 merging · 33 homogeneity — factor the publish gate into a **shared primitive**
  (the Function chain is the template).

### TC-4 Vector flexibility ↔ indexable performance **[code]**
- **Improves:** 35 adaptability ↑ (per-KB embedding model)
- **Worsens:** 9 speed ↓, 21 power ↓
- **Evidence:** `Vector(None)`; migration `e3f4a5b6c7d8` drops three HNSW indexes
- **Principles:** 1 segmentation · 3 local quality · 17 another dimension · 25 self-service

### TC-5 Same-request consistency ↔ event-loop throughput **[code]**
- **Improves:** 27 reliability ↑
- **Worsens:** 9 speed ↓, 25 loss of time ↑
- **Evidence:** `api/object_types.py:515` opens `with driver.session()` and awaits DB calls inside
  the loop (`:536`); the read path uses `asyncio.to_thread` (`neo4j_async.py:55`)
- **Principles:** 2 extraction · 24 intermediary

### TC-6 Breadth / delivery speed ↔ maintainability **[code]**
- **Improves:** 39 productivity ↑, 35 adaptability ↑
- **Worsens:** 34 ease of repair ↓, 36 device complexity ↑
- **Evidence (measured):** `api/documents.py` 1244 · `api/knowledge_bases.py` 969 ·
  `api/wiki_spaces.py` 951 · `api/project_conversations.py` 845 ·
  `pages/knowledge-bases/KnowledgeBaseDetail.tsx` 1545
- **Principles:** 1 segmentation · 2 extraction · 10 preliminary action · 25 self-service —
  moving checks into CI (`backend/check.sh`, `npm run check`) is a positive precedent.

### TC-7 Vision document ↔ implementation intent **[code]**
- **Worsens:** information consistency ↓ (33 homogeneity), 24 loss of information ↑ (roadmap排序 misled)
- **Evidence:** `goals.md` frames human authoring pain; the code builds agent-first operation;
  `hitl.py:13` documents *why* HITL is empty, while `tech_debt.md` describes it as "policy undecided"
- **Principles:** 33 homogeneity · 24 intermediary — move the "system definition" from narrative to
  executable facts (routes, models, defaults).

### TC-8 Multi-tenancy ↔ single-tenant boundary **[doc]**
- Skipped multi-ontology (`ontology_manager_alignment.md`); multi-tenancy is Long-Term.
- **Principles:** 1 segmentation · 5 merging · 7 nested doll · 24 intermediary.

---

## 5. Physical contradictions (PC) → separation principles

| Physical contradiction | Separation | Status **[code]** |
|---|---|---|
| An agent write **must be usable immediately** yet **only after review** | time | Partial: Function/App/Report have it; 5 types do not |
| Oversight **must be at the write point** yet **at the agent layer** | **condition** (currently mispositioned) | Gap: no intermediary at the write path |
| Embedding column **must be variable-dimension** yet **fixed-dimension** | space | Gap: per-KB partition / hot-set index |
| Data **must be single-copy** yet **multi-copy** | space | **Done:** dataset = SoT, Neo4j = projection |
| Agent surface **must be unified** yet **isolated** | condition | **Done:** in-app and external hosts share the skill |
| Parsing **must run in-container** yet **on-host** | space | **Done:** host VLM over HTTP **[doc]** |

**Pattern:** openKMS separates well in **space** (SoT/projection, host VLM, shared skill); the missing
separation is **condition** — placing oversight at the write path instead of the tool layer.

---

## 6. Laws of technical-system evolution

| Law | Assessment |
|-----|------------|
| Increase ideality | generation side is high; oversight side drags it down |
| Transition to micro-level | documents → chunks → instances/triples → semantic model ✅ |
| Increase dynamism/controllability | toggles / ACL / lifecycle active |
| **Sub-system coordination** | two mismatches: implementation (agent-operated) ↔ docs (human KMS); agent surface (hand-written) ↔ API |
| Transition to super-system | connectors / Apps (K8s) / external skill hosts, in progress |

---

## 7. Trimming

| Trim candidate | Basis | New carrier |
|---|---|---|
| Hand-mirrored CLI | **[code]** 31 modules, no generator | OpenAPI catalog (super-system) |
| Repeated `actor` fields on resources | **[code]** key id suffices | the auth layer, once |
| Client `fetchAll*` accumulation | **[doc]** tech debt | server-side paging/tree |
| Duplicated metadata extraction | **[doc]** (not re-verified) | a single implementation |
| Legacy aliases (`paddleocr_vl_server_url`, `/logout`) | **[doc]** | current names/routes |

---

## 8. Verdict: highest-leverage moves

After grounding in code, the analysis narrows to **two moves on one layer — the write path**:

1. **Propagate actor/key id into the write path** (resolves TC-2, Su-Field A). `agent_conversation_id`
   already exists on the key; the auth layer can carry it into `created_by`. One change makes writes
   attributable and traceable to a session.
2. **Factor the publish gate into a shared primitive** (resolves TC-3). The template exists
   (`ontology_function`: validate → publish → versions); extend it to dataset / model / OT / LT / metric.

Two lower-cost engineering moves:

3. **Generate or validate CLI coverage from the API catalog** (resolves TC-1).
4. **Move the Neo4j index write to `to_thread`** (resolves TC-5, same pattern as reads).

**The single core contradiction** is that `Supervisor —control field→ agent` is an incomplete
Su-Field: openKMS puts the write inside `run_python` → shell → CLI, so the oversight point and the
write point are at different layers. The other contradictions (surface sync, publish gate, index,
vectors, doc mismatch) are projections of it.

---

## Appendix: coverage check (empirical TC-1)

`scripts/check_skill_coverage.py` compares the skill CLI's HTTP targets (parsed via AST from
`openkms-skill/scripts/openkms/commands/*.py`) with the backend `/api` route table.

```bash
cd backend && PYTHONPATH=. uv run python ../scripts/check_skill_coverage.py --skill-root ../openkms-skill
```

Snapshot on this revision:

```
backend /api routes: 538   skill targets: 136
uncovered=402   stale=0
```

- **stale = 0** — no skill command calls a nonexistent route today. The drift risk is future, not present.
- **uncovered = 402** — of these, **134** are control-plane / human-console / the agent's own
  workspace (`admin`, `auth`, `models`, `providers`, `feature-toggles`, `system`, `resource-acl`,
  `user`, `schedules`, `console`, `projects`, `agent-skills`, `public`, `home`) and are intentionally
  outside the skill. The remaining **268** are product-surface routes (an upper bound — some are
  UI-only), i.e. the real reachable-by-agent gap.

Exit code is 1 when any gap exists, so the script can gate CI once a baseline is accepted.
