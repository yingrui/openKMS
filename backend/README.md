# openKMS Backend

FastAPI backend for the Open Knowledge Management System. Uses PostgreSQL for storage and vlm-server (MLX-VLM) for document parsing.

## Prerequisites

- Python 3.11+
- PostgreSQL (localhost:5432)
- [vlm-server](../vlm-server) running at `http://localhost:8101`

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # or `.venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

## Configuration

Create `.env` or set environment variables (prefix `OPENKMS_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENKMS_DATABASE_HOST` | localhost | PostgreSQL host |
| `OPENKMS_DATABASE_PORT` | 5432 | PostgreSQL port |
| `OPENKMS_DATABASE_USER` | postgres | Database user |
| `OPENKMS_DATABASE_PASSWORD` | (empty) | Database password |
| `OPENKMS_DATABASE_NAME` | openkms | Database name |
| `OPENKMS_VLM_SERVER_URL` | http://localhost:8101 | vlm-server URL |

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

# Start backend
uvicorn app.main:app --reload --port 8102
```

API: http://localhost:8102  
Docs: http://localhost:8102/docs

## Endpoints

- `GET /health` – Health check
- `POST /api/documents/upload` – Upload document (PDF/image), parse via VLM, store in DB
- `GET /api/documents/{id}` – Get document metadata
- `GET /api/documents/{id}/parsing` – Get parsing result (result.json format)
