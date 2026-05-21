# Configuration

Cross-cutting configuration that doesn't belong to one feature page. Canonical source: [`backend/app/config.py`](https://github.com/yingrui/openKMS/blob/main/backend/app/config.py); ready-to-edit example: [`backend/.env.example`](https://github.com/yingrui/openKMS/blob/main/backend/.env.example).

## Backend dependencies

- `pyproject.toml` + `uv.lock`; install with `uv sync` or `pip install -e .`
- **pgvector**: FAQ/chunk list excludes `embedding` when pgvector is not installed (`has_embedding=false`). Semantic search returns 503 with install instructions. `backend/dev.sh` runs `scripts/ensure_pgvector.py` on start to check / create the extension and optionally auto-install in Docker.

## Storage (S3 / MinIO, required for upload)

Standard AWS env names — no `OPENKMS_` prefix:

| Variable | Purpose |
|---|---|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Required for storage to be considered enabled |
| `AWS_ENDPOINT_URL` | MinIO base URL (e.g. `http://localhost:9000`); omit for real S3 |
| `AWS_BUCKET_NAME` | Bucket name (default `openkms`) |
| `AWS_REGION` | Region (default `us-east-1`) |

Documents land under `{file_hash}/`; articles under `articles/{id}/`; wiki spaces under `wiki/{space_id}/`. Dev: Vite proxies `/buckets/openkms` to MinIO for image loads.

## Database

| Variable | Default |
|---|---|
| `OPENKMS_DATABASE_HOST` | `localhost` |
| `OPENKMS_DATABASE_PORT` | `5432` |
| `OPENKMS_DATABASE_USER` | `postgres` |
| `OPENKMS_DATABASE_PASSWORD` | empty |
| `OPENKMS_DATABASE_NAME` | `openkms` |

`backend/dev.sh` ensures pgvector and runs Alembic; the Docker image runs Alembic in its `CMD`. The API never creates tables on startup.

## Authentication

| Variable | Default | Purpose |
|---|---|---|
| `OPENKMS_AUTH_MODE` | `oidc` | `oidc` (default) or `local` |
| `OPENKMS_ALLOW_SIGNUP` | `true` | Local mode: allow self-signup |
| `OPENKMS_INITIAL_ADMIN_USER` | unset | Local mode: matching username gets admin on first signup |
| `OPENKMS_LOCAL_JWT_EXP_HOURS` | `168` | Local-mode JWT lifetime |
| `OPENKMS_CLI_BASIC_USER` / `OPENKMS_CLI_BASIC_PASSWORD` | empty | Local mode: HTTP Basic for `openkms-cli` |
| `OPENKMS_SECRET_KEY` | dev value | Sign session cookies; **rotate in production** |

### OIDC

| Variable | Default | Purpose |
|---|---|---|
| `OPENKMS_OIDC_ISSUER` | (derived) | Explicit issuer URL; falls back to `${AUTH_SERVER_BASE_URL}/realms/${REALM}` |
| `OPENKMS_OIDC_AUTH_SERVER_BASE_URL` | `http://localhost:8081` | |
| `OPENKMS_OIDC_REALM` | `openkms` | |
| `OPENKMS_OIDC_CLIENT_ID` | `openkms-backend` | Confidential client used by the backend |
| `OPENKMS_OIDC_CLIENT_SECRET` | empty | |
| `OPENKMS_OIDC_REDIRECT_URI` | `http://localhost:8102/login/oauth2/code/oidc` | Must match the IdP registration |
| `OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID` | `openkms-frontend` | Sent on RP-initiated logout |
| `OPENKMS_OIDC_SERVICE_CLIENT_ID` | `openkms-cli` | Service-account client for the CLI |
| `OPENKMS_FRONTEND_URL` | `http://localhost:5173` | Used for redirects after auth events |

## Document parsing (VLM)

| Variable | Default | Purpose |
|---|---|---|
| `OPENKMS_VLM_URL` | `http://localhost:8101` | OpenAI-compatible VLM endpoint |
| `OPENKMS_VLM_MODEL` | `mlx-community/Qwen2-VL-2B-Instruct-4bit` | Default model name |
| `OPENKMS_PADDLEOCR_VL_SERVER_URL` / `OPENKMS_PADDLEOCR_VL_MODEL` | PaddleOCR-VL defaults | **Deprecated** aliases used by older pipelines; prefer `OPENKMS_VLM_*` |
| `OPENKMS_EXTRACTION_MODEL_ID` | unset | `api_models.id` for the LLM that extracts document metadata; falls back to channel/default settings |
| `OPENKMS_PIPELINE_TIMEOUT_SECONDS` | `3600` | Worker timeout for `openkms-cli pipeline run` (VLM parse + extraction) |

## Embedded agent (LangGraph wiki / future surfaces)

| Variable | Default | Purpose |
|---|---|---|
| `OPENKMS_AGENT_MODEL_ID` | unset | `api_models.id` for the LLM used by `POST /api/agent/.../messages`; falls back to the first available LLM |
| `OPENKMS_AGENT_MAX_OUTPUT_TOKENS` | `65537` | Upper bound on completion length passed as `max_tokens`; raise if your model supports more |
| `OPENKMS_AGENT_RECURSION_LIMIT` | `200` | Max LangGraph supersteps per turn (each tool+model cycle uses steps; bulk get/upsert needs a high value) |
| `OPENKMS_AGENT_LLM_EXTRA_BODY` | unset | Optional JSON merged into OpenAI-compat **`extra_body`** for the wiki embedded agent and for **Knowledge Map HTML Designer** (`POST /api/taxonomy/map-html/designer/chat`). **enable_thinking** is always forced to **false** after merge — these paths do not support thinking / full **`reasoning_content`** round-trip beyond what the shim echoes. |
| `OPENKMS_AGENT_LLM_REASONING_CONTENT_SHIM` | unset | **auto**: inject **`reasoning_content`** on assistant messages for every **base_url** except **`api.openai.com`** (covers generic OpenAI-compat proxies). Used by **Wiki Copilot** (LangChain) and **Knowledge Map Designer** (native OpenAI SDK + tool loop). **`true`** / **`1`**: always inject. **`false`** / **`0`**: never inject. Legacy alias: **`OPENKMS_AGENT_DASHSCOPE_REASONING_SHIM`**. |
| `OPENKMS_AGENT_WIKI_MAX_CONTEXT_MESSAGES` | `120` | Max prior `agent_messages` rows loaded into one embedded wiki agent turn (tail). |
| `OPENKMS_AGENT_KB_QA_MAX_CONTEXT_MESSAGES` | `120` | Max prior messages included in **`conversation_history`** for one KB / evaluation / FAQ-assist qa-agent call. |
| `LANGFUSE_SECRET_KEY` | unset | With **`LANGFUSE_PUBLIC_KEY`**, also enables Langfuse on the **embedded wiki** agent (same keys as qa-agent). |
| `LANGFUSE_PUBLIC_KEY` | unset | Langfuse public key (shared by wiki + qa-agent when both run in the same environment). |
| `LANGFUSE_BASE_URL` / `LANGFUSE_HOST` | unset | Langfuse server URL. |
| `LANGFUSE_TRACE_STREAMING` | `true` | Wiki agent: attach Langfuse callback to **streaming** turns when keys are set; set **false** to trace only non-streaming if OTel noise. |

## QA agent (standalone ``qa-agent/`` service)

Same OpenAI-compat **thinking** handling as Wiki Copilot: optional JSON **`extra_body`**, then **`enable_thinking: false`** is always applied; **`reasoning_content`** is injected on outgoing assistant rows when the shim is on (see wiki row above). You can set either the **`OPENKMS_LLM_*`** names below or reuse the **`OPENKMS_AGENT_*`** names so one block of env works for both.

| Variable | Default | Purpose |
|---|---|---|
| `OPENKMS_LLM_EXTRA_BODY` | unset | Optional JSON merged into ChatOpenAI **`extra_body`** for the QA agent. **Alias:** **`OPENKMS_AGENT_LLM_EXTRA_BODY`**. After merge, **`enable_thinking`** is forced **`false`**. |
| `OPENKMS_LLM_REASONING_CONTENT_SHIM` | unset | Same semantics as **`OPENKMS_AGENT_LLM_REASONING_CONTENT_SHIM`**. **Aliases:** **`OPENKMS_AGENT_LLM_REASONING_CONTENT_SHIM`**, **`OPENKMS_AGENT_DASHSCOPE_REASONING_SHIM`**. |
| `LANGFUSE_SECRET_KEY` | unset | With **`LANGFUSE_PUBLIC_KEY`** (and optional **`LANGFUSE_BASE_URL`**), enables Langfuse tracing for **`/ask`** and (by default) **`/ask/stream`**. |
| `LANGFUSE_PUBLIC_KEY` | unset | Public key for Langfuse SDK. |
| `LANGFUSE_BASE_URL` | unset | Langfuse server URL (e.g. cloud or self-hosted). |
| `LANGFUSE_TRACE_STREAMING` | `true` | When **true**, attach Langfuse callback to streaming runs; set **false** to trace only non-streaming **`/ask`** if async streaming causes OpenTelemetry warnings. |

## App and operator behavior

| Variable | Default | Purpose |
|---|---|---|
| `OPENKMS_APP_TITLE` | `openKMS Backend` | Title shown on FastAPI's OpenAPI docs |
| `OPENKMS_APP_VERSION` | `0.1.0` | Reported in `/openapi.json` |
| `OPENKMS_DEBUG` | `false` | Verbose API logging |
| `OPENKMS_SQL_ECHO` | `false` | Log every SQL statement (independent of debug) |
| `OPENKMS_BACKEND_URL` | `http://localhost:8102` | Passed to the worker so `openkms-cli --api-url` is correct |

## Permission and data-security flags

| Variable | Default | Purpose |
|---|---|---|
| `OPENKMS_PERMISSION_CATALOG_CACHE_SECONDS` | `5` | In-process TTL for `GET /api/auth/permission-catalog`; `0` disables. Cleared when admins mutate `security_permissions`. |
| `OPENKMS_ENFORCE_PERMISSION_PATTERNS_STRICT` | `false` | When `true`, every authenticated `/api` request must match a catalog `backend_api_pattern` and the user must hold that key |
| `OPENKMS_PERMISSION_PATTERN_CACHE_TTL_SECONDS` | `60` | TTL for compiled permission patterns loaded from `security_permissions` |
| `OPENKMS_ENFORCE_GROUP_DATA_SCOPES` | `false` | When `true`, non-admin local users with access-group membership see only allowed resources (legacy ID lists ∪ `DataResource` rows) |
| `OPENKMS_DATASOURCE_ENCRYPTION_KEY` | unset | Fernet key (base64) used to encrypt `data_sources.username/password`; required for adding data sources |

## Cursor / contributor rules

`.cursor/rules/` — see [Doc conventions for AI agents](../agents.md) for the live list (writing style, alembic, docs-before-commit, project overview).
