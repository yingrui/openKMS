# openKMS Backend

FastAPI backend for the Open Knowledge Management System. Uses PostgreSQL for storage and vlm-server (MLX-VLM) for document parsing.

## Prerequisites

- Python 3.11+
- PostgreSQL (localhost:5432)
- [vlm-server](../vlm-server) running at `http://localhost:8101`

## Setup

```bash
cd backend
uv sync   # creates .venv and installs dependencies from pyproject.toml + uv.lock
```

Or with pip: `pip install -e .` (requires Python 3.10+). Re-run this after pulling when `pyproject.toml` gains new packages (e.g. **langchain** for the embedded wiki agent); otherwise `./dev.sh` will install the agent stack if `import langchain_core` fails: it prefers `uv pip` when the `uv` tool is on your PATH, otherwise `python -m ensurepip` when the venv has no `pip`, then `python -m pip install`. With **Conda** active, use the same `python` for all installs; `./dev.sh` uses `python -m uvicorn` so the reload worker matches the venv.

## Configuration

Create `.env` or set environment variables (prefix `OPENKMS_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENKMS_DATABASE_HOST` | localhost | PostgreSQL host |
| `OPENKMS_DATABASE_PORT` | 5432 | PostgreSQL port |
| `OPENKMS_DATABASE_USER` | postgres | Database user |
| `OPENKMS_DATABASE_PASSWORD` | (empty) | Database password |
| `OPENKMS_DATABASE_NAME` | openkms | Database name |
| `OPENKMS_VLM_URL` | http://localhost:8101 | **mlx-vlm** (PaddleOCR-VL) base URL — not an OpenAI-compatible `/api/v1` server; see [vlm-server](../vlm-server) |
| `OPENKMS_PIPELINE_TIMEOUT_SECONDS` | 1800 | Max wait for **`run_pipeline`** (`openkms-cli pipeline run`, seconds) |
| `OPENKMS_AGENT_MODEL_ID` | (empty) | `api_models.id` for the **embedded** wiki agent (`/api/agent/...`); if empty, the **default LLM** in **Models** (category `llm`, set **Set as default** in the UI) is used. |
| `OPENKMS_AGENT_MAX_OUTPUT_TOKENS` | `65537` | **Max completion (output) cap** for the wiki agent: sent as `max_tokens` to the chat API. Default avoids invalid requests on models with low output limits; **raise** if your model allows more, **lower** for cost. |
| `OPENKMS_AGENT_RECURSION_LIMIT` | `200` | **Max LangGraph steps** (model+tool loop) per chat turn. The default was too low for bulk get/upsert; raise (e.g. 400) only if you need very large single-turn batches, or use smaller batches per message. |
| `OPENKMS_AUTH_MODE` | oidc | `oidc` (external IdP) or `local` (PostgreSQL users + `/api/auth/*`) |
| `OPENKMS_ALLOW_SIGNUP` | true | Allow `POST /api/auth/register` when `auth_mode=local` |
| `OPENKMS_INITIAL_ADMIN_USER` | (empty) | Local mode: grant `is_admin` when signup username matches (case-insensitive) |
| `OPENKMS_CLI_BASIC_USER` | (empty) | Local mode: CLI HTTP Basic username |
| `OPENKMS_CLI_BASIC_PASSWORD` | (empty) | Local mode: CLI HTTP Basic password |
| `OPENKMS_OIDC_ISSUER` | (empty) | Full OIDC issuer URL; if set, overrides base+realm below |
| `OPENKMS_OIDC_AUTH_SERVER_BASE_URL` | http://localhost:8081 | IdP base URL when issuer is derived as `{base}/realms/{realm}` |
| `OPENKMS_OIDC_REALM` | openkms | Realm segment for derived issuer |
| `OPENKMS_OIDC_CLIENT_ID` | openkms-backend | OAuth2 confidential client (backend code exchange) |
| `OPENKMS_OIDC_CLIENT_SECRET` | (empty) | OAuth2 client secret |
| `OPENKMS_OIDC_REDIRECT_URI` | http://localhost:8102/login/oauth2/code/oidc | OAuth2 callback URL registered on that client |
| `OPENKMS_FRONTEND_URL` | http://localhost:5173 | SPA origin (CORS + redirects) |
| `OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID` | openkms-frontend | Browser client id for RP-initiated logout |
| `OPENKMS_OIDC_SERVICE_CLIENT_ID` | openkms-cli | `azp` for service-only API (CLI client credentials) |

**VLM vs embeddings (avoid dead `backend/.env` keys):**

- **`OPENKMS_VLM_URL`** is the only VLM-related variable the **backend** reads (defaults to mlx-vlm on port **8101**). Pipelines can still override the parse URL from a **linked API model** on the pipeline (`model_id`).
- **`OPENKMS_VLM_API_KEY`** and **`OPENKMS_EMBEDDING_MODEL_*`** are **not** read by the backend (`app/config.py` uses `extra: "ignore"`). **`OPENKMS_VLM_API_KEY`** belongs in **`openkms-cli/.env`** when the VLM HTTP API requires a key. **KB embeddings** for search and **`kb-index`** come from the knowledge base’s **`embedding_model_id`** (Console → **Models** / KB settings), not from backend environment variables.

**Migrating env names:** Backend no longer reads `KEYCLOAK_*` — use `OPENKMS_OIDC_*` and `OPENKMS_FRONTEND_URL` as in `backend/.env.example`. **openkms-cli** no longer reads `AUTH_URL` / `AUTH_*`; use `OPENKMS_OIDC_AUTH_SERVER_BASE_URL`, `OPENKMS_OIDC_REALM`, `OPENKMS_OIDC_SERVICE_CLIENT_ID`, and `OPENKMS_OIDC_SERVICE_CLIENT_SECRET` (or `OPENKMS_OIDC_TOKEN_URL` for a full token endpoint URL).

## Database

Create the database:

```bash
createdb openkms
```

### pgvector (semantic search & embeddings)

Knowledge base search and FAQ/chunk embeddings need the **pgvector** extension in PostgreSQL.

1. Install pgvector for your PostgreSQL version, for example:
   - **macOS (Homebrew):** `brew install pgvector`
   - **Docker (recommended):** use an image that **already includes** pgvector so you never fight apt inside the container — e.g. [`pgvector/pgvector`](https://github.com/pgvector/pgvector#docker-images) tags like `pgvector/pgvector:pg15` (match your major version). Point your volume at the same data directory, or dump/restore if you change images.
   - **Docker (package not found):** the default `postgres` image often **does not** ship the Debian package `postgresql-15-pgvector` in its default apt sources. Either:
     - **Add the PostgreSQL PGDG apt repo** (inside the container), then install — example for Debian-based images (adjust `15` and codename if needed; codename = `grep VERSION_CODENAME /etc/os-release`):

       ```bash
       apt-get update && apt-get install -y ca-certificates curl gnupg
       install -d /usr/share/postgresql-common/pgdg
       curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
       echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
       apt-get update && apt-get install -y postgresql-15-pgvector
       ```

       Then restart the container and verify `SELECT '[1,2,3]'::vector;`.
     - **Or compile** (needs `postgresql-server-dev-15` and build tools): see [pgvector install](https://github.com/pgvector/pgvector#linux-and-mac).
   - **Docker (Alpine):** use `apk` / a pgvector-enabled image; package names differ from Debian.
2. Enable the extension (as a superuser or role with `CREATE` on the database):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

If vector search fails with a 503, the API message is: *Vector search requires the pgvector extension…* — follow the steps above.

**Local dev:** `./dev.sh` runs `scripts/ensure_pgvector.py` before the server starts (checks/creates the extension and can attempt install in some Docker setups).

**Still failing after `CREATE EXTENSION`?** The extension only applies to the **exact** database session the backend uses. Common causes:

1. **Different Postgres than `psql`** — Backend reads `OPENKMS_DATABASE_HOST`, `OPENKMS_DATABASE_PORT`, `OPENKMS_DATABASE_NAME`, `OPENKMS_DATABASE_USER` from `backend/.env`. If you ran `CREATE EXTENSION` on a host Postgres but the app points at **Docker** (or another host/port), that other instance may not have pgvector. Align `.env` with where you connected, or run `CREATE EXTENSION` on **that** database.
2. **Sanity check as the app user** (same user/password as in `.env`):

   ```bash
   psql -d openkms -U <OPENKMS_DATABASE_USER> -h <host> -p <port> -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
   psql ... -c "SELECT '[1,2,3]'::vector;"
   ```

   If the second command errors, the server process for that connection still lacks a working pgvector library (reinstall/restart Postgres).
3. **`could not access file "$libdir/vector"`** — `pg_extension` lists `vector`, but the **pgvector shared library** is not installed under PostgreSQL’s lib directory (common after a Postgres upgrade, image change, or DB restore from elsewhere). Fix: install the OS package for your **exact major version** (from `SELECT version();`), e.g. Debian/Ubuntu `sudo apt update && sudo apt install postgresql-15-pgvector`, then **`systemctl restart postgresql`** (or restart the container). Test again: `SELECT '[1,2,3]'::vector;`. Do **not** `DROP EXTENSION vector` if you already have tables using `vector` columns (e.g. chunks/FAQs); reinstalling the package is enough once the `.so` is on disk.

4. **Not a vector error** — Note the **full** API error or backend traceback. Missing embeddings, wrong KB config, or auth issues produce different messages than the 503 pgvector text.

Tables are created automatically on startup via `init_db()`.

## Run

```bash
# Start vlm-server first (in another terminal)
cd ../vlm-server && ./start.sh

# Start backend (recommended: uses dev.sh for pgvector, migrations, OPENKMS_DEBUG=true)
./dev.sh

# Or run uvicorn directly (requires OPENKMS_DEBUG=true or non-default OPENKMS_SECRET_KEY for local dev)
uvicorn app.main:app --reload --port 8102
```

API: http://localhost:8102  
Docs: http://localhost:8102/docs

## Endpoints

- `GET /health` – Health check
- `GET /login` – Redirect to OIDC authorization endpoint (oidc mode)
- `GET /login/oauth2/code/oidc` – OAuth2 callback (preferred redirect URI)
- `GET /login/oauth2/code/keycloak` – Same callback (legacy path for existing IdP configs)
- `GET /logout` – Clear session; oidc mode redirects to IdP end-session when configured
- `POST /api/documents/upload` – Upload document (PDF/image), parse via VLM, store in DB
- `GET /api/documents/{id}` – Get document metadata
- `GET /api/documents/{id}/parsing` – Get parsing result (result.json format)
