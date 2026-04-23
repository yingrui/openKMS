# openKMS

Open Knowledge Management System — document channels, parsing, knowledge bases, and RAG-style Q&A.

## Repository layout

- **`backend/`** — FastAPI API (default port **8102**)
- **`frontend/`** — React + Vite (default port **5173**)
- **`openkms-cli/`** — Parse and pipeline CLI (used by the background worker)
- **`vlm-server/`** — **mlx-vlm** HTTP server for **PaddleOCR-VL** document parsing (run this separately)
- **`docker/`** — Dockerfiles, **`docker-compose.yml`**, **`Makefile`** (`build`, `up`, `down` only)
- **`docs/`** — Architecture, features, and developer setup

## Quick start

### Option A — Everything in Docker

1. **Recommended:** start **mlx-vlm** separately (see above and **`vlm-server/README.md`**).
2. `cp backend/.env.example backend/.env` and edit (secrets, auth, optional LLM URLs).
3. `make -C docker up` — builds images and starts Postgres (pgvector), MinIO, backend, worker, and frontend (nginx).
4. Open **http://localhost:8082**.

See **`docker/README.md`** for ports, env overrides, and how the worker reaches a host VLM.

### Option B — Backend and frontend on the host

1. **Recommended:** start **mlx-vlm** separately for parsing (**`vlm-server/README.md`**).
2. `cp backend/.env.example backend/.env` and `cp frontend/.env.example frontend/.env`.
3. Start Postgres and MinIO: `cd docker && docker compose -f docker-compose.yml up -d postgres minio`
4. `cd backend && uv sync && alembic upgrade head`
5. Run **`uvicorn app.main:app --reload --port 8102`** in `backend/` and **`npm install && npm run dev`** in `frontend/` (two terminals).
6. Open **http://localhost:5173** (Vite proxies `/api` to the backend).

For a full walkthrough, auth modes, and optional services (QA agent, etc.), see **`docs/for developer/dev_environment_setup.md`** and **`docs/README.md`**.

## PaddleOCR-VL / mlx-vlm (run separately)

Document parsing expects a **VLM server** compatible with PaddleOCR-VL (default URL **http://localhost:8101**). **Do not rely on the main Docker stack for this** — run **mlx-vlm** on the host (or another machine) so you can use Apple Silicon / GPU and avoid huge images.

1. See **`vlm-server/README.md`** for how to start the server (e.g. `./start.sh` in `vlm-server/`).
2. Point **`OPENKMS_VLM_URL`** (backend, worker, `openkms-cli`) at that URL. In the full Docker stack, the worker defaults to **`http://host.docker.internal:8101`** so a host-run mlx-vlm is reachable.

Without a running VLM, uploads and pipeline jobs that parse documents will fail.
