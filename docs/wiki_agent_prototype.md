# Wiki space: linked documents and embedded agent (prototype design)

This document is the **single spec** for wiki–document associations, the wiki-space **Documents** tab + **Wiki Copilot** UI, and the **in-process LangGraph agent** in the openKMS backend. It complements [architecture.md](./architecture.md).

**Shipped (MVP v1)**

- [WikiSpaceDetail](../frontend/src/pages/WikiSpaceDetail.tsx): main + right rail; **Pages | Documents** tabs; **15** per page; **Documents** list uses `GET/POST/DELETE` **`/api/wiki-spaces/{id}/documents`** (replaces `sessionStorage`).
- [WikiSpaceAgentPanel](../frontend/src/components/wiki/WikiSpaceAgentPanel.tsx): **`/api/agent`** create conversation, post message, list messages, **list conversations** (per space), **delete** conversation, **new draft** (no conversation until first send). `sessionStorage` stores active `conversationId` per space. **GFM** rendering ([WikiAgentMessageBody](../frontend/src/components/wiki/WikiAgentMessageBody.tsx): `react-markdown` + `remark-gfm`); **auto-scroll** on new content while streaming. Uses **read-only** wiki tools: `list_wiki_pages`, `get_wiki_page`, `list_linked_channel_documents`. First user message in a new chat can set **title** (server) when still empty.
- **Backend** [app/api/agent.py](../backend/app/api/agent.py) + [app/services/agent/](../backend/app/services/agent/): `langgraph` + `create_react_agent` + [wiki_runner.py](../backend/app/services/agent/wiki_runner.py). LLM from [api_models](../backend/app/models/api_model.py) (`OPENKMS_AGENT_MODEL_ID` or the **default** `llm` model: **Models** in the app → category **LLM** → **Set as default**). Upstream [wiki-skills](https://github.com/kfchou/wiki-skills) is **vendored** at [third-party/wiki-skills/](../third-party/wiki-skills/) (`git subtree`); [vendored_wiki_skills.py](../backend/app/services/agent/vendored_wiki_skills.py) loads `skills/*/SKILL.md` into [build_wiki_space_system_prompt()](../backend/app/services/agent/prompts.py) with an **openKMS mapping** (tools vs on-disk `SCHEMA.md` / `wiki/…`).

## Two services (do not conflate)

| Piece | Role |
|-------|------|
| **qa-agent** | Separate deployable: KB RAG over HTTP to openKMS; LangGraph + optional Langfuse. Unchanged by Wiki Copilot work. |
| **Backend embedded agent** | Same FastAPI process as openKMS: `/api/agent/...`, LangGraph + tools with `AsyncSession` + JWT. Optional Langfuse **not** wired yet. |

## Goals

1. **Wiki space**: **Pages** | **Documents**; documents are **linked** to the space (DB `wiki_space_documents`). Add/remove with **document in user scope** (enforced in API).
2. **Wiki Copilot** (right rail): Aligned with the [wiki-skills](https://github.com/kfchou/wiki-skills) *pattern* (init / ingest / query / lint / update) via system prompt + tools.
3. **Multi-surface**: `agent_conversations.surface` (v1: `wiki_space`); other surfaces (evaluation, FAQ) later.

## Request path (implemented, v1)

```mermaid
sequenceDiagram
  participant U as User
  participant FE as WikiSpaceDetail
  participant API as FastAPI_backend
  participant G as LangGraph_wiki
  participant DB as PostgreSQL
  U->>FE: Send message
  FE->>API: POST /api/agent/conversations/cid/messages
  API->>DB: Store user + load history
  API->>G: create_react_agent.ainvoke
  G->>DB: Read tools query wiki
  API->>DB: Persist assistant message
  API->>FE: user + assistant JSON
```

## Data model (implemented)

| Table | Purpose |
|-------|---------|
| **wiki_space_documents** | `id`, `wiki_space_id`, `document_id`, `created_at`; unique pair; `ON DELETE CASCADE` on space or document. |
| **agent_conversations** | `user_sub` (OIDC/ local JWT `sub`), `surface`, `context` JSONB (`wiki_space_id`), `title?`, timestamps. |
| **agent_messages** | `role` (`user` \| `assistant` \| `tool` reserved), `content`, `tool_calls?` JSONB. (Tool rounds not persisted in v1.) |

## REST API (implemented, v1)

**Wiki–document links**

| Method | Path | Body / notes |
|--------|------|-------------|
| GET | `/api/wiki-spaces/{id}/documents` | `WikiSpaceDocumentListResponse`. |
| POST | `/api/wiki-spaces/{id}/documents` | `{ "document_id" }` |
| DELETE | `/api/wiki-spaces/{id}/documents/{document_id}` | Unlink. |

**Agent**

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/agent/conversations` | `surface: "wiki_space"`, `context: { "wiki_space_id" }` |
| GET | `/api/agent/conversations?wiki_space_id=…&surface=wiki_space&limit=50` | Current user’s conversations for that space, **`updated_at` desc** (1–100). |
| GET | `/api/agent/conversations/{id}` | |
| PATCH | `/api/agent/conversations/{id}` | `{"title": "…"}` (optional; UI may not expose yet). |
| DELETE | `/api/agent/conversations/{id}` | **204**; ownership + scope. |
| GET | `/api/agent/conversations/{id}/messages` | Full list (v1, no offset—OK for small chats). |
| DELETE | `/api/agent/conversations/{id}/messages/from/{message_id}` | Delete this **message and all that follow** (order: `created_at`, `id`). Use to **restart from** a user turn; SPA puts the user text back in the composer. |
| POST | `/api/agent/conversations/{id}/messages` | `{ "content", "stream"?: false }` → JSON `{ message, assistant }`. With `{ "content", "stream": true }` → **`application/x-ndjson`**: one `user` row, then `delta` rows (`t` = text chunk), then `done` (or `error` with the persisted assistant error). |

**Configuration**

- `OPENKMS_AGENT_MODEL_ID` — optional; otherwise the default **`llm`** [api_model](../backend/app/models/api_model.py) (`is_default_in_category` for that category: set on the **Models** page, not under Console).
- `OPENKMS_AGENT_MAX_OUTPUT_TOKENS` — default `65537`; cap on **output** (completion) per model call, sent as `max_tokens` (OpenAI-style; token count, not character length). Kept **moderate by default** so providers/models that reject very large `max_tokens` do not error; raise in `.env` if your model’s output limit is higher. Each ReAct step is a separate call. If replies truncate, set higher (within the model’s true limit) or check the provider.
- `OPENKMS_AGENT_RECURSION_LIMIT` — default `200` (was effectively ~25 in LangGraph if unset in code). The ReAct agent **stops** after this many graph supersteps. Bulk work (e.g. 14× get + 14× upsert) needs a **high** limit or **smaller batches** (3–5 pages per user message) so the UI is not “stuck” with no streamed tokens for a long time while tools run.

## Permissions (implemented, v1)

| Action | Requirement |
|--------|-------------|
| Link / unlink | `wikis:write` + space in scope; document must pass [document scope rules](../backend/app/api/wiki_spaces.py) (same as document list). |
| Agent chat, read tools | `wikis:read` + space in scope. |
| Agent **upsert** (`upsert_wiki_page` tool) | `wikis:write` + space in scope; same transaction as the chat request (commit at end of `POST .../messages`). |
| Read `Document.markdown` in tools | (Future) `documents:read` scope. |

## wiki-skills → openKMS (v1 tools)

| wiki-skills | openKMS (this build) |
|-------------|----------------------|
| wiki-init | *Prompt* (vendored SKILL + mapping); *no* on-disk bootstrap tool. |
| wiki-ingest | Vendored playbook; actual ingest = UI / CLI, not a server tool. |
| wiki-query | Vendored playbook + `list_wiki_pages`, `get_wiki_page` (DB is source of truth) |
| wiki-lint | Vendored playbook + read tools; with **wikis:write**, can **save** a report or fixed page via `upsert_wiki_page` (openKMS path, not a local `wiki/` tree). |
| wiki-update | `upsert_wiki_page` replaces full page body; or UI / CLI. |

**Updating the vendored tree** (from repo root, after adding the subtree once):

`git subtree pull --prefix=third-party/wiki-skills https://github.com/kfchou/wiki-skills.git main --squash`

## LangGraph + Langfuse (status)

- **v1** uses [langgraph.prebuilt.create_react_agent](https://github.com/langchain-ai/langgraph) with `langchain_openai.ChatOpenAI`.
- **Langfuse**: not integrated yet; optional `CallbackHandler` as in backlog.
- **Streaming**: `POST .../messages` with `stream: true` returns **NDJSON**; assistant completion bumps **`updated_at`** for conversation ordering.

## Build backlog (next)

- [x] Alembic + `wiki_space_documents`, `agent_conversations`, `agent_messages`
- [x] Wiki link API; FE
- [x] Agent router + `create_react_agent` + read tools; FE [agentApi.ts](../frontend/src/data/agentApi.ts) + panel
- [ ] Optional: Langfuse env in [config](../backend/app/config.py) + `invoke` hook
- [x] Write tool: `upsert_wiki_page` (gated by `wikis:write`)
- [ ] Read `Document.markdown` in tools (linked channel documents)
- [ ] (Later) `evaluation_dataset` and `kb_faq` **surfaces**; see [development_plan](./development_plan.md)
- [ ] Server-side pagination for `GET .../agent/.../messages` if needed

## Out of scope (later)

- Standalone microservice (same as embedded agent in-process).
- SSE (optional follow-up).
- Merging **qa-agent** into the monolith (still discouraged).
