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
cp backend/.env.example backend/.env       # edit secrets / auth mode
docker compose -f docker/docker-compose.yml up -d --build
open http://localhost:8082
```

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

Override in `backend/.env` if your VLM runs elsewhere. Without a reachable VLM, document-parse jobs will fail.

## Auth mode must match the build

The frontend image is built with `VITE_AUTH_MODE` baked in. To avoid the "mode mismatch" banner, set the **same** mode in both:

- `backend/.env` — `OPENKMS_AUTH_MODE=local` (or `oidc`)
- frontend build arg — `VITE_AUTH_MODE=local` (or `oidc`)

For local-mode CLI access to the backend (worker → `openkms-cli`), set `OPENKMS_CLI_BASIC_*` in `backend/.env`.

## See also

- [`docker/README.md`](https://github.com/yingrui/openKMS/blob/main/docker/README.md) — canonical short reference, kept next to the Compose file.
- [Architecture](../architecture.md) — how the services fit together.
- [Security](../security.md) — secrets and auth-mode contracts.
