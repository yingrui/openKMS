# Apps (module only)

openKMS Apps are **hosted Kubernetes Services** (`template_id=module`). There is **no** A2UI Source / Design / synthesize / OntoObjectList authoring in this product.

## Prefer

1. `kubernetes register-app --cluster-id … --namespace … --service … --port … --name … --api-name … --yes`
2. Or `apps create --name … --api-name … --bindings-json '{"k8s":{"cluster_id":"…","namespace":"…","service":"…","port":80}}' --yes`

Needs **`console:kubernetes`** + **`ontology:write`**.

## CLI

| Command | Purpose |
|---------|---------|
| `apps list` | List module apps |
| `apps get <id>` | Published run document |
| `apps create …` | Register (requires `bindings.k8s`) |
| `apps patch <id> …` | Name / description / `bindings.k8s` |
| `apps publish <id>` | New version snapshot |
| `apps delete <id>` | Remove registry entry |

## Do not

- Invent A2UI Source, `OntoObjectList`, `apps synthesize`, or `--a2ui-messages-file`
- Use `PUT /api/projects/…/files/content` to mirror another clone for hot sync (see [kubernetes.md](kubernetes.md))

Identity headers for hosted apps: see monorepo `docs/features/app-builder.md#module-identity-headers` or [kubernetes.md](kubernetes.md).
