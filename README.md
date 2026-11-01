# openKMS

**Open Knowledge Management System** — build intelligent decision systems that are dependable and adaptable.

A decision system takes a case in, applies rules and evidence, and returns a conclusion. The hard part is not generating the application; it is making the conclusion dependable: it has a basis, can be recomputed, and states its boundary. openKMS is the layer that makes that possible.

## What you build

A decision system: case in → conclusion out, with its basis, computation, and boundary attached.

Typical domains: customs classification, insurance underwriting, quality release, compliance review.

It is not an app generator, a document store, a chat window, or a BI tool. The longer argument is in [Goals](docs/goals.md).

## How it works

- Knowledge, data, and ontology come first; AI builds the system on top.
- Rules are explicit; conclusions are computed from sourced data, not guessed.
- Business experts change the rules; IT handles data access, permissions, security, and delivery.

## Quick start

**Prerequisite:** document parsing needs a VLM server. Run `vlm-server/` (mlx-vlm) on the host; without it, uploads and parse jobs fail. See [`vlm-server/README.md`](vlm-server/README.md).

**Docker**

1. `cp backend/.env.example backend/.env` and edit (secrets, auth, optional LLM URLs).
2. `docker compose -f docker/docker-compose.yml up -d --build`
3. Open **http://localhost:8082**.

**Backend and frontend on the host**

1. `cp backend/.env.example backend/.env` and `cp frontend/.env.example frontend/.env`.
2. `cd docker && docker compose -f docker-compose.yml up -d postgres minio neo4j`
3. `cd ../backend && uv sync && alembic upgrade head`
4. `uvicorn app.main:app --reload --port 8102`
5. `cd ../frontend && npm install && npm run dev`
6. Open **http://localhost:5173** (Vite proxies `/api` to the backend).

Detailed setup: [`docs/developer/setup.md`](docs/developer/setup.md). Docker ports and env overrides: [`docker/README.md`](docker/README.md).

## Repository layout

- **`backend/`** — FastAPI API (default port **8102**)
- **`frontend/`** — React + Vite (default port **5173**)
- **`openkms-cli/`** — Parse and pipeline CLI (used by the background worker)
- **`openkms-skill/`** — Optional Agent Skill + Python CLI for agents calling the public HTTP API (personal API keys in the app under **Settings**; see [`docs/features/openkms-skill.md`](docs/features/openkms-skill.md))
- **`vlm-server/`** — **mlx-vlm** HTTP server for **PaddleOCR-VL** document parsing (run this separately)
- **`docker/`** — Dockerfiles and **`docker-compose.yml`** (run via `docker compose -f docker/docker-compose.yml …` from the repo root)
- **`docs/`** — Architecture, features, developer setup, and research notes (published at [yingrui.github.io/openKMS](https://yingrui.github.io/openKMS/))
- **`qa-agent/`** — Optional LangGraph Q&A service (proxied by the backend for KB chat)

## Documentation

| Topic | Where |
|--------|--------|
| Vision and direction | [`docs/goals.md`](docs/goals.md) |
| Run locally | [`docs/quickstart.md`](docs/quickstart.md) · [`docs/developer/setup.md`](docs/developer/setup.md) |
| Features & APIs | [`docs/functionalities.md`](docs/functionalities.md) |
| Security design | [`docs/security.md`](docs/security.md) · [`docs/features/data-security.md`](docs/features/data-security.md) |
| Roadmap | [`docs/development_plan.md`](docs/development_plan.md) |
| Comparisons and research | [`docs/research/`](docs/research/) |

## Status and license

Active development (0.1.x). Core surfaces are usable; some modules (evaluation, connectors, media) are partial or experimental. See [Development plan](docs/development_plan.md).

Apache-2.0. See [LICENSE](LICENSE).
