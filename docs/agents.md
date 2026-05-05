# Doc conventions for AI agents

This page tells humans **and AI coding agents** how the openKMS docs are organised, where each kind of edit goes, and what conventions to follow. It mirrors the workspace rules at `.cursor/rules/*.mdc` so that an agent running in any IDE has the same picture.

## Mental model

The docs split into two layers:

1. **Canonical reference files** at the top of `docs/` — long, dense, kept in sync with the code on every commit:
    - [`architecture.md`](architecture.md) — modules, flows, layout, config.
    - [`functionalities.md`](functionalities.md) — features, APIs, data models.
    - [`development_plan.md`](development_plan.md) — current state and next-up tasks.
    - [`security.md`](security.md), [`tech_debt.md`](tech_debt.md), [`wiki_agent_prototype.md`](wiki_agent_prototype.md).
2. **Reader-friendly entry pages** added on top of those references, optimised for scanning:
    - [`index.md`](index.md), [`overview.md`](overview.md), [`quickstart.md`](quickstart.md), [`operations/docker.md`](operations/docker.md), [`developer/setup.md`](developer/setup.md), this page.

When in doubt, **edit a canonical file first** and add or tighten a wrapper page only if a human would have trouble finding the change.

## Where to put a change

| What changed in code | Update |
|---|---|
| New module, flow, layout change, config knob | [`architecture.md`](architecture.md) |
| New feature, API endpoint, request/response, UI surface | [`functionalities.md`](functionalities.md) |
| Task you just finished, or a plan shift | [`development_plan.md`](development_plan.md) |
| Auth / permission / scope behaviour | [`security.md`](security.md) |
| Known shortcut, hack, or risk | [`tech_debt.md`](tech_debt.md) |
| Quickstart steps or ports | [`quickstart.md`](quickstart.md) and root `README.md` |
| Docker / Compose runtime | [`operations/docker.md`](operations/docker.md) and `docker/README.md` |
| Local dev environment (DB, pgvector, OIDC) | [`developer/setup.md`](developer/setup.md) |
| Site nav, theme, or build | `mkdocs.yml` and `.github/workflows/docs.yml` |

If a commit touches several layers, **stage the doc updates with the code commit** — that is the contract enforced by `.cursor/rules/docs-before-commit.mdc`.

## House style (mirror of `writing-style.mdc`)

- **User-visible product copy**: explain *what* a feature does, not *how* it is stored or called. Avoid file paths, bucket names, `s3://`, MinIO/presigned jargon, raw `/api/…` URLs, and env vars unless the screen is for admins/operators.
- **Docs in `docs/`**: technical detail is fine — keep tables and headings consistent with surrounding files.
- **Commits and PRs**: short imperative subject (`Add article channels API`). Body only when the reason or risk is not obvious.
- **Dates**: use ISO `YYYY-MM-DD` when noting "last updated" or release dates.

## Things to keep stable

- **Heading shape** of canonical files. Many cross-links in the SPA, READMEs, and other rules point at sections like `## High-Level Diagram`, `## Frontend Structure`, `## Backend Structure`. Renaming them silently breaks links.
- **Table format** in `functionalities.md`. The file is one big table per feature area; new rows go in the same table, not a new sub-section.
- **Mermaid blocks**. The site renders them via `pymdownx.superfences`; do not switch fences to `~~~` or add language hints other than `mermaid`.
- **Edit links**. The Material theme's "edit on GitHub" pencil works only while the file path matches `docs/<file>.md` against `main`. Don't move files without updating any external links you can find.

## Adding a new page

1. Create the file under `docs/…` (folders may nest one level deep — see `developer/`, `operations/`).
2. Add it to the `nav:` block of `mkdocs.yml`.
3. Link to it from the closest existing page (usually `index.md` or `overview.md`).
4. Build locally (see below) before committing.

## Build the site locally

```bash
pip install -r docs/requirements.txt
mkdocs serve            # http://127.0.0.1:8104
mkdocs build --strict   # the same command CI runs; fails on broken links
```

`--strict` is what the GitHub Actions workflow uses, so if it passes locally it will deploy.

## Deployment pipeline

`.github/workflows/docs.yml` rebuilds and publishes the site to GitHub Pages whenever `docs/**`, `mkdocs.yml`, or the workflow itself changes on `main`. The published site is at <https://yingrui.github.io/openKMS/>.

The workflow uses the official `actions/deploy-pages` flow, so the repository needs **Settings → Pages → Build and deployment → Source = GitHub Actions** enabled once.

## Backend-specific doc rules

These come from `.cursor/rules/alembic-migrations.mdc`; restated here so an agent updating docs sees them too:

- Any change to `backend/app/models/` requires an Alembic migration (`cd backend && alembic revision --autogenerate -m "…"`), a review, then `alembic upgrade head`.
- The API does **not** create tables or extensions at startup. Local: `backend/dev.sh` → `scripts/ensure_pgvector.py`, then Alembic. Docker: `CMD` runs Alembic, then uvicorn.
- New models must be registered in `backend/alembic/env.py`; Procrastinate tables are excluded.

## Quick checklist before you commit a doc change

- [ ] Updated the right canonical file (`architecture` / `functionalities` / `development_plan`).
- [ ] Wrapper pages still accurate (quickstart, overview, operations).
- [ ] `mkdocs build --strict` passes locally (or you're confident no links broke).
- [ ] Subject line is short and imperative; no wall-of-text body unless needed.
