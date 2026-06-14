# Install with Docker Compose

## Full stack (`docker-compose.yml`)

Backend, **scheduler** (central cron hub), worker (`openkms-cli` with parse/pipeline/metadata/kb), **qa-agent** (KB Q&A / hybrid retrieve), frontend (nginx), Postgres (pgvector), MinIO, **Neo4j** (ontology graph).

Run **one** `scheduler` replica only. Connector cron and other `scheduled_triggers` do not run if scheduler is down (Console health shows scheduler offline). Optional **`OPENKMS_WORKER_NAME`** on the worker service names instances on the health page when scaling workers.

**Worker** is `platform: linux/amd64` so Paddle wheels install on Apple Silicon (QEMU). Needs **`libgl1`** in the image for OpenCV/PaddleX.

From **`docker/`** (recommended):

```bash
cp .env.example .env   # optional — edit VLM URL, Baidu keys, secrets, mirrors
./build-and-run.sh
```

**`build-and-run.sh`** is the default rebuild-and-restart path. It (1) builds **`openkms-backend-base`** and **`openkms-worker-base`** (cached unless lockfiles / Dockerfiles changed), (2) rebuilds app images with the current git hash as **`VITE_APP_VERSION`** (bottom-left build stamp in the UI), (3) runs **`docker compose down`**, then (4) **`up -d`**. Run it from **`docker/`** — the script expects **`docker-compose.yml`** in the working directory.

Compose loads **`.env`** in this directory automatically for `${…}` substitution in the YAML.

Manual compose (skip base rebuild or avoid `down`):

```bash
cd docker
docker compose up -d --build
```

From **repo root**:

```bash
cp docker/.env.example docker/.env   # optional
cd docker && ./build-and-run.sh
```

You do **not** need `--env-file` if the file is **`docker/.env`** (Compose reads it from the compose file’s directory). To be explicit, or if the file lives elsewhere:

```bash
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

Values substitute `${…}` in the YAML only — the file is **not** mounted into containers. Shell exports with the same name override `.env`.

For OIDC or extra backend-only vars, see **`backend/.env.example`** (you may merge those into `docker/.env` or pass `--env-file backend/.env` in addition).

- **UI:** http://localhost:8082 — nginx → `/api`, `/internal-api`, `/login`, sessions, MinIO bucket path. Backend is **not** on the host; use this origin for API calls.
- **Postgres / MinIO:** no host ports; services use `postgres` and `minio` on the Docker network.
- **Neo4j:** Host maps use **7476** (Browser) and **7689** (Bolt)—Neo4j defaults **7474** / **7687** plus **2** when those ports are already in use on the machine. **Inside the stack** (Console data source, backend) use hostname **`neo4j`** and port **`7687`** (container port, not 7689). Default auth: user **`neo4j`**, password **`openkms-neo4j-dev`**.

Compose **`environment`** sets DB/MinIO URLs, local auth defaults, `OPENKMS_VLM_URL=http://host.docker.internal:8101`, and CLI basic credentials. Frontend build uses **`VITE_AUTH_MODE=local`** (match **`OPENKMS_AUTH_MODE=local`** in compose defaults).

**VLM:** Start **`vlm-server`** on the host first (`vlm-server/`, default **8101**) for the PaddleOCR pipeline. Document parse fails without it. Override **`OPENKMS_VLM_URL`** in **`docker/.env`**.

**Baidu Cloud parse:** For pipeline **`baidu-doc-parse`**, set **`OPENKMS_BAIDU_CLOUD_*`** and **`OPENKMS_BAIDU_BOS_*`** in **`docker/.env`** (see **`docker/.env.example`**); worker uploads to private BOS then submits presigned **`file_url`**. No VLM required. Rebuild worker after changing Baidu env (`docker compose up -d --build worker`).

**QA agent:** **http://localhost:8103** on the host; default LLM from Console → Models. Env from the same compose **`environment`** pattern as backend/worker.

For KB Q&A in the UI, set each knowledge base **Agent URL** to **`http://qa-agent:8103`** (hostname on the Docker network, not `localhost`). The backend proxies `/ask` and `/ask/stream` to that URL.

Local auth + metadata extraction: defaults **`OPENKMS_CLI_BASIC_*`** in compose (`openkms-cli` / `change-me`); override in **`docker/.env`** if needed.

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

**`docker-compose.yml`** defaults to common **mainland China** mirrors. Override in **`docker/.env`** (copy from **`docker/.env.example`**) or disable with empty values (e.g. `UV_INDEX_URL=`).

| Build-arg | Default in compose | Used in |
|-----------|-------------------|---------|
| `APT_MIRROR` | `mirrors.aliyun.com` | `Dockerfile.backend-base`, `Dockerfile.worker-base`, `Dockerfile.qa-agent` — Debian apt |
| `UV_INDEX_URL` | `https://mirrors.aliyun.com/pypi/simple/` | **Aliyun** PyPI — `uv sync`, worker-base `openkms-cli` install |
| `UV_EXTRA_INDEX_URL` | `https://pypi.tuna.tsinghua.edu.cn/simple` | Second China mirror for worker-base `openkms-cli` install (set to `https://pypi.org/simple` only if a wheel is missing) |
| `NPM_REGISTRY` | `https://registry.npmmirror.com` | **npmmirror** (原淘宝 npm 镜像) — `npm ci` / build |

To override defaults, copy **`docker/.env.example`** to **`docker/.env`**, edit, then build from **`docker/`**:

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

### Pre-built base images

Two bases keep backend/scheduler images lean while caching slow worker parse deps:

| Image | Contents | Rebuild when |
|-------|----------|--------------|
| **`openkms-backend-base:local`** | Backend Python deps (`uv sync`) | `backend/uv.lock` changes |
| **`openkms-worker-base:local`** | Backend base + LibreOffice/OpenCV apt libs + **`openkms-cli[pipeline,metadata,kb,parse,baidu]`** pip install | `backend/uv.lock`, `openkms-cli/pyproject.toml`, or `openkms-cli/uv.lock` changes |

App builds only copy source and run a fast `uv sync`. Worker copies fresh **`openkms-cli`** source over the editable install in the base.

**`build-and-run.sh`** builds both bases first; Docker layer cache makes that fast when only app code changed. **`build-base.sh`** builds **`openkms-backend-base`** then **`openkms-worker-base`** (worker extends the backend image — they cannot build in parallel). Rebuild bases explicitly:

```bash
cd docker
./build-base.sh                    # both bases
./build-and-run.sh                 # bases + app + restart
```

Optional tags: **`OPENKMS_BACKEND_BASE_TAG`**, **`OPENKMS_WORKER_BASE_TAG`** in **`docker/.env`** (default **`local`**).

**Docker image pulls** (`FROM python:…`, `FROM node:…`, `ghcr.io/astral-sh/uv`) still use your Docker **registry** mirror in `daemon.json` if Hub/ghcr.io is slow—that is separate from apt/PyPI/npm.

## Files

| File | Role |
|------|------|
| `.env.example` | Compose `${…}` overrides template (copy to `.env`) |
| `build-and-run.sh` | **Recommended:** build bases + app (with git stamp), restart stack |
| `Dockerfile.backend-base` | Pre-built `openkms-backend-base` (backend Python deps) |
| `Dockerfile.worker-base` | Pre-built `openkms-worker-base` (parse apt + openkms-cli pip install) |
| `build-base.sh` | Rebuild both base images (after lockfile / CLI dep changes) |
| `Dockerfile` | App layers + `backend` / `worker` targets |
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
