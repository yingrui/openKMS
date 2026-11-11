# Infrastructure & quality

Cross-cutting plumbing: container stack, tests, error boundaries, code splitting.

| Feature | Status | Description |
|---------|--------|-------------|
| Docker Compose | ✅ | `docker/docker-compose.yml`: full stack (Postgres pgvector, MinIO, **Neo4j** Browser **7476** + Bolt **7689** on host (defaults +2), backend, **worker** `linux/amd64` + `openkms-cli[parse]` for Paddle doc-parse on Apple Silicon, **qa-agent** on **http://localhost:8103** (KB Agent URL **`http://qa-agent:8103`**), nginx frontend on **http://localhost:8082**); optional build mirrors (`APT_MIRROR`, `UV_INDEX_URL`, `NPM_REGISTRY`) — **`docker/README.md`**; MinIO and Postgres have **no** host port mappings by default—S3 from the browser uses nginx `/buckets/...`; register Neo4j in **Console → Data sources** (`host` **`neo4j`**, port **`7687`**, see **`docker/README.md`**); run **`docker compose -f docker/docker-compose.yml up -d --build`** / **`down`** from repo root; infra-only: `docker compose -f docker/docker-compose.yml up -d postgres minio neo4j` |
| Backend tests | ✅ | pytest (pytest-asyncio still a test dep where used); API smoke uses a **session-scoped** `TestClient` (`GET /health`, openapi); **`GET /api/admin/health-status`** requires auth (see [Console & authentication](console-and-auth.md#console-admin)) |
| Dev / observability | ✅ | SQLAlchemy **`echo`** only when **`OPENKMS_SQL_ECHO=true`** (not tied to **`OPENKMS_DEBUG`**) |
| Frontend tests | ✅ | Vitest, @testing-library/react; `App` smoke; `src/data/apiClient.test.ts` (`isRejectedJwtResponse` including i18n auth codes, `authAwareFetch` retry + `SESSION_EXPIRED_API_DETAIL`; see Session vs API JWT row above) |
| Error boundary | ✅ | React ErrorBoundary around routes; fallback with retry |
| Session vs API JWT mismatch | ✅ | `authAwareFetch` wraps authenticated API calls; recoverable **`401`** runs one retry (`session_v2`: `POST /api/auth/refresh` + `/me`; legacy: OIDC refresh + sync-session / local `/me` cookie check) then the session-expired handler; response body is replaced with a short **sign in again** message; user is sent to **`/login?notice=session_expired`**; explicit OIDC sign-in uses **`prompt=login`** |
| Server-side auth sessions | ✅ | `auth_sessions` stores encrypted access/refresh tokens; opaque `openkms_session`; sliding idle + absolute cap; `POST /api/auth/refresh`; OIDC BFF callback; local session refresh; revoke on logout |
| Route code splitting | ✅ | React.lazy for heavy routes (ObjectExplorer, Models, Pipelines, etc.) |
| Typecheck | ✅ | `npm run typecheck` (tsc --noEmit) |
