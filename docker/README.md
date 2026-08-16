# Install with Docker Compose

## Full stack (`docker-compose.yml`)

Backend, **scheduler** (central cron hub), worker (`openkms-cli` with parse/pipeline/metadata/kb), **ontology-function-service** (ofs executor for Ontology Functions), **qa-agent** (KB Q&A / hybrid retrieve), frontend (nginx), Postgres (pgvector), MinIO, **Neo4j** (ontology graph).

Run **one** `scheduler` replica only. Connector cron and other `scheduled_triggers` do not run if scheduler is down (Console health shows scheduler offline). Optional **`OPENKMS_WORKER_NAME`** on the worker service names instances on the health page when scaling workers.

**Worker** is `platform: linux/amd64` so Paddle wheels install on Apple Silicon (QEMU). Needs **`libgl1`** in the image for OpenCV/PaddleX.

From **`docker/`** (recommended):

```bash
cp .env.example .env   # optional — edit VLM URL, Baidu keys, secrets, mirrors
./build-and-run.sh
```

**`build-and-run.sh`** is the default rebuild-and-restart path (run from **`docker/`**):

```bash
./build-and-run.sh                  # rebuild bases only if deps changed → apps → restart
./build-and-run.sh --rebuild-bases  # always rebuild bases → apps → restart
./build-and-run.sh --apps-only      # apps + restart (bases must already exist)
./build-and-run.sh --help
```

It sets **`VITE_APP_VERSION`** from the current git short hash (UI build stamp). Compose loads **`.env`** in this directory automatically for `${…}` substitution in the YAML.

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
- **Agent logs:** Interactive project agent turns log to the **`backend`** container; scheduled agent cron runs log to **`worker`**. Do not tail **`frontend`** (nginx only proxies). Example:

  ```bash
  docker compose logs -f backend worker
  docker compose logs -f backend 2>&1 | rg 'ERROR.*agent_turn'
  ```

  Set **`OPENKMS_AGENT_LOG_LEVEL=DEBUG`** in **`docker/.env`** for verbose deep-agents detail (failures always log at **ERROR** at default INFO).

- **Long agent turns (production):** Compose frontend nginx uses **`proxy_read_timeout 300s`** on `/api/`. If the UI sits behind **another** reverse proxy (e.g. host nginx → `:8082`), raise **`proxy_read_timeout`** / **`proxy_send_timeout`** on **both** layers for `/api/` (e.g. **900s**) and set **`proxy_buffering off`** for NDJSON streams. Symptom: browser request pending ~5 minutes then **network error**; host **`error.log`**: `upstream timed out while reading upstream` on `POST …/conversations/…/messages`. See [Agents — Troubleshooting](../features/openkms-agents.md#troubleshooting).

- **Postgres / MinIO:** no host ports; services use `postgres` and `minio` on the Docker network.
- **Postgres databases:**
  - **`openkms`** — app DB (`POSTGRES_DB`; Alembic). User **`postgres`** / **`postgres`**.
  - **`ontology_data_layer`** — Ontology datasets / Connector sync targets. Dedicated role **`ontology_data`** / **`openkms-ontology-data-password`** (override with **`OPENKMS_ONTOLOGY_DATA_*`** in **`docker/.env`**). Created by **`docker/postgres-init/`** on **first** cluster init only.

  On an **existing** volume (init already ran), create or **reset password** once:

  ```bash
  docker compose up -d --force-recreate postgres
  docker compose exec postgres bash /docker-entrypoint-initdb.d/01-create-ontology-data-layer.sh
  ```

  The script is idempotent: it creates the role/DB if missing and always sets the role password from **`OPENKMS_ONTOLOGY_DATA_PASSWORD`**.
  Or manually:

  ```bash
  docker compose exec postgres psql -U postgres -c "CREATE ROLE ontology_data LOGIN PASSWORD 'openkms-ontology-data-password';"
  docker compose exec postgres psql -U postgres -c "CREATE DATABASE ontology_data_layer OWNER ontology_data;"
  docker compose exec postgres psql -U postgres -d ontology_data_layer -c "GRANT ALL ON SCHEMA public TO ontology_data; ALTER SCHEMA public OWNER TO ontology_data;"
  ```

### Ontology data layer (Console data source)

After Postgres is up, register in **Console → Data sources**:

| Field | Docker compose value |
|--------|----------------------|
| Kind | `postgresql` |
| Host | `postgres` |
| Port | `5432` |
| Database | `ontology_data_layer` |
| Username | `ontology_data` |
| Password | `openkms-ontology-data-password` |

Then map tables as Ontology **Datasets**; point Connector **outputs** at those datasets.
- **Neo4j:** Host maps use **7476** (Browser) and **7689** (Bolt)—Neo4j defaults **7474** / **7687** plus **2** when those ports are already in use on the machine. **Inside the stack** (Console data source, backend) use hostname **`neo4j`** and port **`7687`** (container port, not 7689). Default auth: user **`neo4j`**, password **`openkms-neo4j-dev`**.

Compose **`environment`** sets DB/MinIO URLs, local auth defaults, `OPENKMS_VLM_URL=http://host.docker.internal:8101`, and CLI basic credentials. Frontend build uses **`VITE_AUTH_MODE=local`** (match **`OPENKMS_AUTH_MODE=local`** in compose defaults).

**VLM:** Start **`vlm-server`** on the host first (`vlm-server/`, default **8101**) for the PaddleOCR pipeline. Document parse fails without it. Override **`OPENKMS_VLM_URL`** in **`docker/.env`**.

**Baidu Cloud parse:** For pipeline **`baidu-doc-parse`**, set **`OPENKMS_BAIDU_CLOUD_*`** and **`OPENKMS_BAIDU_BOS_*`** in **`docker/.env`** (see **`docker/.env.example`**); worker uploads to private BOS then submits presigned **`file_url`**. No VLM required. Rebuild worker after changing Baidu env (`docker compose up -d --build worker`).

**QA agent:** **http://localhost:8103** on the host; default LLM from Console → Models. Env from the same compose **`environment`** pattern as backend/worker.

For KB Q&A in the UI, set each knowledge base **Agent URL** to **`http://qa-agent:8103`** (hostname on the Docker network, not `localhost`). The backend proxies `/ask` and `/ask/stream` to that URL.

**Ontology Function Service (ofs):** **http://localhost:8105** on the host; inside the stack the backend calls **`http://ontology-function-service:8105`**. Authors use **`openkms_functions.Client`** with string api names. Prefer **`127.0.0.1`** (not `localhost`) for local `OPENKMS_ONTOLOGY_FUNCTION_SERVICE_URL` / `OPENKMS_BACKEND_URL` so macOS IPv6 does not send execute to a Docker OFS while the API is IPv4-only. When OFS is in Docker and the API is on the host, set **`OPENKMS_FUNCTION_CLIENT_BASE_URL=http://host.docker.internal:8102`**. Live Preview / execute fail if this service is down.

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
| `APT_MIRROR` | `mirrors.aliyun.com` | `Dockerfile.backend-base`, `Dockerfile.worker-base`, `Dockerfile.qa-agent`, `Dockerfile.ontology-function-service` — Debian apt |
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
| **`openkms-worker-base:local`** | Backend base + LibreOffice/OpenCV apt libs + openkms-cli deps from lock + editable CLI | `backend/uv.lock`, `openkms-cli/pyproject.toml`, or `openkms-cli/uv.lock` changes (CLI **source** alone does not bust the heavy pip layer) |

App builds only copy source and run a fast `uv sync`. Worker copies fresh **`openkms-cli`** source and re-links with **`uv pip install -e --no-deps`** (heavy Paddle wheels stay in the base layer).

**Layering:** `Dockerfile.worker-base` installs openkms-cli **dependencies from `uv.lock` first**, then copies package source for a cheap editable install. Changing CLI **code** does not re-download Paddle; changing **`openkms-cli/uv.lock`** does. BuildKit **`uv` cache mounts** speed forced rebuilds.

**When to touch bases:**

```bash
cd docker
./build-and-run.sh                 # usual path (auto bases)
./build-and-run.sh --apps-only     # only app code / frontend changed
./build-and-run.sh --rebuild-bases # lockfiles or base Dockerfiles changed (or force)
./build-base.sh                    # bases only (no app rebuild / restart)
```

**`build-base.sh`** always rebuilds both bases (worker extends backend — not parallel) and writes **`.base-fingerprint`** for the next auto run.
Optional tags: **`OPENKMS_BACKEND_BASE_TAG`**, **`OPENKMS_WORKER_BASE_TAG`** in **`docker/.env`** (default **`local`**).

**Docker image pulls** (`FROM python:…`, `FROM node:…`, `ghcr.io/astral-sh/uv`) still use your Docker **registry** mirror in `daemon.json` if Hub/ghcr.io is slow—that is separate from apt/PyPI/npm.

## Files

| File | Role |
|------|------|
| `.env.example` | Compose `${…}` overrides template (copy to `.env`) |
| `build-and-run.sh` | **Recommended:** auto bases (if needed) → app images → restart (`--rebuild-bases` / `--apps-only`) |
| `compute-base-fingerprint.sh` | Hash of lockfiles + base Dockerfiles (freshness for auto mode) |
| `Dockerfile.backend-base` | Pre-built `openkms-backend-base` (backend Python deps) |
| `Dockerfile.worker-base` | Pre-built `openkms-worker-base` (parse apt + openkms-cli deps) |
| `build-base.sh` | Always rebuild both base images; writes `.base-fingerprint` |
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
