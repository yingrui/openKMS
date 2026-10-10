# Apps (hosted modules)

openKMS **Apps** are hosted HTTP UIs registered against a Kubernetes **Service**. They open in the Apps gallery via an iframe that proxies through the API server. openKMS authenticates the user and forwards identity headers; the Service does not need its own sign-in.

Experimental **A2UI App Builder** authoring (Source / Design / OntoObjectList) has been **removed**. Future A2UI experiments belong in **Agent Project** sessions, not this product surface.

## Register

| Path | How |
|------|-----|
| Console → Kubernetes → cluster detail | **Register in Apps** |
| Skill | `kubernetes register-app …` or `apps create --bindings-json '{"k8s":{…}}'` |

Requires **`console:kubernetes`** and **`ontology:write`**. The app is **published immediately** (`template_id=module`).

## Run

Single Suite App **Apps** (`/apps`):

- List / manage: `/apps`
- Run: `/apps/{id}` → iframe → `GET/POST …/api/app-builder/apps/{id}/proxy/`
- Settings (Service binding): `/apps/{id}/settings`

Legacy `/app-builder` routes redirect here. WebSocket is not proxied. Prefer relative assets or a URL subpath.

## Module identity headers {#module-identity-headers}

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
| GET/POST | `/api/app-builder/apps` | List / create module apps |
| GET/PATCH/DELETE | `/api/app-builder/apps/{id}` | Run doc (published) / update / delete |
| POST | `/api/app-builder/apps/{id}/publish` | New bindings snapshot |
| POST | `/api/app-builder/apps/{id}/unpublish` | Unpublish |
| GET | `/api/app-builder/apps/{id}/versions` | Version history |
| * | `/api/app-builder/apps/{id}/proxy[/{path}]` | Session-cookie auth; strip Bearer |

Storage table remains `ontology_apps` (historical name). Draft A2UI table `app_components` is dropped.

## Related

- [Kubernetes clusters](kubernetes-clusters.md) — register clusters, apply, register-app, identity contract
- Skill: `references/kubernetes.md`, `apps` CLI (module only)
