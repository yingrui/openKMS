# Console and authentication

Operator surface (`/console/*`), permission catalog and roles, system settings, and the two authentication modes. For **why** openKMS splits identity, operations, and data access, see [Security design](../developer/security.md). For the **data security model** (RBAC vs resource ACL, sharing, inheritance), see [Data security](../developer/data-security.md).

## Console (admin)

- **Entry**: header user menu **Console** (when outside console routes) opens `/console` for users with the **`admin`** role, permission **`all`**, or **`console:access`**. Inside `/console/*`, the header shows **Exit Console** back to home (`/`). The console shell and route gate still use `canAccessPath` against `frontend_route_patterns` from `GET /api/auth/permission-catalog` for individual pages (plus feature toggles where applicable).
- **Console overview** (`/console`): Introduces **console sidebar** tools only—**system health**, permissions, data security, data sources (each tagged by **layer** — `data` or `ontology`), **Kubernetes clusters**, **object storage**, users & feature toggles, settings; cards link when `canAccessPath` allows; quick links to Permissions and Access groups when those permissions apply; optional nudge when the catalog still has only **`all`** (until `openkms_permissions_onboarding_dismissed` is set).
- **System health** (`/console/health`): requires `console:access` (or admin). **`GET /api/admin/health-status`** probes core dependencies: API (implicit), **PostgreSQL** (`SELECT 1`), **object storage** (S3/MinIO `head_bucket` when configured; otherwise **skipped**), **background jobs** (Procrastinate `procrastinate_jobs` table present), **Ontology Function Service** (`GET {OPENKMS_ONTOLOGY_FUNCTION_SERVICE_URL}/health`), and **Langfuse** when **`LANGFUSE_BASE_URL`** is set on the backend: **`GET {base}/api/public/health`** (skipped if unset; skipped with a short note if **`LANGFUSE_HEALTHCHECK`** is false). Tracing credentials on the server (**`LANGFUSE_SECRET_KEY`** / **`LANGFUSE_PUBLIC_KEY`**) are not sent to the browser; the detail text only states whether they appear configured. When the caller also has **`console:data_sources`**, each registered data source is connection-tested (PostgreSQL / Neo4j; same logic as **`POST /api/data-sources/{id}/test`**). The page shows overall status, per-component latency, last-checked time, and a **Refresh** control in the page header (top right). Route/API patterns for `console:access` include `/console/health` and `GET /api/admin/health-status` (migration **`r8s9t0u1v2w3`** refreshes defaults). Public **`GET /health`** (no auth) remains a minimal liveness probe for load balancers and smoke tests—not the Console page.
- **Permission management** (`/console/permission-management`): **Permission catalog** is stored in **`security_permissions`**; the page loads rows from **`GET /api/admin/security-permissions`** (includes `id` for edit/delete). Under **Roles**, **All** selects catalog-only mode (add/edit/delete permission rows). Choosing a **named role** shows checkboxes to draft which keys that role receives; **Save role permissions** calls **`PUT /api/admin/security-roles/{id}/permissions`** once—no auto-save on each toggle. Switching roles with unsaved changes prompts to discard. Migrations seed **`all`** when the catalog table is empty and backfill default pattern rows for every hinted operation key (`a2b3c4d5e6f7`); admins may add keys via **Add permission**, **Add missing suggested keys** (from **`operation_key_hints`** on **`GET /api/admin/permission-reference`**), or **`POST /api/admin/security-permissions`**, using the in-page **Route & API reference** (and **Operation keys** tab) for path patterns. Roles may only assign keys that exist in **`security_permissions`**. The built-in **`all`** row cannot be edited or deleted. **Migration** seeds the **admin** role with **`all`**; **member** is created on first non-admin local sign-in (also starts with **`all`**). You cannot remove **`all`** from a role that still has only **`all`** in one step—add another permission, save, then remove **`all`**. **Local**: `user_security_roles` synced from `is_admin`. **OIDC**: JWT `realm_access.roles` match **`security_roles.name`**; realm **`admin`** bypasses permission checks.
- **Data security** (`/console/data-security/issues`, `/console/data-security/groups`, `/console/data-security/groups/:groupId`): requires `console:groups`. **Issues** lists sharing misconfiguration with inline fix; **Access groups** uses a master–detail layout (group list, members tab, shared-access tab). Legacy `/groups/:id/members` redirects to `/groups/:id`. Per-resource **sharing** is documented in [Data security](../developer/data-security.md).
- **Data Sources** (`/console/data-sources`): `console:data_sources` (or admin). **Kubernetes clusters** (`/console/kubernetes`, `/console/kubernetes/{id}`): `console:kubernetes` — register existing clusters with encrypted kubeconfig, test connectivity, and browse namespaces / Deployments / Pods (read-only); see [Kubernetes clusters](kubernetes-clusters.md). **Object storage** (`/console/storage`): `console:storage` — paginated bucket browser (S3 `list_objects_v2`); create folder placeholders; multi-select move prefixes/objects; metadata only (no presigned download). **Connectors** (`/connectors`): **`connectors:read`** / **`connectors:write`** — see [Connectors](connectors.md). **Datasets** (`/datasets`): **`data:write`** to register/ingest and manage; **`data:read`** to view (filtered by dataset ACL); **`data:edit`** to edit row data in editable datasets. The data layer (`datasets` / `data-model`) is gated only by `data:*`; the **Data Insights has its own `insights:read` / `insights:write`** (a story is not the same grant as the data behind it — and a dataset-backed finding is still checked against that dataset's ACL), separate from `ontology:*` and `console:*`. **Object types / link types** (`/ontology-manager/object-types`, `/ontology-manager/link-types`): `console:object_types` / `console:link_types` **or** `ontology:read` / `ontology:write` as applicable; System Settings, Users & Roles, Feature Toggles remain `console:*` (or admin).
- **Users & Roles** (`/console/users`): requires `console:users`. **Local auth**: list users, toggle `is_admin` (syncs security role links), delete/add users. **OIDC auth**: read-only list of **`oidc_identities`** (users who have signed in); roles remain in the IdP.
- **System settings** (`/console/settings`): `console:settings` (or admin). **`GET /api/system/settings`** / **`PUT /api/system/settings`** load and persist **`system_settings`** (Postgres singleton row): `system_name`, `default_timezone`, `api_base_url_note` (optional note only; SPA API URL remains build-time). A **`PUT`** whose trimmed `system_name` would be empty is stored as **`openKMS`**. **`GET /api/public/system`** returns `{ "system_name" }` **without authentication** (strict middleware allowlist); the value is the trimmed DB field and may be **`""`**. The **sidebar** title stays **blank** until that response arrives, then shows **`openKMS`** when the name is empty or whitespace (otherwise the returned name); on fetch failure it shows **`openKMS`**. After saves, **`notifySystemSettingsUpdated`** triggers the same fetch (custom event). Migration seeds row `id=1` and attaches `GET`/`PUT` patterns to **`console:settings`** for strict API enforcement.
- Feature toggles: **`evaluations`** (default off), **`connectors`** (default on), **`agents`** (default on), and **`media`** (default off) – persisted in PostgreSQL (`feature_toggles` table), shared across all users/devices. When **`agents`** is off, the SPA hides `/agents` and `/projects/*`, and `/api/projects/*` plus `/api/user/git-credentials` return **404**. When **`media`** is off, the SPA hides `/media/*` and `/api/media*` plus `/api/media-channels*` return **404**.
- `GET /api/feature-toggles` (authenticated) returns current toggle state
- `PUT /api/feature-toggles` requires `console:feature_toggles` (or JWT admin)

## Permission catalog (canonical keys)

Defined in [`backend/app/services/identity/permissions/permission_catalog.py`](https://github.com/yingrui/openKMS/blob/main/backend/app/services/permission_catalog.py); seeded into `security_permissions` by migration. Roles may only assign keys that exist in the catalog.

| Family | Keys |
|---|---|
| Console | `console:access`, `console:users`, `console:groups`, `console:permissions`, `console:settings`, `console:feature_toggles`, `console:data_sources`, `console:kubernetes`, `console:storage`, `console:datasets`, `console:object_types`, `console:link_types` |
| Connectors | `connectors:read`, `connectors:write` |
| Documents | `documents:read`, `documents:write` |
| Document channels | `channels:read`, `channels:write` |
| Articles | `articles:read`, `articles:write` |
| Knowledge bases | `knowledge_bases:read`, `knowledge_bases:write` |
| Evaluation | `evaluation:read`, `evaluation:write` |
| Wiki | `wikis:read`, `wikis:write` |
| Ontology | `ontology:read`, `ontology:write` |
| Data layer | `data:read`, `data:write`, `data:edit` (Datasets / Data Model apps; `data:edit` = edit dataset row data) |
| Media | `media:read` (browse the library), `media:write` (upload, edit, generate) |
| Data Insights | `insights:read` (open the app, read findings, re-run one), `insights:write` (create/update/delete stories) — plus the bound dataset's ACL |
| Knowledge map | `knowledge_map:read`, `knowledge_map:write` |
| Agents | `projects:read`, `projects:write` (projects, skills registry, agent chat; feature toggle `agents`) |
| Catch-all | `all` (built-in admin key; cannot be edited or deleted) |

## Authentication

The browser BFF session model, OIDC/local flows, session lifetimes, Keycloak client setup, and security boundaries are documented in [Authentication](../developer/authentication.md). This page covers the Console surface and the permission catalog.

## Obtaining an API token {#obtaining-an-api-token}

Docs examples use `Authorization: Bearer $TOKEN`. How you get `$TOKEN` depends on `OPENKMS_AUTH_MODE`:

- **Local mode** — `POST /api/auth/login` with JSON `{ "login", "password" }` returns `access_token` (HS256). Prefer env vars + `jq` over embedding the password in the shell:

```bash
TOKEN=$(curl -sS -X POST "${API%/}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg login "$OPENKMS_LOGIN" --arg password "$OPENKMS_LOGIN_PASSWORD" \
        '{login:$login,password:$password}')" \
  | jq -er '.access_token // empty')
```

  Default lifetime: `OPENKMS_LOCAL_JWT_EXP_HOURS` (168 hours). Long-lived tokens are convenient for dev scripts but widen blast radius if leaked.

- **OIDC mode** — use the IdP **user** access token as `Authorization: Bearer …` (verified via JWKS). Operation permissions for non-admin users come from `realm_access.roles` matched to `security_roles.name`—the token must carry those roles. **`/internal-api/models/...`** accepts only `sub=local-cli` or OIDC clients in `OPENKMS_INTERNAL_SERVICE_CLIENT_IDS`; human tokens and personal API keys get **403**.

- **CLI (local mode)** — `OPENKMS_CLI_BASIC_USER` / `OPENKMS_CLI_BASIC_PASSWORD` → `Authorization: Basic …` → internal `local-cli` JWT. Dev/trusted networks only.

- **Worker / scheduler** — `OPENKMS_WORKER_BASIC_*` (local) or `OPENKMS_WORKER_OIDC_*` (OIDC client credentials); same rules as CLI for `/internal-api` (`local-cli` or allowlisted `azp`).

- **Personal API keys** — **Settings** → `POST /api/auth/api-keys`; plaintext `okms.{uuid}.{secret}` shown once. **Local:** permissions follow `user_security_roles`. **OIDC:** roles are snapshotted at creation—recreate the key after IdP role changes.

`GET /api/auth/me` confirms the token and lists resolved permission keys. Hardening themes: [Tech debt — API tokens](../tech_debt.md#api-tokens-machine-auth).

### Credentials (do not commit)

| Variable | Purpose |
|----------|---------|
| `OPENKMS_OIDC_CLIENT_SECRET` | OIDC confidential client |
| `OPENKMS_SECRET_KEY` | Session cookie + local JWT signing |
| `OPENKMS_CLI_BASIC_PASSWORD` | CLI Basic secret (local mode) |
| `OPENKMS_WORKER_BASIC_PASSWORD` / `OPENKMS_WORKER_OIDC_CLIENT_SECRET` | Worker + scheduler internal API auth |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3/MinIO — **env only**, never CLI args |
| `OPENKMS_DATABASE_PASSWORD` | PostgreSQL |

Full list: [Configuration](../developer/configuration.md). Use `.env.example` as a template; keep `.env` out of git.

### Production checklist

1. Strong `OPENKMS_SECRET_KEY` (32+ random bytes).
2. HTTPS for frontend and backend; OIDC redirect URIs locked down; `OPENKMS_ALLOW_SIGNUP=false` in local mode if registration should be closed.
3. Review IdP realm roles vs `security_roles.name`; prefer granular catalog keys over permanent `all`.
4. Restrict database and object storage to trusted networks; keep the VLM URL internal.
5. Keep dependencies updated (`pip install -U`, `npm audit`).

## Static home (landing page)

- Public landing page for non-authorized users (`HomeStaticLanding`, i18n `landing`)
- Pain points: knowledge scattered; evidence can’t travel with the story; manual parsing work
- Benefits: centralized knowledge hub; grounded answers and domain data; research that becomes a multi-slide analysis briefing
- Functionalities sections: document management, articles, knowledge bases (including semantic search when pgvector is configured), ontology & graph (datasets, object/link types, optional Neo4j), **agents & analysis** (installable skill, cross-surface research, interactive analysis presentations), pipelines & automation (jobs, per-channel pipelines, model linkage)
