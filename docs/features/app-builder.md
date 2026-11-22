# Chamber (hosted apps)

**Chamber** hosts HTTP UIs registered against a Kubernetes **Service**. They open via an iframe that proxies through the API server. openKMS authenticates the user and forwards identity headers; the Service does not need its own sign-in.

**Registering is the only state.** There is no draft, publish or version step: an app is openable the moment it is registered, and editing its Service binding takes effect on the next open. Any app can be hosted — a decision system is one kind of app, not a platform concept.

Experimental **A2UI App Builder** authoring (Source / Design / OntoObjectList) has been **removed**. Future A2UI experiments belong in **Agent Project** sessions, not this product surface.

## Register {#chamber-hosted-services}

| Path | How |
|------|-----|
| Console → Kubernetes → cluster detail | **Register in Chamber** |
| Skill | `kubernetes register-app …` or `apps create --bindings-json '{"k8s":{…}}'` |

Requires **`console:kubernetes`** and **`ontology:write`** (`template_id=module`).

## Run

The **Chamber** app (`/chamber`):

- List / manage: `/chamber`
- Run: `/chamber/{id}` → iframe → `GET/POST …/api/chamber/apps/{id}/proxy/`
- Settings (Service binding): `/chamber/{id}/settings`
- Opening runs one `HEAD` through the proxy first: a `502/504` (Service unreachable), `400` (incomplete binding), `401/403` (not authorized) or `404` (not registered) shows a panel naming the target instead of the iframe, with **Check again** and a link to Settings. A probe that cannot answer does not block the app — the frame loads anyway.

**Deep links and WebSocket:** the frame's routes never reach the address bar, so refresh, share and Back return to the app's root, and a WebSocket is not proxied at all. **Open in a new tab** (the ↗ action in the run header) is the escape hatch for both: a real tab carries its own URL and can hold a live connection. The line under the frame says so, because a silently half-working live feature is worse than a plain one.

Legacy `/apps` and `/app-builder` routes redirect here. Prefer relative assets or a URL subpath. Settings and Delete are shown only to users with **`ontology:write`** (the same gate the API applies); opening Settings by URL is allowed, the fields are read-only with a line naming the missing permission.

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
| GET/PATCH/DELETE | `/api/chamber/apps/{id}` | Run doc (any registered app) / update / delete |
| * | `/api/chamber/apps/{id}/proxy[/{path}]` | Session-cookie auth; strip Bearer |

Storage: `chamber_apps` only — `chamber_published_versions` was dropped with the version layer (migration `08327ca4c4fe`), and the A2UI `app_components` table is gone too.

## Related

- [Kubernetes clusters](kubernetes-clusters.md) — register clusters, apply, register-app, identity contract
- Skill: `references/kubernetes.md`, `apps` CLI (module only)
