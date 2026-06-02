# Data security

**Mechanics** for resource ACL, sharing UI, list filters, and resolver code. For principles (default-open, admin vs data access, trust boundaries, identity modes), see [Security design](../security.md).

**Related:** [Console & authentication](console-and-auth.md) (login, catalog keys, tokens), [Data models — Data security](data-models.md#data-security-access-groups-resource-acl) (schemas), [API reference — resource ACL](api-reference.md) (HTTP).

---

## For AI agents — quick facts

| Question | Answer |
|---|---|
| Resolver | `backend/app/services/resource_acl_service.py` |
| When is data restricted? | Any ACL row on the resource **or an ancestor** in its chain |
| **Others** | `grantee_type=authenticated`; `permissions=0` = explicit deny for non-owner, non-group users |
| Bits | `r`=1, `w`=2, `m`=4; manage satisfies read/write in `perm_satisfies` |
| Owner storage | Local: `users.id`. OIDC: JWT `sub`. PUT: `normalize_user_grantee_id`; read: `user_grant_matches` |
| Sharing API | `GET`/`PUT /api/resource-acl/{type}/{id}`; `GET …/owner-candidates` |
| Legacy | Data-resource scope APIs → **410**; use resource ACL |

New **list/get** handlers: wire `check_resource_access` / `instance_visible` / `scoped_*_predicate`. New securable types: extend `SECURABLE_RESOURCE_TYPES`, `resource_context_chain`, Alembic, this page + `data-models.md`.

---

## Layer 1 — Operation permissions (RBAC) {#layer-1-operation-rbac}

Gates features and Console tools — not individual channels or documents.

| Storage | Role |
|---|---|
| `security_permissions` | Keys + optional route/API patterns |
| `security_roles` + `security_role_permissions` | Roles → keys |
| `user_security_roles` | Local users → roles |
| OIDC JWT `realm_access.roles` | Matched to `security_roles.name` |

**Enforcement:** `require_permission` on routes; SPA via `GET /api/auth/permission-catalog`. Optional `OPENKMS_ENFORCE_PERMISSION_PATTERNS_STRICT` (Layer 1 only — see [Configuration](configuration.md)).

Canonical keys: [Console & authentication — Permission catalog](console-and-auth.md#permission-catalog-canonical-keys).

---

## Layer 2 — Resource ACL (data plane) {#layer-2-resource-acl}

### Tables

| Table | Purpose |
|---|---|
| `resource_acl_entries` | `(resource_type, resource_id, grantee_type, grantee_id)` → bitmask |
| `access_groups` | Named groups (`grantee_type=group`) |
| `access_group_members` | `subject` ↔ `group_id` (local id, OIDC `sub`, or alias strings) |

Columns: [Data models — Data security](data-models.md#data-security-access-groups-resource-acl).

### Securable types

`backend/app/services/resource_acl_constants.py` — `SECURABLE_RESOURCE_TYPES`:

| `resource_type` | Container chain |
|---|---|
| `document_channel` | Parent channels to root |
| `document` | Row + channel chain |
| `article_channel` | Parent article channels |
| `article` | Row + channel chain |
| `wiki_space` | — |
| `wiki_page` | Parent wiki space |
| `knowledge_base`, `evaluation`, `dataset`, `object_type`, `link_type` | Standalone |

### Grantees and bits

| Bit | Value | Use |
|---|---|---|
| Read | 1 | List, view, download |
| Write | 2 | Upload, edit, move |
| Manage | 4 | Change sharing (`m` implies `r`/`w`) |

| `grantee_type` | `grantee_id` | UI |
|---|---|---|
| `user` | Canonical `sub` / local user id | **Owner** |
| `group` | `access_groups.id` | **Groups** row |
| `authenticated` | `NULL` | **Others** |

User grants: PUT runs `normalize_user_grantee_id()` (username, email, legacy local id → canonical). Read uses `user_grant_matches()` for alias / legacy-id bridging.

Per-resource sharing applies when ACL rows exist; `OPENKMS_ENFORCE_RESOURCE_ACL` is reserved for future system-wide defaults.

---

## Inheritance and evaluation

`resource_acl_service.py`.

### Context chain

`resource_context_chain()` — nearest first, then ancestors (document/article channel trees, wiki page → space).

### `effective_permissions`

1. **Groups** — `user_group_ids()` matches `access_group_members.subject` to JWT aliases (`sub`, `preferred_username`, `email`, `name`; local mode also user id/username).
2. **Others** — `_authenticated_bits_from_chain()`: nearest explicit `authenticated` grant on chain; child overrides parent; `0` = deny for non-owner/non-group.
3. **User + group rows** — union matching grants on any chain node.
4. **Check** — `check_resource_access(..., required)` via `perm_satisfies`.

### Owner bootstrap

- Create: `bootstrap_owner_acl(..., sub)` with `rwm`; channels set `created_by` + `created_by_name`.
- GET: default owner row from `created_by` when no owner ACL (display only).
- PUT: preserves owner if omitted; normalizes user grantee ids.
- **New** document/article channels: owner-only (no **Others** row).
- **Pre-migration** channels: Alembic backfilled **Others** `rwm` (`y7z8a9b0c1d2`, `b2c3d4e5f6a9`).

**OIDC pitfall:** Owner label may come from `users.username` or API-key display name while checks use JWT `sub`. Migrations **`d4e5f6a7b8c1`**, **`e5f6a7b8c9d0`** fix username/local-id rows; runtime uses `normalize_user_grantee_id` / `user_grant_matches`.

### Caller matrix

| Caller | Resource ACL read/write | Resource ACL manage |
|---|---|---|
| Normal user | From ACL | Needs `m` |
| JWT `admin` | From ACL | Bypass |
| `local-cli` | Skipped | Skipped |
| Personal API key | As `owner_sub` | As `owner_sub` |

---

## Enforcement (where ACL is applied)

| Surface | Mechanism |
|---|---|
| Document channels | `readable_document_channel_ids`; single GET → 404 if not readable |
| Documents | `scoped_document_predicate`, upload/move helpers |
| Articles | `scoped_article_predicate`, `article_passes_scoped_predicate` |
| Wiki, KB, eval, dataset, ontology types | `readable_resource_ids`, `instance_visible` |
| Global search | Scoped in `global_search.py` |
| Sharing API | GET needs read; PUT needs manage |
| SPA channel page | Sidebar filter; missing channel → not found |

`data_resource_policy.py` delegates to ACL; deprecated data-resource PUT → **410**.

---

## Operator and user UI

### Console — access groups

- `/console/data-security/groups`, `…/groups/:id/members` — permission `console:groups`
- `PUT /api/admin/groups/{id}/members` with `subjects` (local ids or OIDC subs)
- `GET …/groups/{id}/shared-resources` — grants referencing the group

### Console — issues audit

- `/console/data-security/issues` — `GET /api/admin/resource-acl/issues` (summary or `?issue=&limit=&offset=`)
- Issue codes: Others manage/write; missing/broken owner; unknown/empty group; implicit Others; review Others read (+ groups)
- Inline **Fix sharing**: `GET/PUT /api/admin/resource-acl/{type}/{id}`; `owner-candidates` for admin audit

### Per-resource sharing (`ResourceSharePanel`)

**Routes:** document/article channel settings (Sharing tab), wiki space settings, KB settings.

| Row | `grantee_type` | Notes |
|---|---|---|
| **Owner** | `user` | Autocomplete via `owner-candidates`; free-text subject still accepted |
| **Groups** | `group` | Per-row r/w/m |
| **Others** | `authenticated` | Empty = deny; always included in PUT |

Shows **Your access:** `effective_permissions`. Read-only without manage. **Save** → PUT owner + groups + Others.

**Owner candidates:**

| Auth | List source |
|---|---|
| Local | `users` (id, username) |
| OIDC | `user_api_keys`, mapped `users`, `access_group_members` |

---

## Example: restricted channel

Owner `bob` `rwm`, group **QA** `rwm`, **Others** empty → user **alice** with `documents:read` gets 404 on channel and `?channel_id=`. Parent channel without ACL stays visible; child ACL is evaluated independently.

---

## Migrations (legacy → ACL)

| Revision | Change |
|---|---|
| `x6y7z8a9b0c1` | `resource_acl_entries`; copy junction scopes; `access_group_members` |
| `y7z8a9b0c1d2` | Others on existing document channels |
| `z8a9b0c1d2e4` | `document_channels.created_by` |
| `a1b2c3d4e5f8` | `article_channels.created_by` |
| `b2c3d4e5f6a9` | Others on existing article channels |
| `c3d4e5f6a7b0` | `created_by_name` on channels |
| `d4e5f6a7b8c1` | Username → canonical grantee id |
| `e5f6a7b8c9d0` | Local `users.id` owner → OIDC `sub` when API key maps user |

---

## Extending data security

1. Catalog key + route/SPA patterns (Layer 1).
2. `SECURABLE_RESOURCE_TYPES` + `resource_context_chain` + model/migration.
3. List/get filters (`check_resource_access`, predicates).
4. Create: `created_by` / `bootstrap_owner_acl`.
5. UI: `ResourceSharePanel` (`consoleAudit` only for admin audit).
6. Owner: `owner-candidates` + normalized PUT.
7. Tests: `backend/tests/test_resource_acl.py` (no Postgres required for most ACL unit tests).

---

## Known gaps (implementation)

| Topic | Status |
|---|---|
| Share UI coverage | Channels, wiki, KB; API supports all `SECURABLE_RESOURCE_TYPES` |
| `OPENKMS_ENFORCE_RESOURCE_ACL` default-closed | Reserved, not implemented |
| OIDC owner picker directory | API keys + group members, not full IdP sync |
| List filter performance | Per-channel evaluation; may need SQL batching |

Policy non-goals (admin read-all, Object Explorer Cypher): [Security design — Deliberate non-goals](../security.md#deliberate-non-goals-today).

---

## Code map

| Path | Role |
|---|---|
| `resource_acl_constants.py` | Types, bits, grantees |
| `resource_acl_service.py` | Resolve, filters, normalize/match owner |
| `api/resource_acl.py` | Sharing HTTP API |
| `api/admin/resource_acl_admin.py` | Issues + audit ACL |
| `api/admin/groups.py` | Groups, members, shared list |
| `models/resource_acl.py` | `ResourceAclEntry` |
| `data_scope.py` | Channel tree + re-exports |
| `ResourceSharePanel.tsx` / `resourceAclApi.ts` | SPA sharing |
| `tests/test_resource_acl.py` | Unit tests |
