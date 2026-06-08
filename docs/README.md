# openKMS docs

The full, navigable docs are published at **<https://yingrui.github.io/openKMS/>** (English) and **<https://yingrui.github.io/openKMS/zh/>** (简体中文). Use the language switcher in the site header, or add a `.zh.md` suffix file next to any English page to translate it (see [Doc conventions — Multilingual docs](agents.md#multilingual-docs-mkdocs-static-i18n)).

If you are reading this on GitHub, jump to:

- [Home (index)](index.md) — entry, ports, where to read what, and research index.
- [Goals (vision)](goals.md) — product direction (中文).
- [Quickstart](quickstart.md) — get it running locally.
- [Architecture](architecture.md) — how the pieces fit together.
- [Functionalities](functionalities.md) — every feature and API.
- [Security](security.md) — security **design** principles (operations: [Console & auth](features/console-and-auth.md), [Data security](features/data-security.md)).
- [Development plan](development_plan.md) — shipped scope, priorities, backlog.
- [Developer setup](developer/setup.md) — host environment, pgvector, OIDC.
- [Doc conventions for AI agents](agents.md) — how to keep these docs healthy.

**Research** (`research/`): [RAGFlow vs openKMS](research/ragflow_vs_openkms.md), [Confluence AI vs openKMS](research/confluence_ai_vs_openkms.md), [Operational Knowledge Fitness](research/km_dimension_operational_fitness.md), [Text content evaluation](research/text_content_evaluation.md), [LLM wiki vs openKMS](research/llm_wiki_comparison.md).

The site is built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) (`mkdocs.yml` at the repo root). To rebuild locally:

```bash
pip install -r docs/requirements.txt
mkdocs serve
```
