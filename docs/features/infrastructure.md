# Infrastructure & quality

Cross-cutting plumbing: container stack, tests, error boundaries, code splitting.

| Feature | Status | Description |
|---------|--------|-------------|
| Docker Compose | ✅ | `docker/docker-compose.yml`: full stack (Postgres pgvector, MinIO, backend, **worker** `linux/amd64` + `openkms-cli[parse]` for Paddle doc-parse on Apple Silicon, nginx frontend on **http://localhost:8082**); MinIO (and Postgres) have **no** host port mappings by default—S3 from the browser uses nginx `/buckets/...`; run **`docker compose -f docker/docker-compose.yml up -d --build`** / **`down`** from repo root (see **`docker/README.md`**); infra-only: `docker compose -f docker/docker-compose.yml up -d postgres minio` |
| Backend tests | ✅ | pytest (pytest-asyncio still a test dep where used); API smoke uses a **session-scoped** `TestClient` (health, openapi) to avoid duplicate async DB loops |
| Dev / observability | ✅ | SQLAlchemy **`echo`** only when **`OPENKMS_SQL_ECHO=true`** (not tied to **`OPENKMS_DEBUG`**) |
| Frontend tests | ✅ | Vitest, @testing-library/react; smoke test (App) |
| Error boundary | ✅ | React ErrorBoundary around routes; fallback with retry |
| Session vs API JWT mismatch | ✅ | `authAwareFetch` wraps authenticated API calls; **`401`** with invalid/expired JWT clears SPA session so **Authentication Required** is shown (avoids raw JSON like `{"detail":"Invalid or expired token"}` on e.g. document channel lists) |
| Route code splitting | ✅ | React.lazy for heavy routes (ObjectExplorer, Models, Pipelines, etc.) |
| Typecheck | ✅ | `npm run typecheck` (tsc --noEmit) |
