# openKMS Developer Environment Setup

## Overview

- **Backend** (`backend/`): FastAPI service with PostgreSQL, uses PaddleOCRVL for document parsing
- **VLM Server** (`vlm-server/`): MLX-VLM server at `http://localhost:8101` – required by PaddleOCRVL as VLM backend
- **Frontend** (`frontend/`): React/Vite app

### Database Setup
Login to postgres as superuser and run:

```sql
CREATE USER openkms_user WITH PASSWORD 'openkms_user_password';
CREATE DATABASE openkms;
GRANT ALL PRIVILEGES ON DATABASE openkms TO openkms_user;

-- Required for PostgreSQL 15+: allow openkms_user to create tables in public schema
\c openkms
GRANT ALL ON SCHEMA public TO openkms_user;
GRANT CREATE ON SCHEMA public TO openkms_user;
```

### pgvector (semantic search & KB embeddings)

Vector search and FAQ/chunk embeddings require the **pgvector** extension in PostgreSQL.

1. Install pgvector for your server (examples):
   - **macOS:** `brew install pgvector`
   - **Docker:** use a Postgres image with pgvector (e.g. [`pgvector/pgvector`](https://github.com/pgvector/pgvector#docker-images)) or install `postgresql-<major>-pgvector` in the container.
2. As a superuser (or a role that can create extensions), run:

```sql
\c openkms
CREATE EXTENSION IF NOT EXISTS vector;
```

If the API returns **503** with *Vector search requires the pgvector extension…*, install pgvector and run `CREATE EXTENSION IF NOT EXISTS vector;` on the openKMS database.

When starting the backend with **`backend/dev.sh`**, `scripts/ensure_pgvector.py` runs first to verify or create the extension (and may help in some Docker setups).

### Document Parsing Solution

Dependence packages are:
```
paddleocr==3.4.0
paddlepaddle==3.3.0
paddlex[ocr]==3.4.2
# Required by GenAIClient when using remote VLM backend (mlx-vlm-server, vllm-server, etc.)
openai>=1.0.0
# For paddleocr vl model, numpy version should less than 2.4
numpy==2.3.5
```

Example code are:
```python
from pathlib import Path
from paddleocr import PaddleOCRVL

input_file = "..."
output_path = Path("./output")

pipeline = PaddleOCRVL(
  vl_rec_backend="mlx-vlm-server", 
  vl_rec_server_url="http://localhost:8101/",
  vl_rec_api_model_name="PaddlePaddle/PaddleOCR-VL-1.5",
  vl_rec_max_concurrency=3,
  )

output = pipeline.predict(input=input_file)

pages_res = list(output)

output = pipeline.restructure_pages(pages_res)

for res in output:
    res.print() ## 打印预测的结构化输出
    res.save_to_json(save_path="output") ## 保存当前图像的结构化json结果
    res.save_to_markdown(save_path="output") ## 保存当前图像的markdown格式的结果
```

### Backend Integration

Document parsing runs via the `openkms-cli` pipeline (invoked by procrastinate jobs), which uses PaddleOCRVL with mlx-vlm-server as the VLM backend. Pipeline configurations can link to API models for VLM URL and model name. The backend itself does not run PaddleOCR directly.

**Full stack setup:**

1. Start vlm-server (mlx-vlm) for VLM inference:
   ```bash
   cd vlm-server && ./start.sh
   ```

2. Install backend dependencies (pyproject.toml + uv.lock for reproducible installs):
   ```bash
   cd backend && uv sync
   ```
   Or with pip: `pip install -e .` (installs from pyproject.toml). Regenerate lock: `uv lock`

3. Run database migrations and start the backend (default port 8102):
   ```bash
   cd backend && alembic upgrade head && uvicorn app.main:app --reload --port 8102
   ```

### Authentication

**Modes:** set `OPENKMS_AUTH_MODE` on the backend to `oidc` (default) or `local`. The frontend discovers the active mode via `GET /api/auth/public-config`; set `VITE_AUTH_MODE` only as a fallback when the API is unreachable (e.g. offline build checks), and keep it consistent with the backend to avoid the compatibility banner.

#### Local auth (no external IdP)

1. Backend: `OPENKMS_AUTH_MODE=local`, run migrations (`alembic upgrade head`) for the `users` table.
2. Frontend: `VITE_AUTH_MODE=local`.
3. Optional: `OPENKMS_ALLOW_SIGNUP=false` to disable public registration; `OPENKMS_INITIAL_ADMIN_USER` to grant admin when the signup **username** matches (case-insensitive).
4. **openkms-cli**: `OPENKMS_AUTH_MODE=local`, `OPENKMS_CLI_BASIC_USER`, `OPENKMS_CLI_BASIC_PASSWORD` (must match backend). Use only on trusted networks without TLS.

#### OIDC setup (any standards-compliant IdP)

The SPA uses **`oidc-client-ts`** (Authorization Code + PKCE) when the backend reports `oidc` mode. Set **`VITE_OIDC_ISSUER`** to your IdP’s issuer URL (same value as token `iss` / discovery document parent). Example for **Keycloak**: `http://localhost:8081/realms/openkms`.

1. **Public browser client** (e.g. `openkms-frontend` in Keycloak):
   - Enable authorization code flow; **PKCE** (S256) required by `oidc-client-ts`.
   - **Redirect URIs**: `http://localhost:5173/auth/callback`, `http://localhost:5173/auth/silent-renew` (and production equivalents).
   - **Post-logout redirect**: your SPA origin (e.g. `http://localhost:5173`).
   - **Web origins / CORS**: SPA origin as required by your IdP.

2. **Frontend env** (`.env` or `frontend/.env`):
   ```
   VITE_OIDC_ISSUER=http://localhost:8081/realms/openkms
   VITE_OIDC_CLIENT_ID=openkms-frontend
   ```
   If **`VITE_OIDC_ISSUER`** is unset, set **`VITE_OIDC_AUTH_SERVER_BASE_URL`** and **`VITE_OIDC_REALM`** so the SPA builds `{base}/realms/{realm}` as authority.

3. **Backend env**: prefer **`OPENKMS_OIDC_ISSUER`** (full issuer URL). Otherwise set **`OPENKMS_OIDC_AUTH_SERVER_BASE_URL`** + **`OPENKMS_OIDC_REALM`**. The backend loads **`{issuer}/.well-known/openid-configuration`** for JWKS and OAuth endpoints. See `backend/.env.example` for confidential client id, secret, and redirect URI (`/login/oauth2/code/oidc`).

4. **openkms-cli client** (machine / client credentials):

   Create a **confidential** client in your IdP (Keycloak example: enable client credentials, service account):
   - **Client ID**: `openkms-cli` (must match backend **`OPENKMS_OIDC_SERVICE_CLIENT_ID`**)
   - Set `OPENKMS_OIDC_AUTH_SERVER_BASE_URL`, `OPENKMS_OIDC_REALM`, `OPENKMS_OIDC_SERVICE_CLIENT_ID`, and `OPENKMS_OIDC_SERVICE_CLIENT_SECRET` in `openkms-cli/.env` (Keycloak-style token URL), or set **`OPENKMS_OIDC_TOKEN_URL`** to the token endpoint for other IdPs.

**Logout errors from the IdP**: ensure the SPA origin is allowed as a post-logout redirect for the browser client.

**Console access (OIDC)**: Realm role **`admin`** in JWT `realm_access.roles` still grants full console access (all keys from `security_permissions`). For other users, each string in `realm_access.roles` must match a **`security_roles.name`** row in PostgreSQL; that role’s permission keys (from **Permission management**) apply. Align IdP role names with security role names (e.g. `member`, `content-editor`). Other IdPs with different claim shapes may require extending JWT parsing in `auth.py` / `permission_resolution.py`.