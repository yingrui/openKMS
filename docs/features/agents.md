# Agents (project workspaces)

In-product **Agents** area: personal **projects** with an on-disk workspace (`{OPENKMS_PROJECTS_ROOT}/{project_id}/`), Deep Agents chat, file tree, local git, and optional openKMS research tools.

| Area | Status |
|------|--------|
| Sidebar + `/agents` | ✅ |
| Project CRUD + files API | ✅ |
| Conversations + NDJSON stream | ✅ |
| Plan mode toggle | ✅ |
| HITL resume endpoint | ✅ |
| Subagents (explore, research, shell) | ✅ |
| Local git | ✅ |
| Remote git (HTTPS + PAT) | ✅ |
| Skills / settings JSON UI | ✅ |

## Layout

- **Left:** conversation sessions (month-grouped), like KB Q&A.
- **Center:** chat thread + plan toggle + composer.
- **Right:** file tree + preview split; git actions in the files rail.

## Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `OPENKMS_PROJECTS_ROOT` | `data/projects` (local) / `/data/projects` (Docker) | One folder per project UUID |
| `OPENKMS_DEEP_AGENT_MODEL_ID` | — | Falls back to `OPENKMS_AGENT_MODEL_ID` |
| `OPENKMS_AGENT_WEB_SEARCH_ENABLED` | `false` | Optional Tavily-style search |
| `OPENKMS_AGENT_SANDBOX_TIMEOUT_SECONDS` | `60` | Python sandbox in project dir |

Docker: `projects_data` volume mounted on `backend` and `worker`.

## Project folder

```
{project_id}/
  AGENTS.md
  .openkms/config.json
  .openkms/skills/
  .git/          # optional
```

## Permissions

- `projects:read` — list projects, read files, chat read
- `projects:write` — create/update projects, upload, agent messages, git

Feature toggle: **`agents`** (Console → Feature toggles).

## Git

- **Local:** init, status, log, add, commit (UI + agent tools).
- **Remote:** HTTPS + PAT only; credentials in Profile → Git credentials (encrypted in DB, ephemeral `GIT_ASKPASS`). Clone / pull / push APIs on `/api/projects/{id}/git/*`.

See [API reference — Projects](api-reference.md#projects).
