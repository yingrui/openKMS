# Agents (project workspaces)

In-product **Agents** area: personal **projects** with an on-disk workspace (`{OPENKMS_PROJECTS_ROOT}/{project_id}/`), Deep Agents chat, file tree, local git, optional **skills**, and a global skills registry.

| Area | Status |
|------|--------|
| Sidebar + `/agents` (Projects) + `/agents/skills` (Skills) + `/projects/{id}/sessions/{sessionId}` | ✅ |
| Project settings page `/projects/{id}/settings` (General + Agent + Skills tabs) | ✅ |
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
- **Center:** chat thread + plan toggle + composer. Assistant replies interleave text with compact **tool** and **subagent** rows (click a row to expand input/output); history reloads tool rows from persisted transcripts. Composer ignores Enter while an IME composition is active (same as wiki Copilot).
- **Right:** file tree + preview split; git actions in the files rail. Drag pane dividers to resize; widths persist in `localStorage`. **Upload** menu: pick multiple files or a folder. Refresh, parent-folder navigation, and per-row delete (`.openkms` and `.openkms/skills` folders protected; other paths including files under `.openkms/` may be deleted).

## Session API key

Each project **conversation** (session) gets a dedicated personal API key (`purpose=agent_session`) owned by the session creator (`user_sub`). The plaintext token is stored encrypted in `agent_conversations.context` and injected into the agent shell as:

- `OPENKMS_API_KEY`
- `OPENKMS_API_BASE_URL`

Installed **skills** (e.g. openkms) use this key when run via shell `execute`. Keys are revoked when the session is deleted. They do not appear in **Settings → API keys**.

Run skill CLIs from the project root: `python .openkms/skills/<skill_id>/scripts/cli.py …` — no `cd`, no `pip install` (dependencies install with the skill).

## Human-in-the-loop (HITL)

HITL is optional per tool name in `hitl.py` (currently none). The interrupt bar supports batched **Approve all (N)** when enabled. Resume streams into the current assistant turn.

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

## Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `OPENKMS_PROJECTS_ROOT` | `data/projects` (local) / `/data/projects` (Docker) | One folder per project UUID |
| `OPENKMS_AGENT_SKILLS_ROOT` | `data/agent-skills` | Global skills registry |
| `OPENKMS_DEEP_AGENT_MODEL_ID` | — | Falls back to `OPENKMS_AGENT_MODEL_ID` |
| `OPENKMS_AGENT_SANDBOX_TIMEOUT_SECONDS` | `60` | Python sandbox in project dir |

**Project search:** In **Agent** settings, enable **web search** and pick a **`search_tool`** connector. Stored as `web_search` and `search_connector_id` in `projects.settings`.

Docker: `projects_data` volume on `backend` and `worker` (include `agent-skills` under the same volume or a sibling mount).

## Project folder

```
{project_id}/
  AGENTS.md
  .gitignore           # ignores .openkms/skills/ (installed skills)
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
