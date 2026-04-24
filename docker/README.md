# Docker

## Full stack (`docker-compose.yml`)

Builds images for **backend**, **worker** (includes `openkms-cli` with **pipeline, metadata, kb, parse** so PaddleOCR-VL doc-parse works), and **frontend** (static build + nginx). Pulls **Postgres (pgvector)** and **MinIO**.

The **worker** service sets **`platform: linux/amd64`**: PaddlePaddle wheels exist for **linux/amd64** (and macOS arm64), not **linux/arm64**. On Apple Silicon, the worker image builds and runs as amd64 (typically under QEMU); native arm64 Linux would need an alternate parse setup. The worker stage also installs **`libgl1`** (OpenCV / PaddleX import needs `libGL.so.1` in slim images).

From the **repository root** (use **`docker compose`**; the compose file path is explicit so you do not need to `cd docker`):

```bash
cp backend/.env.example backend/.env   # edit secrets and any overrides
docker compose -f docker/docker-compose.yml build              # optional; up --build builds as needed
docker compose -f docker/docker-compose.yml up -d --build      # start all services
```

From **`docker/`** you can shorten flags: `cd docker && docker compose -f docker-compose.yml up -d --build`.

- **UI:** http://localhost:8082 (nginx proxies `/api`, `/login`, session routes, and `/buckets/openkms/` to the stack)
- **API (direct):** http://localhost:8102  
- **Postgres / MinIO:** no host `ports` in this compose file (services use `postgres:5432` and `minio:9000` on the Docker network only). **MinIO** is not exposed on localhost; use the UI bucket proxy or add `ports` in a local override if you need the S3 API or console from the host.

Compose sets `OPENKMS_DATABASE_HOST=postgres`, `AWS_ENDPOINT_URL=http://minio:9000`, `OPENKMS_FRONTEND_URL=http://localhost:8082`, and `OPENKMS_DEBUG=true`. Other values come from `backend/.env` (merged; compose wins on overlapping keys). The frontend image is built with **`VITE_AUTH_MODE=local`**; set **`OPENKMS_AUTH_MODE=local`** in `backend/.env` (as in `backend/.env.example`) so the API matches and you avoid a mismatch banner vs `public-config`.

The **worker** uses `OPENKMS_BACKEND_URL=http://backend:8102` and `OPENKMS_VLM_URL=http://host.docker.internal:8101` so `openkms-cli` can reach the API and (on Docker Desktop / OrbStack with `host-gateway`) a VLM on the host. Doc-parse jobs need a reachable VLM (**mlx-vlm-server**); the worker image includes the **PaddleOCR-VL** Python stack via `openkms-cli[parse]`.

In **`OPENKMS_AUTH_MODE=local`**, channels with **metadata extraction** require **`OPENKMS_CLI_BASIC_USER`** and **`OPENKMS_CLI_BASIC_PASSWORD`** in `backend/.env` (same as `backend/.env.example`): the worker passes the merged env into `openkms-cli`, which uses them for API calls during `--extract-metadata`.

Stop everything:

```bash
docker compose -f docker/docker-compose.yml down
```

## Infra only (Postgres + MinIO)

If you run the backend and frontend on the host, start only those services:

```bash
cd docker && docker compose -f docker-compose.yml up -d postgres minio
```

This file does **not** publish Postgres or MinIO on the host. For a host-process backend, set `OPENKMS_DATABASE_HOST` / `AWS_ENDPOINT_URL` to something reachable from your machine (e.g. add `ports` for `postgres` and `minio` in a [compose override](https://docs.docker.com/compose/how-tos/multiple-compose-files/extend/), or run Postgres/MinIO separately with published ports).

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

Repository root **`.dockerignore`** keeps context small for builds.
