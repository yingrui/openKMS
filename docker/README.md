# Docker

## Full stack (`docker-compose.yml`)

Builds images for **backend**, **worker** (includes `openkms-cli` with pipeline, metadata, kb extras — not Paddle parse), and **frontend** (static build + nginx). Pulls **Postgres (pgvector)** and **MinIO**.

From the **repository root**:

```bash
cp backend/.env.example backend/.env   # edit secrets and any overrides
make -C docker build                  # optional; `up` builds as needed
make -C docker up                     # build (if needed) + start all services
```

- **UI:** http://localhost:8080 (nginx proxies `/api`, `/login`, session routes, and `/buckets/openkms/` to the stack)
- **API (direct):** http://localhost:8102  
- **Postgres:** localhost:5432 · **MinIO:** localhost:9000 (console 9001)

Compose sets `OPENKMS_DATABASE_HOST=postgres`, `AWS_ENDPOINT_URL=http://minio:9000`, `OPENKMS_FRONTEND_URL=http://localhost:8080`, and `OPENKMS_DEBUG=true`. Other values come from `backend/.env` (merged; compose wins on overlapping keys).

The **worker** uses `OPENKMS_BACKEND_URL=http://backend:8102` and `OPENKMS_VLM_URL=http://host.docker.internal:8101` so `openkms-cli` can reach the API and (on Docker Desktop / Linux with `host-gateway`) a VLM on the host. Parsing jobs need a reachable VLM; the image does **not** include PaddleOCR.

Stop everything:

```bash
make -C docker down
```

## Infra only (Postgres + MinIO)

If you run the backend and frontend on the host, start only those services:

```bash
cd docker && docker compose -f docker-compose.yml up -d postgres minio
```

Then install and run the app yourself, for example:

```bash
cd backend && uv sync && alembic upgrade head
cd backend && uvicorn app.main:app --reload --port 8102   # terminal 1
cd frontend && npm install && npm run dev               # terminal 2
```

## Files

| File | Role |
|------|------|
| `Dockerfile` | Targets `backend` and `worker` (Python + uv) |
| `Dockerfile.frontend` | Vite production build + nginx |
| `nginx-frontend.conf` | Proxies API and MinIO bucket path like Vite dev |
| `docker-compose.yml` | All services |
| `Makefile` | `build`, `up`, `down` only (wrappers around `docker compose`) |

Repository root **`.dockerignore`** keeps context small for builds.
