# Infrastructure & quality

Cross-cutting plumbing: container stack, tests, error boundaries, code splitting.

| Feature | Status | Description |
|---------|--------|-------------|
| Docker Compose | ✅ | `docker/docker-compose.yml`: full stack (Postgres pgvector, MinIO, backend, **worker** `linux/amd64` + `openkms-cli[parse]` for Paddle doc-parse on Apple Silicon, nginx frontend on **http://localhost:8082**); MinIO (and Postgres) have **no** host port mappings by default—S3 from the browser uses nginx `/buckets/...`; run **`docker compose -f docker/docker-compose.yml up -d --build`** / **`down`** from repo root (see **`docker/README.md`**); infra-only: `docker compose -f docker/docker-compose.yml up -d postgres minio` |
| Backend tests | ✅ | pytest (pytest-asyncio still a test dep where used); API smoke uses a **session-scoped** `TestClient` (health, openapi) to avoid duplicate async DB loops |
| Dev / observability | ✅ | SQLAlchemy **`echo`** only when **`OPENKMS_SQL_ECHO=true`** (not tied to **`OPENKMS_DEBUG`**) |
| Frontend tests | ✅ | Vitest, @testing-library/react; `App` smoke; `src/data/apiClient.test.ts` (`isRejectedJwtResponse`, JWT-mismatch `authAwareFetch` → `SESSION_EXPIRED_API_DETAIL`; see Session vs API JWT row above) |
| Error boundary | ✅ | React ErrorBoundary around routes; fallback with retry |
| Session vs API JWT mismatch | ✅ | `authAwareFetch` wraps authenticated API calls; **`401`** from an invalid/expired JWT runs the session-expired handler, replaces the response body with a short **“session expired, sign in again”** message (so Sonner and other UI do not show FastAPI’s internal phrase), and **`toast.dismiss()`** clears stale toasts when auth state is cleared |
| Route code splitting | ✅ | React.lazy for heavy routes (ObjectExplorer, Models, Pipelines, etc.) |
| Typecheck | ✅ | `npm run typecheck` (tsc --noEmit) |
