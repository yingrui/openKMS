# Security

Security considerations for the openKMS project.

## Authentication

- **`OPENKMS_AUTH_MODE=oidc` (default)**: External OpenID Connect IdP – OAuth2 Authorization Code + PKCE in the SPA (`oidc-client-ts`). Backend trusts JWTs via issuer discovery (`jwks_uri`, `issuer` claim).
- **`OPENKMS_AUTH_MODE=local`**: Users and bcrypt password hashes in PostgreSQL; backend-issued HS256 JWTs (`OPENKMS_SECRET_KEY`); optional HTTP Basic for `openkms-cli` (`OPENKMS_CLI_BASIC_*`). Use TLS in production; Basic over plain HTTP is only for trusted dev networks.
- **`GET /api/auth/public-config`** (unauthenticated): Returns `auth_mode` and `allow_signup` only—no secrets—so clients pick the correct login flow and match the deployed mode (local authenticator vs central IdP).
- Backend accepts:
  - `Authorization: Bearer <JWT>` for API requests
  - Session cookie (from `POST /sync-session` after browser login)
  - In local mode: `Authorization: Basic` for CLI (validated against env; minted service JWT internally)
- OIDC JWTs validated via IdP JWKS; local JWTs validated with shared secret.
- **Route protection**: **`/`** (home) is public for guests (static marketing content). All other routes under `MainLayout` require authentication; `/login` and `/signup` are outside that shell. For signed-in users who are not JWT `admin` and do not hold the `all` key, the SPA also enforces **frontend route patterns**: after loading `GET /api/auth/permission-catalog`, the pathname must match the union of `frontend_route_patterns` for the user’s resolved keys, except **always-allowed** paths `/` and `/profile`. If the catalog request fails, the gate degrades to allow navigation (operators should fix API reachability).
- **Strict API patterns (optional)**: `OPENKMS_ENFORCE_PERMISSION_PATTERNS_STRICT` (default `false`). When `true`, after authentication every `/api/...` request must match catalog rules; the user must hold **at least one** of the permission keys tied for the best-matching rule tier when several rows share the same pattern specificity (e.g. `console:object_types` and `ontology:write` on the same POST path), or hold `all`, or JWT realm `admin`, or service subject `local-cli`. **Bypass / no-pattern paths** (still subject to normal `require_auth` where applicable): `GET /api/auth/public-config`, `POST /api/auth/register`, `POST /api/auth/login`; `GET|HEAD /api/auth/me`, `GET /api/auth/permission-catalog`, `POST /api/auth/logout`, `GET|HEAD /api/feature-toggles`; `OPTIONS` on any path; `GET /openapi.json`, `GET /docs`, `GET /redoc`; non-`/api` routes (e.g. `/health`). Unmatched paths return **403** with a message to extend the catalog or turn strict mode off. Compiled rules are cached (`OPENKMS_PERMISSION_PATTERN_CACHE_TTL_SECONDS`, default `60`); admin `PATCH`/`POST`/`DELETE` on `/api/admin/security-permissions` invalidates the cache. Alembic revision `a2b3c4d5e6f7` backfills default patterns for all `OPERATION_KEY_HINTS` keys.
- **Console**: Entry requires any `console:*` operation permission from `GET /api/auth/me`, or JWT realm role `admin` (OIDC). Individual console pages require specific keys (for example `console:users`, `console:data_sources`). **Local** users receive permissions from `user_security_roles` → `security_role_permissions`. **OIDC** non-admin users: JWT `realm_access.roles` names are matched to **`security_roles.name`**; the union of those roles’ `security_role_permissions` is used. **Permission definitions** live in **`security_permissions`**; empty databases get **`all`** from the seed migration, and Alembic **`a2b3c4d5e6f7`** inserts/updates default pattern rows for every **`operation_key_hint`** key. Admins may add or edit keys via **`/api/admin/security-permissions`** or the Console, guided by **`GET /api/admin/permission-reference`**. `is_admin` (local) or realm role `admin` (OIDC) receives every defined permission key for bootstrap.
- **First-time admin (least-privilege catalog)**: **`GET /api/admin/permission-reference`** includes **`operation_key_hints`**—canonical operation strings aligned with backend `require_permission` checks, each with label, description, and category. The Console **Permissions** page can bulk-add missing hinted keys (creates **`security_permissions`** rows with empty route/API pattern lists; operators fill patterns from the same reference). Dismissing the in-page **Getting started** panel is stored in the browser (`openkms_permissions_onboarding_dismissed`). **Console overview** shows a one-line nudge when the catalog still has only **`all`** and that flag is not set (alongside cards for console-only tools: permissions, data security, data sources, users & toggles, settings). For OIDC delegation, create roles whose **`security_roles.name`** matches IdP realm role names, then assign catalog keys in the role matrix.
- **Operation permissions**: Stable keys are listed by `GET /api/auth/permission-catalog` (each entry includes human text plus frontend route and backend API path patterns for documentation). **`all`** grants full access. Backend checks use `require_permission` or `require_any_permission` where wired; holding **`all`** satisfies any key (JWT realm `admin` and `local-cli` bypass). Console **Permissions** edits roles in PostgreSQL for local auth; some catalog keys are policy targets for UI and API enforcement alongside data scopes.
- **Group data scopes (local enforcement)**: `OPENKMS_ENFORCE_GROUP_DATA_SCOPES` (default `false`). When `true` and `OPENKMS_AUTH_MODE=local`, non-admin users who belong to at least one **access group** are filtered on channels/documents, knowledge bases, evaluation datasets, datasets (console), object types, link types, and object/link instance APIs under those types. Visibility is the **union** of (1) legacy allow lists selected per group and (2) **data resources** attached to the group: named rows with a `resource_kind` and JSON `attributes` using whitelisted keys only (no free-form SQL). Document resources may use `anchor_channel_id` and/or `metadata.<key>` (JSONB containment) and/or `channel_id`. Knowledge-base resources use `anchor_knowledge_base_id` or `kb_id` / `name` in attributes; dataset/evaluation/object/link kinds use the corresponding `*_id` key in attributes. Users with **no** group membership are not filtered (legacy behavior). JWT `admin` bypasses filters. **Console (any auth mode)**: operators with `console:groups` may CRUD access groups, **data resources**, and group **scopes** (legacy ID lists + data resource attachments). **User ↔ access group membership** is maintained only in **local** auth (`PUT /api/admin/groups/{id}/members` returns **403** in OIDC; `GET` returns an empty list). **OIDC**: data-scope **enforcement** is not applied in this phase (IdP group sync is future work).
- **Object Explorer** (`POST /api/ontology/explore`): Arbitrary read-only Cypher is not rewritten for group scope; trusted operators should treat it as a power-user path. Prefer restricting access via console permissions and deployment policy.

## Credentials and Secrets

### Do Not Expose in CLI

- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are **never** CLI parameters.
- They are read only from environment variables (e.g. via `.env` with python-dotenv).
- Avoid passing secrets on the command line; they may appear in process lists and shell history.

### Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `OPENKMS_OIDC_CLIENT_SECRET` | Backend | OAuth2 confidential client secret (backend code flow, oidc mode) |
| `OPENKMS_SECRET_KEY` | Backend | Session cookie signing and local JWT signing |
| `OPENKMS_CLI_BASIC_PASSWORD` | Backend + CLI | Local mode CLI Basic secret (protect like a password) |
| `AWS_ACCESS_KEY_ID` | Backend, CLI | S3/MinIO access |
| `AWS_SECRET_ACCESS_KEY` | Backend, CLI | S3/MinIO secret |
| `OPENKMS_DATABASE_PASSWORD` | Backend | PostgreSQL |
| `OPENKMS_ENFORCE_GROUP_DATA_SCOPES` | Backend | When `true` (with local auth), apply access-group allow lists to data APIs; default `false` until groups are configured |
| `OPENKMS_ENFORCE_PERMISSION_PATTERNS_STRICT` | Backend | When `true`, authenticated `/api/*` must match catalog `backend_api_patterns` and user must hold the owning key; default `false` |
| `OPENKMS_PERMISSION_PATTERN_CACHE_TTL_SECONDS` | Backend | In-memory TTL for compiled pattern rules loaded from `security_permissions` |

Keep `.env` out of version control (use `.env.example` as a template).

## Storage

- **S3/MinIO**: Document files are stored under `{file_hash}/` with presigned URLs for access.
- **PostgreSQL**: Metadata, channels, and user-related data.
- Ensure S3 bucket policies and CORS are configured correctly for your deployment.

## API Security

- All `/api/*` endpoints require authentication.
- Document file URLs are validated: backend checks that the requested path belongs to the document before redirecting to storage.
- VLM server URL is internal; avoid exposing it directly to untrusted clients.

## Production Checklist

1. Use strong `OPENKMS_SECRET_KEY` (e.g. 32+ random bytes).
2. Configure the OIDC IdP with proper redirect URIs for production (no wildcards unless intended). For local mode, set `OPENKMS_ALLOW_SIGNUP=false` if you do not want public registration.
3. Use HTTPS for frontend and backend in production.
4. Restrict database and S3 access to trusted networks where possible.
5. Review IdP realm roles and client scopes (oidc mode).
6. Keep dependencies up to date (`pip install -U`, `npm audit`).

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately rather than opening a public issue.
