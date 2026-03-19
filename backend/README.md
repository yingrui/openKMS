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

Or with pip: `pip install -e .` (requires Python 3.10+).

## Configuration

Create `.env` or set environment variables (prefix `OPENKMS_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENKMS_DATABASE_HOST` | localhost | PostgreSQL host |
| `OPENKMS_DATABASE_PORT` | 5432 | PostgreSQL port |
| `OPENKMS_DATABASE_USER` | postgres | Database user |
| `OPENKMS_DATABASE_PASSWORD` | (empty) | Database password |
| `OPENKMS_DATABASE_NAME` | openkms | Database name |
| `OPENKMS_VLM_URL` | http://localhost:8101 | vlm-server URL |
| `KEYCLOAK_AUTH_SERVER_URL` | http://localhost:8081 | Keycloak server |
| `KEYCLOAK_REALM` | openkms | Keycloak realm |
| `KEYCLOAK_CLIENT_ID` | openkms-backend | OAuth2 client ID |
| `KEYCLOAK_CLIENT_SECRET` | (empty) | OAuth2 client secret |
| `KEYCLOAK_REDIRECT_URI` | http://localhost:8102/login/oauth2/code/keycloak | OAuth2 callback (add to Keycloak client Valid Redirect URIs) |
| `KEYCLOAK_FRONTEND_URL` | http://localhost:5173 | Redirect after login/logout |

## Database

Create the database:

```bash
createdb openkms
```

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
- `GET /login` – Redirect to Keycloak login (OAuth2)
- `GET /login/oauth2/code/keycloak` – OAuth2 callback (Keycloak redirect URI)
- `GET /logout` – Clear session, redirect to Keycloak logout
- `POST /api/documents/upload` – Upload document (PDF/image), parse via VLM, store in DB
- `GET /api/documents/{id}` – Get document metadata
- `GET /api/documents/{id}/parsing` – Get parsing result (result.json format)
