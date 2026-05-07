# Overview

A short, high-level tour of openKMS. For the full system design see [Architecture](architecture.md); for individual features see [Functionalities](functionalities.md).

## What problems does it solve?

- A single place to **collect**, **parse**, and **search** mixed content (PDF/HTML/ZIP/images, articles, wiki notes).
- A **RAG layer** (knowledge bases + QA Agent) that grounds answers in those documents.
- An **ontology and knowledge map** so domain terms map to actual channels and pages.
- **Org-friendly access control**: OIDC or local users, role-based permissions, group-scoped data.

## The three content surfaces

### Documents

- Upload to a **document channel** (a folder in a tree).
- A worker picks up the job and runs **openkms-cli** with **PaddleOCR-VL** (via the separate **mlx-vlm** server) to produce Markdown plus per-page layout / block images.
- Originals live in S3/MinIO under `{file_hash}/`. Markdown is editable in the UI; explicit version snapshots are stored in `document_versions`.
- **Lifecycle**: `series_id`, `effective_from`, `effective_to`, `lifecycle_status`, plus `document_relationships` (`supersedes`, `amends`, `implements`, `see_also`).

### Articles

- Markdown-first CMS organised in **article channels** (separate tree from documents — no parsing pipeline).
- Inline images and arbitrary attachments are uploaded to MinIO under `articles/{article_id}/`.
- A `POST /api/articles/import` multipart endpoint lets external tools push a fully-formed article (markdown + images + attachments) in one call, with an `origin_article_id` (Source) for provenance and idempotent upserts.
- Article-to-article **Relationships** mirror document lineage (`supersedes`, `amends`, `see_also`, …).

### Knowledge bases

- A KB indexes documents from one or more channels. **FAQs** can be hand-written or LLM-generated; **chunks** are stored with embeddings in pgvector.
- The **QA Agent** is a separate FastAPI + LangGraph service that retrieves through the backend search API and generates answers.
- Hybrid search supports metadata filters and an opt-in `include_historical_documents` flag (default respects each document's `is_current_for_rag`).

## Supporting surfaces

- **Wiki spaces** — free-form notes with vault import, page graph view, and a **Wiki Copilot** that can read pages and (with `wikis:write`) upsert them.
- **Knowledge Map** — taxonomy of terms with links to channels / wiki spaces / article channels; rendered as a force graph on the home page.
- **Glossaries** — bilingual (EN/CN) term definitions with AI-suggested translations.
- **Ontology (objects & links)** — typed object instances and link types stored in the same Postgres database.
- **Pipelines, Jobs, Models, Data sources, Datasets, Evaluations** — operator-facing surfaces under the **Console** and the Ontology sidebar.

## Auth in one paragraph

`OPENKMS_AUTH_MODE=oidc` (default) uses an external OpenID Connect IdP with PKCE in the SPA. `OPENKMS_AUTH_MODE=local` keeps users and bcrypt hashes in PostgreSQL and issues HS256 JWTs (plus optional HTTP Basic for `openkms-cli`). Either way the backend accepts `Authorization: Bearer` or a session cookie. **Personal API keys** (`okms.{id}.{secret}`, created under **Settings** → **API keys**) authenticate the same routes as a logged-in user and are intended for scripts and agent tools such as **`openkms-skill/`** (see [OpenCode skill](features/opencode-openkms-skill.md)). Permissions are catalog-based (`security_permissions` rows with route/API patterns); roles map to permission keys; **group data scopes** can additionally narrow what a user sees per resource. See [Security](security.md).

## Where things live (one-liners)

- **PostgreSQL + pgvector** — relational truth, embeddings, procrastinate job queue.
- **S3 / MinIO** — originals (`{file_hash}/`), article bundles (`articles/{id}/`), wiki vaults (`wiki/{space_id}/vault/`), graph cache JSON.
- **Worker** — runs `openkms-cli` jobs, calls the VLM server, indexes KBs.
- **mlx-vlm server** — runs PaddleOCR-VL; deliberately separate from the main stack so you can put it on Apple Silicon / a GPU box.
- **QA Agent** — separate process; never touches the DB; only reads via backend APIs.
