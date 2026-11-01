# openKMS

**Open Knowledge Management System** — openKMS helps enterprises build intelligent decision systems that are dependable and adaptable.

AI can already write software. The harder problem is what comes after: knowledge, data, and ontology must come first; business experts and AI lead the build; IT provides data access, permissions, security, and delivery. Every decision should be traceable, recomputable, and clear about its boundary.

[Repository on GitHub :material-github:](https://github.com/yingrui/openKMS){ .md-button .md-button--primary }
[Quickstart](quickstart.md){ .md-button }

---

## Why openKMS?

Most organizations already have files, wikis, and AI chat. The gap is **one place** where:

- **Business experts and AI** can maintain rules and exceptions together, without waiting on IT scheduling.
- **The enterprise platform** provides the knowledge, data, and ontology the system is built on.
- **IT** handles data access, permissions, security, and delivery.
- **Frontline staff and agents** use the same system to decide and execute.

The same system serves the people who decide and the agents that execute. If governance exists but nobody uses it—or if answers cannot be trusted for compliance—both sides fail.

North star: [Goals](goals.md) — *Help enterprises build intelligent decision systems that are dependable and adaptable*.

## What you build in openKMS

Content lives in **channel trees** (like folder hierarchies). Typical surfaces:

| Surface | Role |
|---------|------|
| **Documents** | Upload PDFs and office files; parse to editable Markdown (PaddleOCR-VL via a separate VLM server); versions and policy **lifecycle**. |
| **Articles** | Markdown CMS with channels, attachments, and relationships (`supersedes`, `amends`, `see_also`, …). |
| **Wiki spaces** | Path-based notes, vault import, page graph, semantic page search. |
| **Knowledge bases** | Hybrid search and **Q&A with provenance** (chunks, sources, optional QA Agent service). |
| **Knowledge map & ontology** | Terms linked to channels/spaces; optional structured data and graph explore. |

**Under the hood:** [operation permissions + resource ACL](features/data-security.md) (admin does not imply read-all data), [evaluations](features/evaluation.md) for retrieval and wiki coverage, and [development plan](development_plan.md) for what is shipped vs next.

## Where to start

| If you want to… | Read |
|---|---|
| Understand **why** openKMS exists (vision & business problems) | [Goals & vision](goals.md) |
| Try it locally with Docker or on the host | [Quickstart](quickstart.md) |
| Learn ontology by building a mini Kanban | [Tutorial: Understanding the ontology (Kanban lab)](tutorials/understanding-ontology.md) |
| DIY a Tushare → Stock → Function case study | [Tutorial: Tushare market ontology](tutorials/tushare-market-ontology.md) |
| Understand the system | [Architecture](architecture.md) · [Functionalities](functionalities.md) |
| Find a specific feature or API | [Functionalities](functionalities.md) → `features/*.md` |
| HTTP or schema reference | [API reference](features/api-reference.md) · Data models |
| Knowledge artifact types | [Knowledge types](features/knowledge-types.md) |
| Sharing and resource ACL | [Data security](features/data-security.md) |
| Use openKMS from an agent (skill + CLI) | [openkms-skill](features/openkms-skill.md) |
| Set up a dev environment | [Developer setup](developer/setup.md) |
| Deploy with Docker | [Operations · Docker](operations/docker.md) |
| Review security design (principles) | [Security](security.md) · [Data security](features/data-security.md) · [Console & auth](features/console-and-auth.md) |
| See what's planned next | [Roadmap · Development plan](development_plan.md) |
| Compare openKMS to other stacks or read KM frameworks | [Research](#research) (below) |
| Edit the docs (human or AI agent) | [Doc conventions for AI agents](agents.md) |

## Research {#research}

Notes for architecture and product decisions (not shipped feature specs):

| Topic | Document |
|--------|----------|
| RAG engine vs openKMS | [RAGFlow vs openKMS](research/ragflow_vs_openkms.md) |
| Confluence AI (Rovo) vs openKMS | [Confluence AI vs openKMS](research/confluence_ai_vs_openkms.md) |
| LLM wiki (llm_wiki) vs wiki spaces | [LLM wiki vs openKMS](research/llm_wiki_comparison.md) |
| Measuring KM outcomes (OKF dimension) | [Operational Knowledge Fitness](research/km_dimension_operational_fitness.md) |
| Evaluating articles & wiki text | [Text content evaluation](research/text_content_evaluation.md) |

## At a glance

```mermaid
flowchart LR
  User([Browser]) -->|Vite 5173 / nginx 8082| FE[React SPA]
  FE -->|/api| BE[FastAPI · 8102]
  BE --> PG[(PostgreSQL + pgvector)]
  BE --> S3[(S3 / MinIO)]
  BE --> WK[Procrastinate worker]
  WK --> CLI[openkms-cli]
  CLI --> VLM[mlx-vlm · 8101]
  BE -. /ask .-> QA[QA Agent]
  QA -. retrieve .-> BE
```

| Service | Default port |
|---|---|
| Backend (FastAPI) | **8102** |
| Frontend (Vite dev) | **5173** |
| Frontend (Docker, nginx) | **8082** |
| VLM server (mlx-vlm) | **8101** |

## Project layout

| Path | What's inside |
|---|---|
| `backend/` | FastAPI service, async SQLAlchemy, Alembic migrations |
| `frontend/` | React 19 + Vite SPA |
| `openkms-cli/` | Document parsing / pipeline CLI used by the worker |
| `openkms-skill/` | Optional SKILL + CLI for agents (Bearer personal API key; not in Docker) |
| `vlm-server/` | mlx-vlm HTTP server (PaddleOCR-VL backend) |
| `docker/` | Dockerfiles and `docker-compose.yml` |
| `docs/` | This site |
