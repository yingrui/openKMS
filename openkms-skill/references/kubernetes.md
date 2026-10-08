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

1. A human creates the secret in **Project settings → Deploy** (values encrypted in openKMS) and clicks **Sync to cluster**.
2. You only see **names and key names** in the agent system context (never values).
3. Reference them in Deployment YAML:

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

List cluster Opaque Secrets (keys only): `kubernetes secrets --cluster-id ID --namespace NS`.  
Read Deployment env wiring: `kubernetes env --cluster-id ID --deployment NAME --namespace NS`.

## Register in Apps

Register a Service as a **hosted App** (`template_id=module`, published immediately):

`kubernetes register-app --cluster-id ID --namespace NS --service NAME --port 80 --name "Web" --api-name webApp --yes`

Needs **`console:kubernetes`** and **`ontology:write`**. The app is opened in Apps via the API-server Service proxy (no kubeconfig in the browser). The workload must work under a URL subpath or use relative assets. WebSocket is not proxied.
