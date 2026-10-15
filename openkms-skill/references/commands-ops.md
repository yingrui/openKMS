# Commands — ops (data sources, connectors, jobs, Apps, Kubernetes, media write)

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**. Load for connectors, jobs, hosted Apps, and registered clusters.

Prefix with `python scripts/cli.py`. Writes need `--yes` / `--dry-run`. Before Apps or kubernetes apply/delete/dev-sync, open the mandatory guides. Gotchas: [pitfalls.md](pitfalls.md).

## Read / query

| Goal | Command |
|------|---------|
| Data sources | `data-sources list` · `data-sources get --id ID` (as available via `--help`) |
| Datasets | `datasets list [--data-source-id ID]` · `datasets rows --id DS_ID` · `datasets metadata --id DS_ID` · `datasets column-description --id DS_ID --column C --description "…" --yes` · `datasets profile --id DS_ID` · `datasets joins list --id DS_ID` · `datasets quality list --id DS_ID` · `datasets quality run --id DS_ID --rule-id RULE_ID --yes` · `datasets ingest --file x.csv --data-source-id ID --schema imports --table x --yes` |
| Model metrics | `metrics list [--semantic-model-id M] [--base-dataset-id ID]` · `metrics add --name N --semantic-model-id M --base-dataset-id ID --expression "SUM(amount)" [--type ratio --joins J1,J2 --yes]` · `metrics compute --metric-id M_ID` · `metrics runs --metric-id M_ID` · `metrics delete --metric-id M_ID --yes` |
| Semantic models | `semantic-models list` · `semantic-models add --name N [--datasets D1,D2 --yes]` · `semantic-models fields list --id M` · `semantic-models fields add --id M --dataset-id D --name F --column C [--role time --granularity day --yes]` · `semantic-models preview --id M --metric-id X [--group-by F1,F2]` · `semantic-models export --id M [--format yaml]` · `semantic-models import --file model.json --yes` · `semantic-models delete --id M --yes` |
| Data Explorer | `explorer reports-list` · `explorer reports-create --name "…" --question "…" --dataset-id DS_ID --narrative-file ./analysis.md --yes` · `explorer reports-update --id R --status ready --yes` |
| Connectors | `connectors kinds` · `connectors list` · `connectors get --id ID` |
| Jobs | `jobs get --id JOB_ID` · `jobs list` |
| Module Apps | `apps list` · `apps get <id>` |
| Kubernetes clusters | `kubernetes clusters list` |
| Secrets (names + keys only) | `kubernetes secrets --cluster-id ID --namespace NS` |
| ConfigMaps / Deployment env | `kubernetes configmaps --cluster-id ID --namespace NS` · `kubernetes env --cluster-id ID --deployment NAME --namespace NS` |
| Pod logs | see `kubernetes --help` / [kubernetes.md](kubernetes.md) |

## Write

| Goal | Command |
|------|---------|
| Provision Tushare slot dataset | `connectors provision-dataset --kind tushare --slot stock_basic --data-source-id PG --yes` |
| Queue connector sync | `connectors sync --id CONN --yes` then `jobs get --id JOB` |
| Create / patch / publish / delete module App | **Read [app-builder.md](app-builder.md) first.** Prefer `kubernetes register-app … --yes`. Or `apps create --name "Web" --api-name web --bindings-json '{"k8s":{…}}' --yes` · `apps patch <id> --bindings-json '{"k8s":{…}}' --yes` · `apps publish <id> --yes` · `apps delete <id> --yes` |
| Apply YAML | **Read [kubernetes.md](kubernetes.md) first**, then `kubernetes apply --cluster-id ID --file ./deploy.yaml --namespace default --yes` |
| Delete allowlisted kind | `kubernetes delete --cluster-id ID --kind Service --name NAME --namespace default --yes` |
| Register Service as App | `kubernetes register-app --cluster-id ID --namespace default --service NAME --port 80 --name "Web" --api-name webApp --yes` |
| Dev-sync project → Pod | **Read [kubernetes.md](kubernetes.md) first** (do **not** `PUT …/files/content` to mirror an external clone), then `kubernetes dev-sync --project-id ID --cluster-id ID --deployment NAME --local-path REL --container-path /abs [--reload] --yes` |

Recipes: [workflows.md](workflows.md) **G**, **H**. Operators HTTP map: [REFERENCE.md](REFERENCE.md).
