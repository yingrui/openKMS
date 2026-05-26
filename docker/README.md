# Install with Docker Compose

## Full stack (`docker-compose.yml`)

Backend, worker (`openkms-cli` with parse/pipeline/metadata/kb), frontend (nginx), Postgres (pgvector), MinIO, **Neo4j** (ontology graph).

**Worker** is `platform: linux/amd64` so Paddle wheels install on Apple Silicon (QEMU). Needs **`libgl1`** in the image for OpenCV/PaddleX.

From **repo root**:

```bash
cp backend/.env.example backend/.env   # edit as needed
docker compose -f docker/docker-compose.yml up -d --build
```

Or from **`docker/`**: `docker compose -f docker-compose.yml up -d --build`.

- **UI:** http://localhost:8082 — nginx → `/api`, `/internal-api`, `/login`, sessions, MinIO bucket path. Backend is **not** on the host; use this origin for API calls.
- **Postgres / MinIO:** no host ports; services use `postgres` and `minio` on the Docker network.
- **Neo4j:** Host maps use **7476** (Browser) and **7689** (Bolt)—Neo4j defaults **7474** / **7687** plus **2** when those ports are already in use on the machine. **Inside the stack** (Console data source, backend) use hostname **`neo4j`** and port **`7687`** (container port, not 7689). Default auth: user **`neo4j`**, password **`openkms-neo4j-dev`**.

Compose sets DB host, MinIO URL, `OPENKMS_FRONTEND_URL=http://localhost:8082`, `OPENKMS_DEBUG=true`, `OPENKMS_BACKEND_URL=http://backend:8102`. Rest from `backend/.env`. Match **`OPENKMS_AUTH_MODE=local`** in `.env` to the frontend build (`VITE_AUTH_MODE=local`) to avoid a mode banner.

**VLM:** Start **`vlm-server`** on the host first (`vlm-server/`, default **8101**). Document parse fails without it. The worker usually uses **`OPENKMS_VLM_URL=http://host.docker.internal:8101`** (compose `extra_hosts: host-gateway`); override in `backend/.env` if your VLM runs elsewhere.

Local auth + metadata extraction: set **`OPENKMS_CLI_BASIC_*`** in `backend/.env` for worker → `openkms-cli` API calls.

### Neo4j (Console data source)

The API does not auto-register Neo4j. After the stack is up, sign in at **http://localhost:8082**, open **Console → Data sources**, and create a **Neo4j** source:

| Field | Docker compose value |
|--------|----------------------|
| Kind | `neo4j` |
| Host | `neo4j` |
| Port | `7687` |
| Username | `neo4j` |
| Password | `openkms-neo4j-dev` |

Use **Test connection**, then save. **Object types** / **Link types** can index to Neo4j; **Objects & links** explorer and feature toggles will show Neo4j as available.

Infra without app services: `docker compose -f docker-compose.yml up -d postgres minio neo4j`

### Neo4j exits with code 3 right after “Changed password…”

That usually means the **`neo4j_data` volume** was created on an earlier run with a different `NEO4J_AUTH` or a failed first boot. Neo4j then shuts down before **Starting…** appears in the logs.

From **`docker/`** (compose project name is often `docker`):

```bash
docker compose -f docker-compose.yml down
docker volume rm docker_neo4j_data
docker compose -f docker-compose.yml up -d
```

Use `docker volume ls | grep neo4j` if the volume name differs. **Do not** remove `docker_neo4j_data` if you need to keep graph data.

```bash
docker compose -f docker/docker-compose.yml down
```

## Faster builds (China / slow networks)

**`docker-compose.yml`** defaults to common **mainland China** mirrors. Override in **`docker/.env`** or disable with empty values (e.g. `UV_INDEX_URL=`).

| Build-arg | Default in compose | Used in |
|-----------|-------------------|---------|
| `APT_MIRROR` | `mirrors.aliyun.com` | `Dockerfile` (`backend`, `worker`) — Debian apt |
| `UV_INDEX_URL` | `https://mirrors.aliyun.com/pypi/simple/` | **Aliyun** PyPI — `uv sync`, worker `uv pip` |
| `UV_EXTRA_INDEX_URL` | `https://pypi.tuna.tsinghua.edu.cn/simple` | Second China mirror for worker `openkms-cli` installs (set to `https://pypi.org/simple` only if a wheel is missing) |
| `NPM_REGISTRY` | `https://registry.npmmirror.com` | **npmmirror** (原淘宝 npm 镜像) — `npm ci` / build |

To override defaults, create **`docker/.env`** (optional) with e.g. `UV_INDEX_URL=` for upstream PyPI, then build from **`docker/`**:

```bash
cd docker
docker compose -f docker-compose.yml build
```

From **repo root** (optional `docker/.env` overrides):

```bash
docker compose -f docker/docker-compose.yml --env-file docker/.env build
```

Or with explicit build-args:

```bash
docker compose -f docker/docker-compose.yml build \
  --build-arg APT_MIRROR=mirrors.aliyun.com \
  --build-arg UV_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/ \
  --build-arg UV_EXTRA_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com
```

**Backend `uv.lock`:** wheel URLs are pinned to **Aliyun** (`mirrors.aliyun.com/pypi/packages/…`) via `[[tool.uv.index]]` in `backend/pyproject.toml`. After dependency changes run `cd backend && uv lock` on a machine that can reach the mirror. `uv sync --frozen` in Docker then downloads from China, not `files.pythonhosted.org`.

**Docker image pulls** (`FROM python:…`, `FROM node:…`, `ghcr.io/astral-sh/uv`) still use your Docker **registry** mirror in `daemon.json` if Hub/ghcr.io is slow—that is separate from apt/PyPI/npm.

## Files

| File | Role |
|------|------|
| `Dockerfile` | `backend` + `worker` targets |
| `Dockerfile.frontend` | Vite build + nginx |
| `apt-set-mirror.sh` | Rewrites Debian apt sources when `APT_MIRROR` is set |
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
