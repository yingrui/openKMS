# openKMS

**Open Knowledge Management System** — channel-based document, article, and knowledge-base platform with RAG-style Q&A and a wiki workspace.

[Repository on GitHub :material-github:](https://github.com/yingrui/openKMS){ .md-button .md-button--primary }
[Quickstart](quickstart.md){ .md-button }

---

## What is openKMS?

openKMS organizes content in **channel trees** (similar to Google Drive folders). Three primary content surfaces sit on top of those channels:

- **Documents** — upload PDF, HTML, ZIP, images; parse via PaddleOCR-VL on a separate VLM server; store originals in S3/MinIO; convert to Markdown.
- **Articles** — markdown-first CMS with channels, versions, attachments, and **article-to-article relationships** (`supersedes`, `amends`, `see_also`, …).
- **Knowledge bases** — RAG over indexed documents, with FAQs, hybrid search, and a separate QA Agent service.

A **Wiki workspace** offers free-form notes with vault import, a graph view, and an embedded Wiki Copilot.

A unified **Knowledge Map** ties terms (taxonomy) to channels, wiki spaces, and article channels.

## Where to start

| If you want to… | Read |
|---|---|
| Try it locally with Docker or on the host | [Quickstart](quickstart.md) |
| Understand the system | [Overview](overview.md) → [Architecture](architecture.md) |
| Find a specific feature or API | [Functionalities](functionalities.md) |
| Set up a dev environment | [Developer setup](developer/setup.md) |
| Deploy with Docker | [Operations · Docker](operations/docker.md) |
| Review the auth and permission model | [Security](security.md) |
| See what's planned next | [Roadmap · Development plan](development_plan.md) |
| Edit the docs (human or AI agent) | [Doc conventions for AI agents](agents.md) |

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
| `vlm-server/` | mlx-vlm HTTP server (PaddleOCR-VL backend) |
| `docker/` | Dockerfiles and `docker-compose.yml` |
| `docs/` | This site |
