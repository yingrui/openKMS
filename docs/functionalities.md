# Functionalities

Per-feature reference, split by topic. The full content used to live in this single file; it now lives under `docs/features/` so each area is short enough to skim and easy to edit independently. The table below is the authoritative routing index — start here.

## Per feature

| Page | Covers |
|---|---|
| [Infrastructure & quality](features/infrastructure.md) | Compose, tests, error handling, code splitting, typecheck |
| [Documents](features/documents.md) | Document channels, upload, parsing pipeline (PaddleOCR-VL), `openkms-cli` |
| [Articles](features/articles.md) | Article channels, CRUD, relationships, lifecycle, attachments, bulk import |
| [Knowledge bases](features/knowledge-bases.md) | KB CRUD, FAQs, chunks, semantic search, QA proxy, kb-index |
| [Wiki spaces](features/wiki-spaces.md) | Wiki pages/files, vault import, graph view, Wiki Copilot agent |
| [Evaluation](features/evaluation.md) | Evaluation datasets, runs, compare |
| [Glossaries](features/glossaries.md) | Bilingual terms, AI suggestion, import/export |
| [Knowledge map & home](features/knowledge-map.md) | Taxonomy nodes, resource links, home hub graph |
| [Ontology — objects, links, datasets](features/ontology.md) | Object/link types, instances, Object Explorer, data sources, datasets |
| [Pipelines, jobs & models](features/pipelines-and-jobs.md) | Pipeline templates, procrastinate jobs, provider/model registry |
| [Console & authentication](features/console-and-auth.md) | Permission catalog, data security, OIDC/local auth, system settings |

## Cross-cutting reference

| Page | Covers |
|---|---|
| [API reference](features/api-reference.md) | One table of every HTTP endpoint, grouped by area |
| [Data models](features/data-models.md) | Schema for every persisted table |
| [Configuration](features/configuration.md) | Backend deps, pgvector, S3/MinIO, cursor rules |

## Where to add new content

When something changes in code, edit the most specific page in the table above:

- **New endpoint** → matching feature page **and** [API reference](features/api-reference.md).
- **New schema column** → [Data models](features/data-models.md) **and** the feature page that uses it.
- **New feature surface** → its dedicated feature page; if no page fits, add a new file under `docs/features/`, link it here, and add a `nav:` entry in `mkdocs.yml`.

See [Doc conventions for AI agents](agents.md) for the full editing checklist.
