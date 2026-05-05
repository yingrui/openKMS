# Configuration

Cross-cutting configuration that doesn't belong to one feature page.

- **Backend deps**: `pyproject.toml` + `uv.lock`; install with `uv sync` or `pip install -e .`
- **pgvector**: FAQ/chunk list excludes embedding when pgvector not installed (`has_embedding=false`). Semantic search returns 503 with install instructions. `backend/dev.sh` runs `scripts/ensure_pgvector.py` on start to check / create the extension and optionally auto-install in Docker.
- **S3/MinIO** (required for upload): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL`, `AWS_BUCKET_NAME`. Uploaded files stored under `{file_hash}/`. Dev: Vite proxies `/buckets/openkms` to MinIO for image loads.
- **Cursor rules**: `.cursor/rules/` — see [Doc conventions for AI agents](../agents.md) for the live list (writing style, alembic, docs-before-commit, project overview).
