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

### Keycloak Setup (Authentication)

The frontend uses the Keycloak JavaScript adapter (Authorization Code + PKCE). Configure a **public** client in Keycloak:

1. **Create client** `openkms-frontend`:
   - Client authentication: **Off**
   - Standard flow: **Enabled**
   - Direct access grants: Off

2. **Valid Redirect URIs** (where Keycloak redirects after login):
   - Dev: `http://localhost:5173`, `http://localhost:5173/*`
   - Prod: your frontend origin (e.g. `https://app.example.com`, `https://app.example.com/*`)

3. **Valid Post Logout Redirect URIs** (for full logout):
   - Dev: `http://localhost:5173`
   - Prod: your frontend origin

4. **Web Origins**: add the same origin(s) as above.

5. **Frontend env** (`.env` or `frontend/.env`):
   ```
   VITE_KEYCLOAK_URL=http://localhost:8081
   VITE_KEYCLOAK_REALM=openkms
   VITE_KEYCLOAK_CLIENT_ID=openkms-frontend
   ```

6. **Backend env**: see `backend/.env.example` for `KEYCLOAK_*` (realm, server URL, backend client for sync-session verification).

7. **openkms-cli client** (for pipeline jobs and manual CLI runs with auth):

   Create a confidential client in Keycloak for machine-to-machine auth:
   - **Client ID**: `openkms-cli`
   - **Client authentication**: **On**
   - **Service accounts roles**: Enabled (or Standard flow disabled, Client credentials flow enabled)
   - **Client secret**: create/regenerate in Credentials tab and set in `openkms-cli/.env`:
     ```
     AUTH_URL=http://localhost:8081
     AUTH_REALM=openkms
     AUTH_CLIENT_ID=openkms-cli
     AUTH_CLIENT_SECRET=<your-secret-from-keycloak>
     ```
   - Ensure backend `KEYCLOAK_SERVICE_CLIENT_ID=openkms-cli` (default) so the backend accepts tokens from this client for service endpoints (e.g. `GET /api/models/{id}/config`).

**If logout shows Keycloak 400**: ensure the frontend origin is in "Valid Post Logout Redirect URIs" for `openkms-frontend`.

**Console access**: only users with the realm role `admin` can see and access the Console. In Keycloak: Realm → Roles → create `admin` if needed, then assign it to users or groups.