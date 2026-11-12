# Agents (project workspaces)

In-product **Agents** area: personal **projects** with an on-disk workspace (`{OPENKMS_PROJECTS_ROOT}/{project_id}/`), Deep Agents chat, file tree, local git, optional **skills**, and a global skills registry.

| Area | Status |
|------|--------|
| Sidebar + `/agents` (Projects) + `/agents/skills` (Skills) + `/projects/{id}/sessions/{sessionId}` | ✅ |
| Project settings page `/projects/{id}/settings` (General includes git origin and delete project; Agent + Skills + Schedules + Sharing) | ✅ |
| Session API key (per conversation, creator identity) | ✅ |
| Global skills registry + project install | ✅ |
| Project CRUD + files API | ✅ |
| Conversations + NDJSON stream | ✅ |
| Plan mode toggle | ✅ |
| HITL resume endpoint | ✅ |
| Subagents (explore = workspace files; research = web + skills) | ✅ |
| Local git | ✅ |
| Remote git (HTTPS + PAT) | ✅ |
| Console Kubernetes cluster browse + apply/logs + register Service in Chamber | ✅ |
| Project deploy secrets (encrypted → sync Opaque Secret; Agent sees names/keys only) | ✅ |
| Deploy via openkms skill (`kubernetes apply` / `register-app` / `dev-sync`) | ✅ (API key needs `console:kubernetes`; register-app also `ontology:write`; dev-sync also `projects:write`) |

Console operators can register clusters under `/console/kubernetes` (`console:kubernetes`); see [Kubernetes clusters](kubernetes-clusters.md). **Project settings → Deploy** stores encrypted secrets and syncs them to the cluster; agents only reference Secret names. Workspace shell still runs in the backend/worker process. Operators can apply YAML in the cluster detail page; Agents use the **openkms skill** (`kubernetes apply`, `kubernetes register-app`, `kubernetes dev-sync`) — kubeconfig is never injected into the workspace. Dev-sync packs project files server-side into a Pod for hot iteration (see [Dev sync](kubernetes-clusters.md#dev-sync)).

## Home default project

Signed-in **Home** (`/`) can ask from a composer when Agents is enabled: a large “What can I do for you?” heading, one input, and the default project carried quietly in the helper text (`Enter to start a new chat in <project>`) — no separate project chip or “Change default” link. The user picks one **default Agent Project** (stored as `user_preferences.default_agent_project_id`, exposed on `GET /api/auth/me` and `GET /api/home/hub` as `default_agent_project`). With no default, Home shows a Quick start card that opens **Agent Projects** in “choose default” mode. Submitting the composer creates a **new** conversation and opens `/projects/{id}/sessions/{sessionId}` with the first message handed off to the workspace stream.

**Agent Projects** marks the current Home default with a **Home default** badge (accent border on the card); other cards show a home icon to adopt it. **Project settings → General** has a **Use as Home default** checkbox that sets or clears the same preference, so users don't need to leave the project to change it.

## Layout

- **Agents area:** **Projects | Skills** tabs at `/agents` and `/agents/skills`. **Project settings → General** has a danger-zone **Delete project** (workspace files, sessions, and schedules).
- **Desktop (≥769px):** three columns — **left** conversation sessions (like KB Q&A; a small running indicator when `last_turn.status=running`); **center** chat thread + collapsible **Plan** checklist (from `write_todos`, dismissible) + plan toggle + composer; **right** file tree + preview split with git actions. Drag pane dividers to resize; widths persist in `localStorage`. Opening **Markdown** (`.md` / `.markdown`) or **HTML** (`.html` / `.htm`) defaults to a rendered **Preview** (Markdown uses the same `RichMarkdown` + code/Mermaid `pre` component and `.document-detail-markdown-body` typography as document detail; `[[target]]` / `[[target|label]]` uses the wiki preprocess and opens another file in this project workspace, relative to the current file — bare names without an extension resolve to `.md`; HTML in a sandboxed iframe); toggle **Source** for the line-numbered raw view. Other text files stay Source-only. The viewer's **Download** action saves the current file, including binaries. Assistant replies interleave text with compact **tool** and **subagent** rows (click a row to expand input/output); **completed** turns fold consecutive tool/subagent rows (≥2) into a single summary; the **live** turn stays expanded. History reloads tool rows from persisted transcripts. Message history is **paged** (tail first; scroll up loads older). Composer ignores Enter while an IME composition is active. **Revert** (under a user bubble): removes that message and all later turns, clears LangGraph checkpoint state for the session, and puts the user text back in the composer to edit and resend — refused while a non-stale turn is `running`. **Upload** menu: pick multiple files or a folder. Refresh, parent-folder navigation, and per-row delete (`.openkms` and `.openkms/skills` folders protected; other paths including files under `.openkms/` may be deleted).
- **Shell:** the app header is hidden (`openkms-agents-fullpage`), so the global left rail carries the brand → Home (top) and the account menu (bottom) — see [Immersive views](../developer/design-system.md#immersive-views-header-hidden).
- **Phone (≤768px):** chat is the primary full-height surface with a compact top bar (back, session title, Sessions / Files / Settings). Sessions and Files each open as a **full-width** panel (same idea as Documents channel list on phone). Opening a file in Files shows the viewer full-height (tree hidden until closed). Session Review uses **Lessons | Improve | Artifacts** tabs instead of three columns. App header stays hidden (`openkms-agents-fullpage`) — navigation is via the in-workspace chrome.

## Session API key

Each project **conversation** (session) gets a dedicated personal API key (`purpose=agent_session`) owned by the session creator (`user_sub`). The plaintext token is stored encrypted in `agent_conversations.context` and injected into the agent shell as:

- `OPENKMS_API_KEY`
- `OPENKMS_API_BASE_URL`

Installed **skills** (e.g. openkms) use this key when run via shell `execute`. Keys are revoked when the session is deleted. They do not appear in **Settings → API keys**.

Run skill CLIs from the project root: `python .openkms/skills/<skill_id>/scripts/cli.py …` — no `cd`, no `pip install` (dependencies install with the skill).

## Human-in-the-loop (HITL)

HITL is optional per tool name in `hitl.py` (currently none). The interrupt bar supports batched **Approve all (N)** when enabled. Resume streams into the current assistant turn.

When the agent pauses for approval, the turn is persisted as **`context.last_turn.status=interrupted`** with the interrupt payload in **`context.last_turn.interrupt`** (merged `action_requests` when multiple). Leaving the page or sleeping does not lose Approve/Reject: reopening the session restores the bar from `last_turn`. Resume / completion clears the stored interrupt.

### Context compaction (long sessions)

Deep Agents compacts older turns when the model context budget is exceeded. Evicted history is offloaded to `conversation_history/` in the project workspace; the agent keeps working from a structured internal summary. **Compaction summaries are not shown in chat** (they are filtered from the stream and stripped before persistence). In a single long turn with many tool calls, compaction may run more than once as context grows — that is normal and stays internal.

**Before each workspace turn** (interactive chat and scheduled runs), the backend may run the same pre-turn compaction step when the LangGraph checkpoint is over budget (`deep_agents/turn_prepare.py`). In-turn compaction inside Deep Agents still applies during long tool loops.

### Checkpoint-first context (agent memory vs chat UI)

| Layer | Role |
|-------|------|
| **`agent_messages` (Postgres)** | What users see in the thread — user/assistant text and persisted tool trace pills for the UI |
| **LangGraph checkpoint (`thread_id` = conversation id)** | What the agent uses on the next turn — full tool messages, subagent state, compaction events |

On **revert**, checkpoint rows are deleted with the truncated messages so the next turn re-seeds from DB. On **normal follow-up turns**, only the **latest user message** is appended to the checkpoint thread (tool outputs are not re-injected from `agent_messages`, avoiding duplicate tokens). HITL **resume** continues from the interrupted checkpoint via `Command(resume=…)` without re-sending DB history.

LangGraph **checkpoints** use Postgres tables `checkpoints`, `checkpoint_blobs`, `checkpoint_writes` with **`thread_id` = conversation id**. The backend checkpointer uses a **connection pool** so concurrent turns (and revert-then-resend) do not share one psycopg connection. Revert deletes checkpoint rows on the same SQLAlchemy transaction as message deletes (`DELETE …/messages/from/{id}`).

### Image input (multimodal turns)

Attach images in the composer — **paste**, **drag & drop**, or the **paperclip** button (PNG / JPEG / WebP / GIF, max 8 MB). Chips preview above the input; send with or without text.

- **Storage:** object storage under **`agent-attachments/{conversation_id}/`** — deliberately **not** the project workspace, so `git status`, remotes, and the agent's file tools never see chat images. Uploads go to `POST …/conversations/{id}/attachments`.
- **Persistence:** `agent_messages.attachments` holds descriptors only (`id`, `name`, `mime`, `size`); the image bytes stay in object storage and are inlined as the turn is built.
- **Turn input:** `deep_agents/turn_input.py` builds `HumanMessage` content blocks (`text` + `image_url` with a base64 data URI) for both the checkpoint-first append and the DB seed path, so replayed and reverted threads keep their images. Images then live in the checkpoint and are re-sent each turn until compaction offloads them (`_aoffload_inline_media`).
- **Cleanup:** removing a staged chip deletes its object; posting a message sweeps older unreferenced uploads; deleting a conversation or reverting/truncating messages removes the matching objects. Deleting a conversation purges its whole prefix.
- **Model support:** needs an image-capable model (deepseek-flash, `vision` capability in Models). Deep Agents replaces content blocks the active model profile rejects, so a text-only model degrades instead of failing.
- **Discard:** `DELETE …/conversations/{id}/attachments/{attachment_id}?mime=…` removes a staged image (refused with `409` once a message references it).

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
- **Unattended:** HITL is disabled; tool approvals are auto-approved. Context is compacted before each run when over the model budget (same pre-turn step as interactive chat; see **Context compaction** above).
- Auth uses a **session API key** minted for the schedule owner (`owner_sub` + optional realm roles in `config`).
- All rows appear in **Job runs → Schedules** (`/job-runs/schedules`); worker task **`run_scheduled_project_agent`**.

## Runtime and configuration

Environment variables, scheduled runs, Deep Agents runtime, observability, troubleshooting, and implementation
layout are documented in [Project agent runtime](../developer/project-agent-runtime.md).

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
- `projects:write` — create/update/delete projects, upload skills, agent messages, git, install skills

Feature toggle: **`agents`** (Console → Feature toggles).

## Files rail

The workspace is a rail on the right of the chat, and **it can be collapsed**: the head's rightmost
button hides it and the **Files** chip in the chat's top-right brings it back. Both the folded state
and the drag width are remembered per browser. On a phone the rail is a full-screen sheet opened
from the toolbar, closed by the same head button.

The head — title row, icon buttons, **All files** chip, resize handle — is the KB conversation's
files rail too; see [design system](../developer/design-system.md#shared-layout-scss-frontendsrcstyles).

## Git

- **Local:** init, status, log, add, commit via the files rail. The git branch button opens a **Source Control** view modelled on VS Code: branch pill with `ahead`/`behind` and pull/push, a commit message box at the top (primary **Commit** for what is staged, with a **Commit All** / **Commit & Push** dropdown), **Staged Changes** and **Changes** groups with per-file stage / unstage / discard, a unified **diff** in the viewer pane (untracked files show as whole-file additions), and a commit list with ref badges. Toggle back to the file tree with the same button or **All files**. Agent shell (`execute`) can still run git in the project folder.
- **Remote:** HTTPS + PAT only; credentials in Profile → Git credentials. On **create project**, optional repository URL, branch, and credential clone into the workspace. **Project settings → General** shows the live `origin` URL and current branch, lets you change origin (GitHub → GitLab and similar), and pull/push with a saved credential. Clone / pull / push APIs on `/api/projects/{id}/git/*`. Saving origin initializes git if needed and stores `settings.git.remote_url` (and optional `credential_id`).

See [API reference — Projects](../developer/api-reference.md#projects-agents-workspace) and [API reference — Agent skills](../developer/api-reference.md#agent-skills-global-registry).
