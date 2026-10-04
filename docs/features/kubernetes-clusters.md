# Kubernetes clusters

Console management for **registered Kubernetes clusters** that agents (and future deploy tooling) can use. Operators can **bring your own cluster** (paste a kubeconfig, encrypt at rest, test connectivity) and **browse** namespaces, Deployments, and Pods. Cloud provisioning and Agent deploy tools are not included yet.

Related: [Console & authentication](console-and-auth.md), [Agents](openkms-agents.md), [API reference](api-reference.md#kubernetes-clusters-consolekubernetes), [Data models](data-models.md#kubernetescluster).

## Console UI

- **List:** `/console/kubernetes` — register, edit, delete, test connection; open a cluster for browse
- **Detail:** `/console/kubernetes/{id}` — pick a namespace, refresh Deployments and Pods (read-only)
- **Permission:** `console:kubernetes` (or `all` / admin)
- Form fields: name, description, default namespace, optional **API server** (the URL the backend uses to reach the cluster), kubeconfig YAML, optional **skip TLS verification** (lab / self-signed only)

API responses never include kubeconfig plaintext — only `kubeconfig_configured: true/false` plus non-secret fields (`api_server`, `default_namespace`, last test status).

## Storage and encryption

Table **`kubernetes_clusters`**. The full kubeconfig is stored in **`kubeconfig_encrypted`** using the same Fernet helper as data sources / connectors (`OPENKMS_DATASOURCE_ENCRYPTION_KEY`, or a key derived from `OPENKMS_SECRET_KEY` in development).

On create/update, the server stores **`api_server`**: an explicit override if provided, otherwise the URL parsed from kubeconfig (for the list UI). Connection test and browse rewrite the current-context cluster `server` to that stored URL so kubeconfigs that point at `127.0.0.1` still work when the API process is not on the same loopback. Updates that omit kubeconfig (or send an empty string) keep the existing ciphertext. Sending `api_server: ""` on update falls back to the URL in kubeconfig.

## Connection test

`POST /api/kubernetes-clusters/{id}/test` decrypts the stored kubeconfig, builds a Kubernetes client, and calls the Version API. Success/failure is cached on the row (`last_tested_at`, `last_test_ok`).

Prefer kubeconfigs that use **token** or **client certificate** credentials. Client-side **exec** plugins often fail when the API process runs the test (no interactive auth / missing binaries).

## Resource browse (read-only)

| Endpoint | Purpose |
|----------|---------|
| `GET …/namespaces` | List namespaces |
| `GET …/deployments?namespace=` | Deployments in a namespace (defaults to cluster `default_namespace`) |
| `GET …/pods?namespace=` | Pods in a namespace |

Browse is **read-only** — no create/scale/delete of workloads from the console.

## Agents (next phase)

Cluster registration and browse are the foundation for agent code deploy to Kubernetes. **Agents do not yet** load these credentials or expose deploy tools — workspace shell still runs in the backend/worker process. See [Agents](openkms-agents.md).

## Out of scope (still open)

- Cloud-provider cluster provisioning
- Per-project default cluster binding
- Agent shell/deploy tool injection
- Mutating cluster resources from the console
