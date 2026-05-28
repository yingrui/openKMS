# Operations · Docker

The full stack ships as a single `docker compose` file. This page is a runtime / operator summary; the file you commit changes against lives at [`docker/README.md`](https://github.com/yingrui/openKMS/blob/main/docker/README.md) in the repo (kept short so Compose stays the source of truth).

## What runs

| Service | Image | Notes |
|---|---|---|
| `frontend` | `docker/Dockerfile.frontend` | Vite build served by nginx; the only port published on the host (**8082**) |
| `backend` | `docker/Dockerfile` (`backend` target) | FastAPI on `8102`, no host port |
| `worker` | `docker/Dockerfile` (`worker` target) | Procrastinate + `openkms-cli`; **`platform: linux/amd64`** so Paddle wheels install on Apple Silicon via QEMU; image installs `libgl1` for OpenCV / PaddleX |
| `postgres` | `pgvector/pgvector` | Database + pgvector, no host port |
| `minio` | `minio/minio` | S3-compatible store; UI optionally on `9001` |

The browser only ever talks to nginx on **`http://localhost:8082`**, which proxies `/api`, `/internal-api`, the auth routes, and the MinIO bucket path through to the backend.

## Bring it up

From the repo root:

```bash
docker compose -f docker/docker-compose.yml up -d --build
open http://localhost:8082
```

Optional: `docker compose -f docker/docker-compose.yml --env-file backend/.env up -d --build` after copying `backend/.env.example` — substitutes `${OPENKMS_*}` in compose; the file is not mounted into containers.

Tear it down:

```bash
docker compose -f docker/docker-compose.yml down
```

## Reaching the VLM server

The Docker stack does **not** include the VLM server. Run **`mlx-vlm`** separately (`vlm-server/`, default **8101**) so you can put it on Apple Silicon or a GPU box and avoid huge images.

The worker container reaches a host-run VLM via Docker's `host-gateway`:

```text
OPENKMS_VLM_URL=http://host.docker.internal:8101
```

Override via `--env-file backend/.env` or edit `x-backend-env` in `docker-compose.yml` if your VLM runs elsewhere. Without a reachable VLM, document-parse jobs will fail.

## Worker persistent storage

The **worker** service mounts two named volumes (see `docker-compose.yml`):

| Volume | Mount | Purpose |
|---|---|---|
| `openkms_worker_paddlex_cache` | `/var/lib/openkms/paddlex` | PaddleOCR / PaddleX model downloads (`PADDLE_PDX_CACHE_HOME`) |
| `openkms_worker_work` | `/var/lib/openkms/work` | openkms-cli pipeline scratch (`OPENKMS_CLI_OUTPUT_DIR` → `…/work/output`, `_pipeline_work`, `parsed/`) |

Parsed artifacts still upload to MinIO; these volumes keep large downloads and temp files across container restarts. To reset: `docker compose … down` then `docker volume rm docker_openkms_worker_paddlex_cache docker_openkms_worker_work` (prefix may match your compose project name).

## Auth mode must match the build

The frontend image is built with `VITE_AUTH_MODE` baked in. Compose defaults are **local auth only** (no OIDC env in `docker-compose.yml`). For OIDC, set **`OPENKMS_AUTH_MODE=oidc`**, all **`OPENKMS_OIDC_*`** vars, and **`VITE_AUTH_MODE=oidc`** via **`--env-file backend/.env`**, then rebuild the frontend image.

CLI basic credentials for worker → `openkms-cli` default to **`OPENKMS_CLI_BASIC_*`** in compose (`openkms-cli` / `change-me`).

## See also

- [`docker/README.md`](https://github.com/yingrui/openKMS/blob/main/docker/README.md) — canonical short reference, kept next to the Compose file.
- [Architecture](../architecture.md) — how the services fit together.
- [Security](../security.md) — secrets and auth-mode contracts.
