# openKMS docs

The full, navigable docs are published at **<https://yingrui.github.io/openKMS/>**.

If you are reading this on GitHub, jump to:

- [Overview](overview.md) — what openKMS is.
- [Quickstart](quickstart.md) — get it running locally.
- [Architecture](architecture.md) — how the pieces fit together.
- [Functionalities](functionalities.md) — every feature and API.
- [Developer setup](developer/setup.md) — host environment, pgvector, OIDC.
- [Doc conventions for AI agents](agents.md) — how to keep these docs healthy.

The site is built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) (`mkdocs.yml` at the repo root). To rebuild locally:

```bash
pip install -r docs/requirements.txt
mkdocs serve
```
