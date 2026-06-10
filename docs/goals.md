# openKMS goals and business problems

**North star:** *Frontline confidence · Expert contribution · Organizational governance · Agent readiness.*

**Agent-ready** means discoverable, retrievable, answerable, and traceable—on knowledge that stays current, accurate, and permission-aware.

This page explains openKMS direction from a **business and knowledge-engineering** perspective. Capabilities and implementation paths live in [Functionalities](functionalities.md), [Architecture](architecture.md), and [Development plan](development_plan.md) (shipped index, strategic priorities, backlog). Doc entry: [Home](index.md).

The narrative below has two layers—the same problem from two angles:

| Lens | Question | In this doc |
|------|----------|-------------|
| **User** | What do I save daily, dare to use, and want to contribute? | [User perspective: pains and value](#goals-user-value) |
| **Organization** | How does the company turn knowledge into governed, AI-ready assets? | [Organization: knowledge engineering and governance](#goals-organization) |

These are not separate “consumer vs enterprise” products—they are two demands on **one knowledge network**: individuals need **usability, trust, and time saved**; the organization needs **governance, traceability, and scale for agents**. Satisfying only one side undermines the whole.

**Why both must hold**

- **Organization-only, users won’t adopt** — The library grows but maintenance stays with a few people; staff still ask colleagues or private AI chat.
- **User-only, organization can’t underwrite** — Search feels fine, but without versions, lineage, and quality metrics, answers **can’t be used for compliance or rollout**; agents may cite stale material.

**How they reinforce each other**

- **Retrieval** depends on org-side aggregation, structure, indexing, and permissions; **contribution** depends on low-friction tools and feedback (parsing, evaluation, lifecycle).
- **Governance and AI readiness** must live in real workflows; if experts and frontline staff don’t enter the system daily, rules drift from reality.

---

## User perspective: pains and value {#goals-user-value}

### What users actually struggle with

| Pain | Daily symptom |
|------|----------------|
| **Can’t find it** | Ask colleagues, search email, try multiple systems—still unsure which copy is latest or complete |
| **No evidence to trust** | Search hits or AI answers lack sources or version clarity; can’t use them externally or for compliance |
| **Don’t know the context** | New hires or role changes don’t know which materials apply, what terms mean, or how the process runs |
| **No time to publish** | Experts know the answer but SOP/wiki authoring is costly; knowledge stays verbal or in private files |
| **Stale without notice** | Policies or product rules changed; training decks, checklists, FAQs may be invalid—no system alert |
| **Answers stay private** | Got an answer from AI alone; the team keeps asking the same thing; knowledge never becomes reusable |

These are mostly **personal time and risk** problems—not simply “the company needs a KMS.”

### Value by role (examples)

| Role | Primary value |
|------|----------------|
| **Business staff** (sales, ops, support, customs, documentation, etc.) | Fewer interruptions; **answers with sources and trusted versions**; clear “currently valid” vs historical |
| **Domain experts** (process owners, SOP/policy leads, senior specialists) | **Low-burden capture** (upload-and-parse, assistant-assisted drafting); contribute once, reuse by people and agents |
| **Knowledge administrators** (KM ops, department champions) | **Structure and operations**: clear channels and map, evaluable and governable; changes trigger review; permissions and sharing |
| **Legal & compliance** | Traceable external messaging and policy basis; clear version and effective intervals; avoid citing expired clauses |
| **Internal control & risk** | Audit trails, permission boundaries, verifiable key materials; reduce “AI or staff applied obsolete rules” |
| **Quality & standards** (ISO, industry norms, controlled procedures) | **Controlled document system**: traceable procedure revisions aligned with work instructions; complements admin “operational cataloging” on one platform |

Console, connectors, and evaluation mainly serve **knowledge administrators** and **legal, control, and standards** roles. Whether **business staff and experts** have short default paths (e.g. turn a Q&A into FAQ/wiki—see [Development plan](development_plan.md)) determines sustained contribution.

### Retrieve knowledge—and contribute it

Daily knowledge work splits roughly into:

- **Retrieve** — Find material, understand context, ask within permissions and verify basis  
- **Contribute** — Write maintainable text, fix parse errors, link materials, deliver citable internal/external content, find and fill corpus gaps  

Optimize retrieval alone and the system empties; push contribution alone without feedback loops and authors don’t know if anyone uses or trusts what they wrote. openKMS needs both paths short.

| Action | Main pain relieved | User goal | openKMS surface (shipped or direction) |
|--------|-------------------|-----------|----------------------------------------|
| Find | Can’t find it | Does it exist, where, which channel | Global search, channels and lists, knowledge map entry, hybrid retrieval |
| Understand | Don’t know context | Terms, domain structure, onboarding path | Wiki, articles, glossaries, knowledge map, ontology browse |
| Ask | No evidence | Q&A with permissions and provenance | Knowledge base Q&A, Wiki Copilot |
| Capture | No time / private answers | Experience and conclusions in maintainable text | Wiki, articles, editable Markdown after doc parse; **KB Q&A → Save as FAQ**; sharing and ACL |
| Correct | No evidence | Human fallback when machine misreads; keep versions | Document/article versions, metadata edit |
| Relate | Stale without notice | Supersedes, amends, see-also relationships | Document lineage and lifecycle, knowledge map, ontology |
| Deliver | No evidence | Training or external messaging with citations | Article publish, print views, cited replies |
| Improve quality | Stale / no time | Know gaps, errors, whether fixes helped | Evaluation sets and compare runs (→ edit/ fill loop in [Development plan](development_plan.md)) |

### User pains vs organization pillars {#goals-pain-map}

| User pain | Organization pillar |
|-----------|---------------------|
| Can’t find it | [Break silos](#goals-unified-source), [Library and navigation](#goals-library) |
| No evidence | [Agent knowledge service](#goals-agent-service), evaluation and provenance ([Development plan](development_plan.md)) |
| Don’t know context | [Library and navigation](#goals-library), glossaries and knowledge map |
| No time / private answers | [Tacit knowledge externalized](#goals-tacit), [In-product agents](#goals-agent-service) |
| Stale without notice | [Lifecycle and provenance](#goals-lifecycle) |

---

## Organization: knowledge engineering and governance {#goals-organization}

Below follows **where knowledge comes from → how it enters and is cataloged → how it stays fresh and is used → how it is delivered to people and agents**, aligned with user value above and the [pain map](#goals-pain-map).

### Break organizational silos; unified layer for Data for AI {#goals-unified-source}

**Problem:** Email, file shares, legacy KMS, ticket notes stay separate—high-quality knowledge can’t be reused; models and agents lack a trusted single source.

**Direction:** **Aggregate multi-source content with unified permissions and lineage**—become one **unified knowledge layer** for **Data for AI** under compliance. Not replacing every business database, but cataloging and governing “explanatory knowledge and documents safe for AI consumption.”

**Product gap:** [Connectors](development_plan.md#connectors-high) — instances and secrets configurable; **sync jobs writing to datasets not shipped**.

---

### Understanding massive non-standard business documents {#goals-documents}

**Problem:** Enterprises hold **PDFs, decks, scans, mixed layouts** in inconsistent formats; machines need layout/table understanding plus human review loops.

**Direction:** Document channels, VLM parse pipelines, editable Markdown—“machine reads first, human corrects” as default. Image/audio/video evidence cataloging: [Development plan — Multimodal](development_plan.md#multimodal-models--media-high) and [Knowledge types — Rich media](features/knowledge-types.md#rich-media-and-3d).

---

### Library and navigator: AI-ready knowledge engineering {#goals-library}

**Problem:** “Browsing the ocean of knowledge” may work for humans by luck; **AI agents** need **navigable structure**.

**Direction:** Channels, document/article/wiki/KB division, knowledge map and ontology—people and machines **reach the right class of knowledge quickly**. Structural basis for **agent readiness**: boundaries, types, entry points.

---

### Extract and externalize tacit expertise {#goals-tacit}

**Problem:** High-value knowledge stays in experts’ heads (heuristics, exceptions, compound conditions); traditional interview-to-SOP is slow and late.

**Direction:** Without heavy expert burden, use ingest, parse, index, evaluation, and agent assist to turn email, reports, and notes into **retrievable, versioned, linked structure**.

**Product gap:** [Evaluation and quality improvement](development_plan.md#evaluation--knowledge-quality-high) — failure-item → edit/fill loop still evolving.

---

### Keep rules fresh and traceable {#goals-lifecycle}

**Problem:** When policy, regulation, or contract terms change, dependent SOPs, checklists, and training that don’t sync mean **agents may act on obsolete text**—worse than not knowing.

**Direction:** Document lineage and lifecycle, effective intervals, “currently usable for RAG”; **one change surfaces related material for update or review** (customs policy scenarios as exemplar).

**Product gap:** [Policy change impact](development_plan.md#policy--lifecycle-medium) — lifecycle fields exist; **change-impact workflow not productized**.

---

### From retrieval to decisions {#goals-decision}

**Problem:** Agents need more than a paragraph—conceptual vs factual vs procedural knowledge, aligned with business logic and live data.

**Direction:** Retrieval as foundation; **ontology, knowledge map, and boundaries with operational data** support moving from “found it” to “can decide from it.”

---

### Precise knowledge service for agents {#goals-agent-service}

**Problem:** Same question asked across systems; fragmented context, hallucination, repeated clarification.

Two **separate** product lanes (do not merge into one “global chat”):

| Lane | Purpose | Examples in openKMS |
|------|---------|---------------------|
| **KB Q&A delivery** | Per–knowledge-base **retrieval + answer service** for people, apps, and external agents — **Agent-ready** (permission-aware, sourced) | [`qa-agent`](features/knowledge-bases.md) via `kb.agent_url`; `POST …/search`, `…/ask`, `…/retrieve`; API keys, [openkms-skill](features/opencode-openkms-skill.md). SPA full-page Q&A is an **operator/consumer UI** for that service, not an in-app maintenance copilot. |
| **In-app agents** | **Build and maintain** corpus inside openKMS (draft, curate, research workflows) | [Wiki Copilot](features/wiki-spaces.md), knowledge map HTML designer, [Deep Agents project workspaces](features/openkms-agents.md) |

**Direction (delivery):** Unified index, hybrid search, lifecycle-aware corpus, provenance on answers, stable HTTP API for embedders and integrators.

**Direction (in-app):** Short paths for experts to search, draft, and fix content **within** documents, wiki, articles, and maps — without replacing per-KB Q&A services.

**Product gaps:**

- **Delivery** — Connector sync into governed datasets; broader embed/integration patterns ([Connectors](development_plan.md#connectors-high)).
- **In-app** — [In-product agents](development_plan.md#in-product-agents-high): per-surface copilots exist; **eval assist** is API-only; **no unified maintenance assistant** across wiki / documents / map (excludes merging KB Q&A delivery into that shell).
