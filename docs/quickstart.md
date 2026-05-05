# Quickstart

Two paths: **Docker** (everything containerised, except the VLM server) or **host** (run backend and frontend directly while Postgres and MinIO run in containers). In both cases the **VLM server** runs separately so you can point it at Apple Silicon or a GPU box and avoid huge images.

## Prerequisites

- Docker (Compose v2) for either path.
- For the host path: Python 3.12+, [uv](https://github.com/astral-sh/uv), Node.js 20+, npm.
- For document parsing: a running **mlx-vlm** server (`vlm-server/README.md`, default `http://localhost:8101`).

## Option A — Everything in Docker

```bash
# 1. Start the VLM server separately (Apple Silicon / GPU host).
cd vlm-server && ./start.sh

# 2. Configure secrets and auth.
cp backend/.env.example backend/.env
$EDITOR backend/.env

# 3. Build and start the stack.
docker compose -f docker/docker-compose.yml up -d --build

# 4. Open the SPA.
open http://localhost:8082
```

The Compose stack runs Postgres (pgvector), MinIO, the FastAPI backend, the procrastinate worker, and an nginx-served frontend. The worker reaches a host-run VLM via `host.docker.internal:8101` by default.

For ports, env overrides, and worker → VLM details, see [Operations · Docker](operations/docker.md).

## Option B — Backend and frontend on the host

```bash
# 1. VLM server (separate process).
cd vlm-server && ./start.sh

# 2. Env files.
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Postgres and MinIO via Compose only.
cd docker && docker compose -f docker-compose.yml up -d postgres minio
cd ..

# 4. Backend (terminal 1).
cd backend && uv sync && alembic upgrade head
uvicorn app.main:app --reload --port 8102

# 5. Frontend (terminal 2).
cd frontend && npm install && npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` and `/internal-api` to the backend.

For the full host setup (pgvector troubleshooting, OIDC config, optional QA Agent), see [Developer setup](developer/setup.md).

## After it's running

| Action | URL |
|---|---|
| SPA (Docker) | <http://localhost:8082> |
| SPA (host) | <http://localhost:5173> |
| Backend OpenAPI | <http://localhost:8102/docs> |
| MinIO console | <http://localhost:9001> (set in `.env.example`) |

Sign in (OIDC or local), create a **document channel**, upload a file, and watch the worker parse it.
