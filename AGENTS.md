# openKMS — AGENTS.md

> Migrated from `.cursor/rules/`. Sections below correspond to the original rule files.

---

## Project Overview

**Source:** `.cursor/rules/project-overview.mdc`

Knowledge system: documents (PaddleOCR-VL), channels, articles, KBs/RAG, wiki.

| Area | Path |
|------|------|
| Backend | `backend/app/` (FastAPI, async SQLAlchemy) |
| Frontend | `frontend/src/` (React 19, Vite) |
| Docker | `docker/` — see `docker/README.md` |
| Docs | `docs/` |
| VLM | `vlm-server/` |

**Ports:** backend 8102, Vite 5173, Docker UI 8082 (nginx), VLM 8101, qa-agent 8103, docs (`mkdocs serve`) 8104. **Config:** `OPENKMS_*` in `backend/.env`; frontend `config/index.ts`.

---

## First Principles (对话与决策)

**Source:** `.cursor/rules/first-principles.mdc`

以第一性原理！从原始需求和问题本质出发，不从惯例或模板出发。

1. 不要假设我清楚自己想要什么。动机或目标不清晰时，停下来讨论。
2. 目标清晰但路径不是最短的，直接告诉我并建议更好的办法。
3. 遇到问题追根因，不打补丁。每个决策都要能回答「为什么」。
4. 输出说重点，砍掉一切不改变决策的信息。

（与 Karpathy guidelines、Writing style 同用；若有冲突，以本条对「为何做 / 是否该做」的追问为准。）

---

## Karpathy Behavioral Guidelines

**Source:** `.cursor/rules/karpathy-guidelines.mdc`

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Writing Style

**Source:** `.cursor/rules/writing-style.mdc`

### SPA (`frontend/src/`)

User-visible text: **what** the feature does, not **how** it is stored or called. Avoid file paths, bucket names, `s3://`, MinIO/presigned jargon, raw `/api/…` URLs, env vars—unless the screen is for admins/operators. Console technical pages may be denser.

### Assistant replies (Cursor)

- Match answer length to the task; no filler or "say the word" closings.
- Use **markdown links** for web URLs; use **path links** or code citation blocks for repo code (per project citation rules).
- Prefer plain words over buzzwords; spell out uncommon acronyms once if needed.

### Commits and PRs

Short **imperative** subject (`Add article channels API`). Body only when the reason or risk is not obvious.

**Do not commit without explicit permission.** Agents must not `git commit`, `git commit --amend`, or push unless the user explicitly asks. When the user says "commit", only stage files owned by the current task — never include unrelated working-tree changes.

### Docs in `docs/`

Technical detail is fine there; keep tables and headings consistent with surrounding files.

---

## Docs Before Commit

**Source:** `.cursor/rules/docs-before-commit.mdc`

If the user asks for a commit (or you are committing), review staged changes and update **only what changed**:

| File | When |
|------|------|
| `docs/architecture.md` | New modules, flows, layout, config |
| `docs/development_plan.md` | Tasks done/added, plan shifts |
| `docs/features/<area>.md` | Features and UI surfaces for that area |
| `docs/features/api-reference.md` | New / changed HTTP endpoints |
| `docs/features/data-models.md` | New tables / columns |
| `docs/design-system.md` | Design system — update when shared SCSS patterns, tokens, conventions, or cross-route layout primitives change |

`docs/functionalities.md` is the routing index — only edit it when adding or removing a feature page.

### Multilingual docs (mkdocs-static-i18n)

English pages (`docs/**/*.md` without a locale suffix) are the **source of truth**. Chinese pages (`*.zh.md`) are **translations** — update English first, then refresh the matching `.zh.md` when one exists. Markdown links omit the locale suffix (write `goals.md`, not `goals.zh.md`).

### Verify before commit

If staged changes touch `docs/**`, `mkdocs.yml`, or `docs/requirements.txt`, run before committing:

```bash
mkdocs build --strict --site-dir _site
```

Stage doc updates with the code commit.

---

## Alembic Migrations

**Source:** `.cursor/rules/alembic-migrations.mdc`

- Any change to `backend/app/models/` → **migration** (`cd backend && alembic revision --autogenerate -m "…"`), **review**, then `alembic upgrade head`.
- The API **does not** create tables or extensions at startup. **Local:** `backend/dev.sh` → `scripts/ensure_pgvector.py`, then Alembic. **Docker:** `CMD` runs Alembic (bootstrap creates `vector` if needed), then uvicorn.
- Register new models in `backend/alembic/env.py`. Do not migrate Procrastinate tables (`include_name` excludes them).
