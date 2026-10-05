# Kubernetes (skill)

Agents deploy through **`python scripts/cli.py kubernetes …`**. The backend decrypts the stored kubeconfig; **the CLI never receives kubeconfig plaintext**.

Requires **`console:kubernetes`** (or `all`) on the API key. Register clusters in **Console → Kubernetes** — the skill does not create or edit kubeconfig.

## Workflow

1. `kubernetes clusters list` — pick `--cluster-id` (and note `default_namespace`).
2. `kubernetes namespaces` / `deployments` / `pods` / `services` — inspect.
3. Write a YAML file in the **project workspace** (`Deployment` + `Service` is the usual pair).
4. `kubernetes apply --cluster-id ID --file ./deploy.yaml --namespace NS --yes`
5. `kubernetes pods --cluster-id ID --namespace NS` then `kubernetes logs --cluster-id ID --pod NAME --namespace NS`

Allowed kinds: **Deployment**, **Service**, **Pod**, **ConfigMap**. Cluster-scoped objects (ClusterRole, PV, …) are rejected.

`apply` creates or patches. Delete with `kubernetes delete --kind Service --name NAME --yes`.

Register a Service as a **hosted App** (`template_id=module`, published immediately):

`kubernetes register-app --cluster-id ID --namespace NS --service NAME --port 80 --name "Web" --api-name webApp --yes`

Needs **`console:kubernetes`** and **`ontology:write`**. The app is opened in Apps via the API-server Service proxy (no kubeconfig in the browser). The workload must work under a URL subpath or use relative assets. WebSocket is not proxied.
