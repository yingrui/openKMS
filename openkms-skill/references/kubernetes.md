# Kubernetes (skill)

Agents deploy through **`python scripts/cli.py kubernetes …`**. The backend decrypts the stored kubeconfig; **the CLI never receives kubeconfig plaintext**.

Requires **`console:kubernetes`** (or `all`) on the API key. Register clusters in **Console → Kubernetes** — the skill does not create or edit kubeconfig.

## Workflow

1. `kubernetes clusters list` — pick `--cluster-id` (and note `default_namespace`).
2. `kubernetes namespaces` / `deployments` / `pods` / `services` / `secrets` / `configmaps` — inspect.
3. Write a YAML file in the **project workspace** (`Deployment` + `Service` is the usual pair).
4. `kubernetes apply --cluster-id ID --file ./deploy.yaml --namespace NS --yes`
5. `kubernetes pods --cluster-id ID --namespace NS` then `kubernetes logs --cluster-id ID --pod NAME --namespace NS`

Allowed kinds: **Deployment**, **Service**, **Pod**, **ConfigMap**. Cluster-scoped objects (ClusterRole, PV, …) and **Secret** are rejected — do not put passwords in apply YAML or ConfigMaps.

`apply` creates or patches. Delete with `kubernetes delete --kind Service --name NAME --yes`.

## Deploy secrets (database passwords, etc.)

1. **Check what already exists** in the target namespace before writing YAML:
   `kubernetes secrets --cluster-id ID --namespace NS` — Secret names and **key names** only (values are never returned). `managed_by_project_id` is set when the Secret is synced from a Project's deploy secrets; other Secrets were created in the cluster directly. Both can be referenced.
   Inside openKMS Agents the project's deploy secret names/keys are also in the system context; the cluster listing is still the source of truth for what is synced.
2. Reuse an existing Secret/key when it fits. **Never invent** a Secret name or key that is not listed — the Pod will fail with `CreateContainerConfigError`.
3. If a needed Secret/key is missing, stop and ask a human to add it in **Project settings → Deploy** (values encrypted in openKMS) and click **Sync to cluster**. Do not put the value in YAML or a ConfigMap.
4. Reference it in Deployment YAML:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      containers:
        - name: app
          image: my-app:latest
          envFrom:
            - secretRef:
                name: app-db   # synced by Project settings
```

Or a single key:

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: app-db
        key: DATABASE_URL
```

Non-secret config: `kubernetes configmaps --cluster-id ID --namespace NS` (includes values); reference with `configMapRef` / `configMapKeyRef` the same way.  
Verify wiring after apply: `kubernetes env --cluster-id ID --deployment NAME --namespace NS` (shows refs, not secret values).

## Register in Apps

Register a Service as a **hosted App** (`template_id=module`, published immediately):

`kubernetes register-app --cluster-id ID --namespace NS --service NAME --port 80 --name "Web" --api-name webApp --yes`

Needs **`console:kubernetes`** and **`ontology:write`**. The app is opened in Apps via the API-server Service proxy (no kubeconfig in the browser). The workload must work under a URL subpath or use relative assets. WebSocket is not proxied.

Hosted apps should **not** implement their own sign-in. openKMS authenticates the user and sends `X-Openkms-User-Id`, `X-Openkms-Username`, `X-Openkms-User-Name`, `X-Openkms-User-Email`, `X-Openkms-User-Admin` (values percent-encoded UTF-8) on every proxied request; read identity from those headers, key user data by `X-Openkms-User-Id`, return `401` when it is missing. Do not expose the Service via Ingress / NodePort. Full contract: `docs/features/app-builder.md#module-identity-headers`.
