# Install with Docker Compose

## Full stack (`docker-compose.yml`)

Backend, worker (`openkms-cli` with parse/pipeline/metadata/kb), frontend (nginx), Postgres (pgvector), MinIO.

**Worker** is `platform: linux/amd64` so Paddle wheels install on Apple Silicon (QEMU). Needs **`libgl1`** in the image for OpenCV/PaddleX.

From **repo root**:

```bash
cp backend/.env.example backend/.env   # edit as needed
docker compose -f docker/docker-compose.yml up -d --build
```

Or from **`docker/`**: `docker compose -f docker-compose.yml up -d --build`.

- **UI:** http://localhost:8082 — nginx → `/api`, `/internal-api`, `/login`, sessions, MinIO bucket path. Backend is **not** on the host; use this origin for API calls.
- **Postgres / MinIO:** no host ports; services use `postgres` and `minio` on the Docker network.

Compose sets DB host, MinIO URL, `OPENKMS_FRONTEND_URL=http://localhost:8082`, `OPENKMS_DEBUG=true`, `OPENKMS_BACKEND_URL=http://backend:8102`. Rest from `backend/.env`. Match **`OPENKMS_AUTH_MODE=local`** in `.env` to the frontend build (`VITE_AUTH_MODE=local`) to avoid a mode banner.

**VLM:** Start **`vlm-server`** on the host first (`vlm-server/`, default **8101**). Document parse fails without it. The worker usually uses **`OPENKMS_VLM_URL=http://host.docker.internal:8101`** (compose `extra_hosts: host-gateway`); override in `backend/.env` if your VLM runs elsewhere.

Local auth + metadata extraction: set **`OPENKMS_CLI_BASIC_*`** in `backend/.env` for worker → `openkms-cli` API calls.

```bash
docker compose -f docker/docker-compose.yml down
```

## Files

| File | Role |
|------|------|
| `Dockerfile` | `backend` + `worker` targets |
| `Dockerfile.frontend` | Vite build + nginx |
| `nginx-frontend.conf` | Reverse proxy |
| `docker-compose.yml` | Stack |

Repo **`.dockerignore`** shrinks build context.

## Base image CVE warnings vs build time

IDE scanners may report HIGH CVEs on **`FROM python:…-slim-bookworm`** or **`FROM node:…-bookworm-slim`** — those come from the **upstream tag snapshot**, not your app layers. We **do not** run **`apt-get upgrade`** in the Dockerfiles: on slow or mirror-restricted hosts it adds many minutes and often **times out or fails** mid-build.

Refresh bases instead:

```bash
docker compose -f docker-compose.yml build --pull
```

Use a **registry mirror** for Docker Hub / `ghcr.io` if pulls fail (see your cloud’s container mirror docs). Rebuild after official `python` / `node` images are republished with newer Debian packages.
