# Kubernetes clusters

Console management for **registered Kubernetes clusters** that agents and operators can use. Operators can **bring your own cluster** (paste a kubeconfig, encrypt at rest, test connectivity) and **browse** namespaces, Deployments, Services, and Pods. The console can **apply** allowlisted YAML, **delete** those kinds, **read Pod logs**, and **register a Service in Apps**. Cloud provisioning is not included.

Related: [Console & authentication](console-and-auth.md), [Agents](openkms-agents.md), [App Builder & Apps](app-builder.md), [API reference](api-reference.md#kubernetes-clusters-consolekubernetes), [Data models](data-models.md#kubernetescluster).

## Console UI

- **List:** `/console/kubernetes` — register, edit, delete, test connection; open a cluster for browse
- **Detail:** `/console/kubernetes/{id}` — pick a namespace; Deployments, Services, Pods, Secrets, ConfigMaps; Deployment env; Pod logs; apply YAML; delete allowlisted objects; register a Service in Apps
- **Permission:** `console:kubernetes` (or `all` / admin)
- Form fields: name, description, default namespace, optional **API server** (the URL the backend uses to reach the cluster), kubeconfig YAML, optional **skip TLS verification** (lab / self-signed only), optional **openKMS runs inside this cluster** (`options.direct_service_access`: hosted Apps call `*.svc.cluster.local` directly instead of the API-server proxy; see [App Builder](app-builder.md#module-hosted-services))

API responses never include kubeconfig plaintext — only `kubeconfig_configured: true/false` plus non-secret fields (`api_server`, `default_namespace`, last test status).

## Storage and encryption

Table **`kubernetes_clusters`**. The full kubeconfig is stored in **`kubeconfig_encrypted`** using the same Fernet helper as data sources / connectors (`OPENKMS_DATASOURCE_ENCRYPTION_KEY`, or a key derived from `OPENKMS_SECRET_KEY` in development).

On create/update, the server stores **`api_server`**: an explicit override if provided, otherwise the URL parsed from kubeconfig (for the list UI). Connection test and browse rewrite the current-context cluster `server` to that stored URL so kubeconfigs that point at `127.0.0.1` still work when the API process is not on the same loopback. Updates that omit kubeconfig (or send an empty string) keep the existing ciphertext. Sending `api_server: ""` on update falls back to the URL in kubeconfig.

## Connection test

`POST /api/kubernetes-clusters/{id}/test` decrypts the stored kubeconfig, builds a Kubernetes client, and calls the Version API. Success/failure is cached on the row (`last_tested_at`, `last_test_ok`).

Prefer kubeconfigs that use **token** or **client certificate** credentials. Client-side **exec** plugins often fail when the API process runs the test (no interactive auth / missing binaries).

## Resource browse

| Endpoint | Purpose |
|----------|---------|
| `GET …/namespaces` | List namespaces |
| `GET …/deployments?namespace=` | Deployments in a namespace (defaults to cluster `default_namespace`) |
| `GET …/pods?namespace=` | Pods in a namespace |
| `GET …/services?namespace=` | Services (name, type, ClusterIP, ports) |
| `GET …/pods/{name}/logs` | Recent Pod logs (`tail`, optional `container`) |
| `POST …/apply` | Create or patch YAML (`Deployment`, `Service`, `Pod`, `ConfigMap`) — **not** `Secret` |
| `POST …/delete` | Delete one allowlisted namespaced object |
| `GET|PUT|DELETE …/secrets[/{name}]` | Opaque Secrets (keys only on GET; values write-only) |
| `GET|PUT|DELETE …/configmaps[/{name}]` | ConfigMaps (data visible) |
| `GET|PUT …/deployments/{name}/env` | Container `env` / `envFrom` (secret refs unresolved) |

Console row actions match the skill: logs Dialog, confirm delete, apply Dialog, Secret/ConfigMap editors, Deployment **Environment**. kubeconfig never returns in responses. Secrets labeled `openkms.io/project-id` are **read-only** in the console (edit from Project settings → Deploy).

**Register in Apps** (Service row): creates a published `template_id=module` app bound to `cluster_id` / namespace / service / port. Requires `ontology:write` in addition to `console:kubernetes`. See [App Builder](app-builder.md#module-hosted-services). The workload gets the signed-in user from openKMS [identity headers](app-builder.md#module-identity-headers) and should not implement its own login.

## Deploy secrets (projects) {#deploy-secrets-projects}

Operators store encrypted key/values under **Project settings → Deploy**, then **Sync to cluster** (writes an Opaque Secret with `app.kubernetes.io/managed-by=openkms` and `openkms.io/project-id`). Agents only see names/keys in the system prompt and must reference them via `secretRef` / `secretKeyRef`. Personal API keys cannot create or update deploy-secret values.

## Agents

The **openkms** skill lists registered clusters, applies allowlisted kinds (not Secret), lists secrets/configmaps/env, tails logs, and can `kubernetes register-app`. The session API key needs **`console:kubernetes`** (and **`ontology:write`** to register Apps). Kubeconfig stays encrypted on the server.

## Out of scope (still open)

- Cloud-provider cluster provisioning
- Per-project default cluster binding
- Ingress / public TLS / WebSocket proxy
- Running the A2UI canvas inside a Pod
- External secret managers (Vault / ESO)
