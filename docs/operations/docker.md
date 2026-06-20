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

In production, a **host reverse proxy** (TLS, domain) often sits in front of `:8082`. Project agent streams are long-lived NDJSON; set **`proxy_read_timeout`** high enough on **both** nginx hops (see [Agents — Troubleshooting](../features/openkms-agents.md#troubleshooting) and [`docker/README.md`](https://github.com/yingrui/openKMS/blob/main/docker/README.md)).

## Bring it up

From the repo root:

```bash
cp docker/.env.example docker/.env   # optional — VLM URL, Baidu keys, build mirrors
docker compose -f docker/docker-compose.yml up -d --build
open http://localhost:8082
```

Or **`cd docker`**, copy **`.env.example`** → **`.env`**, and run **`docker compose up -d --build`** (no **`--env-file`** needed).

Compose loads **`docker/.env`** automatically. **`--env-file docker/.env`** is optional when running from the repo root. For OIDC or vars not in **`docker/.env.example`**, see **`backend/.env.example`**.

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

Override **`OPENKMS_VLM_URL`** in **`docker/.env`** if your VLM runs elsewhere. Without a reachable VLM, **paddleocr-doc-parse** jobs will fail.

For **baidu-doc-parse**, set **`OPENKMS_BAIDU_CLOUD_API_KEY`** and **`OPENKMS_BAIDU_CLOUD_SECRET_KEY`** in **`docker/.env`** instead (optional **`BAIDU_*_URL`** overrides; see **`docker/.env.example`**).

## Auth mode must match the build

The frontend image is built with `VITE_AUTH_MODE` baked in. Compose defaults are **local auth only** (no OIDC env in `docker-compose.yml`). For OIDC, set **`OPENKMS_AUTH_MODE=oidc`**, all **`OPENKMS_OIDC_*`** vars (see **`backend/.env.example`**), and rebuild the frontend with **`VITE_AUTH_MODE=oidc`** — not covered by **`docker/.env.example`** alone.

**openkms-cli** Basic defaults to **`OPENKMS_CLI_BASIC_*`**; worker/scheduler heartbeats use **`OPENKMS_WORKER_BASIC_*`** (local) or **`OPENKMS_WORKER_OIDC_*`** (OIDC; add the client id to **`OPENKMS_INTERNAL_SERVICE_CLIENT_IDS`**).

## See also

- [`docker/README.md`](https://github.com/yingrui/openKMS/blob/main/docker/README.md) — canonical short reference, kept next to the Compose file.
- [Architecture](../architecture.md) — how the services fit together.
- [Security design](../security.md) — principles; [Console & authentication](../features/console-and-auth.md) — auth mode and secrets in deploy.
