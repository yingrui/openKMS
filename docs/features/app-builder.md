# Chamber (decision systems)

**Chamber** hosts HTTP UIs registered against a Kubernetes **Service**. They open via an iframe that proxies through the API server. openKMS authenticates the user and forwards identity headers; the Service does not need its own sign-in.

Experimental **A2UI App Builder** authoring (Source / Design / OntoObjectList) has been **removed**. Future A2UI experiments belong in **Agent Project** sessions, not this product surface.

## Register {#chamber-hosted-services}

| Path | How |
|------|-----|
| Console → Kubernetes → cluster detail | **Register in Chamber** |
| Skill | `kubernetes register-app …` or `apps create --bindings-json '{"k8s":{…}}'` |

Requires **`console:kubernetes`** and **`ontology:write`**. The app is **published immediately** (`template_id=module`).

## Run

The **Chamber** app (`/chamber`):

- List / manage: `/chamber`
- Run: `/chamber/{id}` → iframe → `GET/POST …/api/chamber/apps/{id}/proxy/`
- Settings (Service binding): `/chamber/{id}/settings`

Legacy `/apps` and `/app-builder` routes redirect here. WebSocket is not proxied. Prefer relative assets or a URL subpath.

## Chamber identity headers {#chamber-identity-headers}

On every proxied request openKMS sends (UTF-8 percent-encoded):

- `X-Openkms-User-Id`
- `X-Openkms-Username`
- `X-Openkms-User-Name`
- `X-Openkms-User-Email`
- `X-Openkms-User-Admin`

Key tenant data by `X-Openkms-User-Id`. Return `401` when it is missing. Do not expose the Service via Ingress / NodePort for end users.

## API (summary)

| Method | Path | Notes |
|--------|------|--------|
| GET/POST | `/api/chamber/apps` | List / create Chamber apps |
| GET/PATCH/DELETE | `/api/chamber/apps/{id}` | Run doc (published) / update / delete |
| POST | `/api/chamber/apps/{id}/publish` | New bindings snapshot |
| POST | `/api/chamber/apps/{id}/unpublish` | Unpublish |
| GET | `/api/chamber/apps/{id}/versions` | Version history |
| * | `/api/chamber/apps/{id}/proxy[/{path}]` | Session-cookie auth; strip Bearer |

Storage tables: `chamber_apps` and `chamber_published_versions`. The A2UI `app_components` table is dropped.

## Related

- [Kubernetes clusters](kubernetes-clusters.md) — register clusters, apply, register-app, identity contract
- Skill: `references/kubernetes.md`, `apps` CLI (module only)
