# Agents (project workspaces)

In-product **Agents** area: personal **projects** with an on-disk workspace (`{OPENKMS_PROJECTS_ROOT}/{project_id}/`), Deep Agents chat, file tree, local git, optional **skills**, and a global skills registry.

| Area | Status |
|------|--------|
| Sidebar + `/agents` (Projects) + `/agents/skills` (Skills) + `/projects/{id}/sessions/{sessionId}` | ✅ |
| Project settings page `/projects/{id}/settings` (General + Agent + Skills + Schedules tabs) | ✅ |
| Session API key (per conversation, creator identity) | ✅ |
| Global skills registry + project install | ✅ |
| Project CRUD + files API | ✅ |
| Conversations + NDJSON stream | ✅ |
| Plan mode toggle | ✅ |
| HITL resume endpoint | ✅ |
| Subagents (explore = workspace files; research = web + skills) | ✅ |
| Local git | ✅ |
| Remote git (HTTPS + PAT) | ✅ |

## Layout

- **Agents area:** **Projects | Skills** tabs at `/agents` and `/agents/skills`.
- **Left:** conversation sessions (month-grouped), like KB Q&A.
- **Center:** chat thread + collapsible **Plan** checklist (from `write_todos`, dismissible) + plan toggle + composer. Assistant replies interleave text with compact **tool** and **subagent** rows (click a row to expand input/output); history reloads tool rows from persisted transcripts. Composer ignores Enter while an IME composition is active (same as wiki Copilot). **Revert** (under a user bubble): removes that message and all later turns, clears LangGraph checkpoint state for the session, and puts the user text back in the composer to edit and resend.
- **Right:** file tree + preview split; git actions in the files rail. Drag pane dividers to resize; widths persist in `localStorage`. **Upload** menu: pick multiple files or a folder. Refresh, parent-folder navigation, and per-row delete (`.openkms` and `.openkms/skills` folders protected; other paths including files under `.openkms/` may be deleted).

## Session API key

Each project **conversation** (session) gets a dedicated personal API key (`purpose=agent_session`) owned by the session creator (`user_sub`). The plaintext token is stored encrypted in `agent_conversations.context` and injected into the agent shell as:

- `OPENKMS_API_KEY`
- `OPENKMS_API_BASE_URL`

Installed **skills** (e.g. openkms) use this key when run via shell `execute`. Keys are revoked when the session is deleted. They do not appear in **Settings → API keys**.

Run skill CLIs from the project root: `python .openkms/skills/<skill_id>/scripts/cli.py …` — no `cd`, no `pip install` (dependencies install with the skill).

## Human-in-the-loop (HITL)

HITL is optional per tool name in `hitl.py` (currently none). The interrupt bar supports batched **Approve all (N)** when enabled. Resume streams into the current assistant turn.

LangGraph **checkpoints** (HITL resume) use Postgres tables `checkpoints`, `checkpoint_blobs`, `checkpoint_writes` with **`thread_id` = conversation id**. The backend checkpointer uses a **connection pool** so concurrent turns (and revert-then-resend) do not share one psycopg connection. Revert deletes checkpoint rows on the same SQLAlchemy transaction as message deletes (`DELETE …/messages/from/{id}`).

## Skills

| Layer | Location |
|-------|----------|
| **Registry** (global) | `{OPENKMS_AGENT_SKILLS_ROOT}/{skill_id}/{version}/` + DB tables `agent_skills`, `agent_skill_versions` |
| **Installed** (per project) | `{project_id}/.openkms/skills/{skill_id}/` + `projects.settings.installed_skills` |

- Upload zip or folder on **Agents → Skills** (`POST /api/agent-skills`). Each version stores a **content hash** (per-file SHA-256, sorted, aggregated).
- **Skill settings** (`/agents/skills/{skill_id}/settings`): general metadata and version upload/delete (same layout as channel settings).
- Set **default version** per skill (used when installing without picking a version).
- Toggle **install on new projects** in skill settings (`is_default`); matching skills auto-install when creating a project.
- **Project settings → Skills:** install/update/uninstall skills from the registry.

## Scheduled agent runs

- **Project settings → Schedules:** create cron jobs that send a fixed **prompt** to the project agent.
- **Stateless:** new chat session each run; optional **delete session** after completion.
- **Stateful:** reuses one existing session (`conversation_id`); keeps context between runs.
- **Not supported:** plan mode.
- **Unattended:** HITL is disabled; tool approvals are auto-approved. Context is compacted before each run when over the model budget (same rules as in-turn summarization).
- Auth uses a **session API key** minted for the schedule owner (`owner_sub` + optional realm roles in `config`).
- All rows appear in **Job runs → Schedules** (`/job-runs/schedules`); worker task **`run_scheduled_project_agent`**.

## Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `OPENKMS_PROJECTS_ROOT` | `data/projects` (local) / `/data/projects` (Docker) | One folder per project UUID |
| `OPENKMS_AGENT_SKILLS_ROOT` | `data/agent-skills` | Global skills registry |
| `OPENKMS_DEEP_AGENT_MODEL_ID` | — | Falls back to `OPENKMS_AGENT_MODEL_ID` |
| `OPENKMS_AGENT_SANDBOX_TIMEOUT_SECONDS` | `60` | Python sandbox in project dir |
| `OPENKMS_AGENT_LOG_LEVEL` | `INFO` | Project agent turn logs (`agent_turn_start` / `agent_turn_done` at INFO; **`agent_turn_failed` at ERROR**). Use `DEBUG` for verbose deep-agents detail. |
| `OPENKMS_BACKEND_LOG_LEVEL` | — | Root log level for all `app.*` loggers when set (default INFO). |

### Observability (without Langfuse)

Interactive agent turns run in the **backend** container; scheduled cron runs run in the **worker** container. Tail both:

```bash
docker compose -f docker/docker-compose.yml logs -f backend worker
```

Filter failed turns (visible at default `OPENKMS_AGENT_LOG_LEVEL=INFO`):

```bash
docker compose -f docker/docker-compose.yml logs -f backend 2>&1 | rg 'ERROR.*agent_turn'
```

Each turn logs grep-friendly fields: `turn_id`, `project_id`, `conversation_id`, `duration_ms`, and on failure `error=…`. Scheduled run failures also appear in **Job runs → detail** (`worker_log`).

The latest turn summary is stored on the conversation as **`context.last_turn`** (`turn_id`, `status`, `error`, `duration_ms`, `tool_count`) — visible via `GET …/conversations/{id}` for debugging. Failed stream turns also persist an assistant message in the thread and emit an NDJSON **`error`** line (`detail` + persisted `message`) before the stream closes.

**Langfuse (optional):** Same variables as [qa-agent](../features/knowledge-bases.md): **`LANGFUSE_SECRET_KEY`**, **`LANGFUSE_PUBLIC_KEY`**, and **`LANGFUSE_BASE_URL`** must all be set or tracing is off. Pass optional **`session_id`** on `POST …/messages` to group turns in one Langfuse **Session** (defaults to conversation id). Tags: `deep-agent`, `project-stream` \| `project-sync`, and `plan-mode` when applicable. **`LANGFUSE_HEALTHCHECK`** (default true) probes the host before callbacks; **`LANGFUSE_TRACE_STREAMING`** (default true) controls streaming turns.

**Project search:** In **Agent** settings, enable **web search** and pick a **`search_tool`** connector. Stored as `web_search` and `search_connector_id` in `projects.settings`.

Docker: `projects_data` volume on `backend` and `worker` (include `agent-skills` under the same volume or a sibling mount).

### Troubleshooting

| Symptom | Likely cause | What to check |
|---------|----------------|---------------|
| Toast **network error** / fetch failed after ~5 min pending | **Proxy read timeout** while the agent is still running but not streaming bytes (long tool/LLM gap). Stack: browser → **host nginx** → Docker frontend nginx (`proxy_read_timeout` **300s** in `docker/nginx-frontend.conf`) → backend. | Raise **`proxy_read_timeout`** (and **`proxy_send_timeout`**) on **both** nginx layers for `location /api/`; tail host `/var/log/nginx/error.log` for `upstream timed out`. |
| **`agent_turn_failed`** in backend logs with LLM/tool text; error line in chat after refresh | In-app failure (misconfigured model, recursion limit, tool error). HTTP **200** + NDJSON **`error`**. | `docker compose logs -f backend 2>&1 \| rg 'ERROR.*agent_turn'`; conversation **`context.last_turn`**. |
| **`another command is already in progress`** (psycopg) on revert + resend | Fixed: checkpointer now uses **`AsyncConnectionPool`**. Redeploy backend if still seen on an old image. | Ensure no overlapping streams on the same session (wait for revert toast before resend). |
| Empty chat after reload, toast on load | **`GET …/messages`** failed (auth/network). | Browser network tab; backend access log. |

Local dev (**`./dev.sh`**, Vite **5173**) has no nginx; long-turn timeouts are uncommon unless a host reverse proxy sits in front.

## Project folder

```
{project_id}/
  AGENTS.md
  .gitignore           # ignores .openkms/skills/, conversation_history/, large_tool_results/
  .openkms/skills/     # installed skills (e.g. openkms/)
  .git/                # optional
```

Runtime settings (web search, git identity, `installed_skills`) live in **`projects.settings`** (PostgreSQL).

The project agent system prompt includes the project name, slug, description, workspace scope (paths relative to project root), installed skills under `.openkms/skills/`, and the contents of `AGENTS.md`. SkillsMiddleware loads `SKILL.md` from each installed skill (parent source path `.openkms/skills/`).

## Permissions

- `projects:read` — list projects/skills, read files, chat read
- `projects:write` — create/update projects, upload skills, agent messages, git, install skills

Feature toggle: **`agents`** (Console → Feature toggles).

## Git

- **Local:** init, status, log, add, commit via files rail; agent uses shell (`execute`) for git in the project folder.
- **Remote:** HTTPS + PAT only; credentials in Profile → Git credentials. Clone / pull / push APIs on `/api/projects/{id}/git/*`.

See [API reference — Projects](api-reference.md#projects-agents-workspace) and [API reference — Agent skills](api-reference.md#agent-skills-global-registry).
