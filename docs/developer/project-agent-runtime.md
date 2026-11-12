# Project agent runtime

Runtime, deployment, and configuration details for **Agent Projects** (Deep Agents workspaces). For product
behavior, layout, sessions, skills, and scheduled runs, see [Agents](../features/openkms-agents.md).

## Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `OPENKMS_PROJECTS_ROOT` | `data/projects` (local) / `/data/projects` (Docker) | One folder per project UUID |
| `OPENKMS_AGENT_SKILLS_ROOT` | `data/agent-skills` | Global skills registry |
| `OPENKMS_DEEP_AGENT_MODEL_ID` | — | Falls back to `OPENKMS_AGENT_MODEL_ID` |
| `OPENKMS_AGENT_LLM_EXTRA_BODY` | unset | Deep Agents façade (`deep_agents/llm_chat.py`); **`enable_thinking`** always forced **false** |
| `OPENKMS_AGENT_LLM_REASONING_CONTENT_SHIM` | unset (**auto**) | Same façade: inject empty **`reasoning_content`** on assistant rows for non-`api.openai.com` bases |
| `OPENKMS_AGENT_SANDBOX_TIMEOUT_SECONDS` | `60` | Python sandbox in project dir |
| `OPENKMS_AGENT_DENIED_COMMANDS` | built-in list | Comma-separated host-control binaries the project agent shell may not run (`docker`, `docker-compose`, `kubectl`, `podman`, `systemctl`, `launchctl`, `service`, `iptables`, `mount`, `shutdown`, `reboot`, `lsof`, `ps`). Unset = defaults; **empty string disables** the check for local development. |
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

The latest turn summary is stored on the conversation as **`context.last_turn`** (`turn_id`, `status`, `error`, `duration_ms`, `tool_count`, optional `assistant_message_id`, optional `interrupt` when `status=interrupted`) — visible via `GET …/conversations/{id}` for debugging. Interactive stream turns commit the user message and an empty assistant row **before** the agent loop (`status=running`), then throttle-update the assistant row (about every 2s and on tool events) while the model runs. Persisted `tool_calls` include **`wiki_tool_traces_v1`** (model replay) and **`wiki_assistant_stream_parts_v1`** (interleaved text + tool order for the chat UI after reload). Older assistant rows that only have traces (no stream parts) cannot recover mid-turn order; the SPA falls back to **text then folded tools**. The agent loop itself runs in a **background task** detached from the browser connection: leaving the page or the machine sleeping cancels only the NDJSON stream, not the turn. Reopening the session polls while `last_turn.status` is `running` (and not stale — same ~2h window as the API / `STALE_RUNNING_SECONDS`) and reloads messages until the turn leaves `running`. **Switching to another session** aborts the browser’s NDJSON reader (frees the composer on the other session) while the server turn continues; returning to the session attaches via poll / mid-turn DB rows. Failed stream turns persist an assistant message in the thread and emit an NDJSON **`error`** line (`detail` + persisted `message`) when the client is still connected. `GET …/messages?tail=true` returns the last page in one request. Deleting a session clears the LangGraph checkpoint thread and is refused while a non-stale turn is `running`.

**Langfuse (optional):** Same variables as [qa-agent](../features/knowledge-bases.md): **`LANGFUSE_SECRET_KEY`**, **`LANGFUSE_PUBLIC_KEY`**, and **`LANGFUSE_BASE_URL`** must all be set or tracing is off. Pass optional **`session_id`** on `POST …/messages` to group turns in one Langfuse **Session** (defaults to conversation id). Tags: `deep-agent`, `project-stream` \| `project-sync`, and `plan-mode` when applicable. **`LANGFUSE_HEALTHCHECK`** (default true) probes the host before callbacks; **`LANGFUSE_TRACE_STREAMING`** (default true) controls streaming turns.

**Project search:** In **Agent** settings, enable **web search** and pick a **`search_tool`** connector. Stored as `web_search` and `search_connector_id` in `projects.settings`.

Docker: `projects_data` volume on `backend` and `worker` (include `agent-skills` under the same volume or a sibling mount).

### Troubleshooting

| Symptom | Likely cause | What to check |
|---------|----------------|---------------|
| Toast **network error** / fetch failed after ~5 min pending | **Proxy read timeout** while the agent is still running but not streaming bytes (long tool/LLM gap). Stack: browser → **host nginx** → Docker frontend nginx (`proxy_read_timeout` **300s** in `docker/nginx-frontend.conf`) → backend. Turn usually **keeps running** server-side; reopen the session to see progress / final reply. | Raise **`proxy_read_timeout`** (and **`proxy_send_timeout`**) on **both** nginx layers for `location /api/`; tail host `/var/log/nginx/error.log` for `upstream timed out`; check **`context.last_turn`**. |
| Empty chat after leave/sleep (pre-fix) | Stream was bound to the HTTP request: disconnect cancelled the turn and rolled back the uncommitted messages. | Fixed: early commit + background turn + poll on reopen. Redeploy backend/frontend if still seen on an old build. |
| Mid-turn UI frozen after fast session switch | Older SPA builds could drop the live NDJSON bridge without re-attaching poll. | Current SPA aborts NDJSON on leave, marks `running` optimistically, and polls when the session is visible again. Hard-refresh if on an old bundle. |
| **`409` A turn is already running** | Another interactive turn for the session has `last_turn.status=running` (or a stale one under ~2h). | Wait / reopen session; if the API process died mid-turn, wait for stale timeout or inspect `last_turn`. |
| **`agent_turn_failed`** in backend logs with LLM/tool text; error line in chat after refresh | In-app failure (misconfigured model, tool error, or a turn that exhausted its step budget even after one continuation). HTTP **200** + NDJSON **`error`**. | `docker compose logs -f backend 2>&1 \| rg 'ERROR.*agent_turn'`; conversation **`context.last_turn`**. |
| **`Recursion limit exceeded`** after a long research turn | The turn spent `OPENKMS_AGENT_RECURSION_LIMIT` supersteps (**~90 tool calls** at the default 200). Each tool round costs about two steps. | Warning at 75% and one automatic +60-step continuation are built in. If it still happens, the model ignored the budget warning — **send another message to continue from the saved thread** (all tool results are kept), or raise the limit. `rg 'agent_budget_warning\|recursion_continuing'` shows which path ran. |
| 400 **`reasoning_content` … must be passed back** (DeepSeek thinking) | Thinking mode on + tools; history missing **`reasoning_content`**. Deep Agents disables thinking + shims via **`deep_agents/llm_chat.py`**. | Redeploy backend; or set **`OPENKMS_AGENT_LLM_REASONING_CONTENT_SHIM=true`**. |
| **`another command is already in progress`** (psycopg) on revert + resend | Fixed: checkpointer now uses **`AsyncConnectionPool`**. Redeploy backend if still seen on an old image. | Ensure no overlapping streams on the same session (wait for revert toast before resend). |
| Empty chat after reload, toast on load | **`GET …/messages`** failed (auth/network). | Browser network tab; backend access log. |

Local dev (**`./dev.sh`**, Vite **5173**) has no nginx; long-turn timeouts are uncommon unless a host reverse proxy sits in front.

### Runtime (Deep Agents)

Workspace chat uses **deepagents ≥0.7.21**. The Plan checklist UI depends on `write_todos`, so the workspace factory opts in with LangChain **`TodoListMiddleware`** (opt-in since deepagents 0.7). Plan mode is hard read-only by replacing `FilesystemMiddleware` with a tools allowlist (`ls` / `read_file` / `glob` / `grep` only) — deepagents 0.7 does not support `FilesystemPermission` together with a shell-capable backend. Explore always uses that read-only filesystem stack; research uses it in plan mode.

#### Step budget

`OPENKMS_AGENT_RECURSION_LIMIT` (default **200**) caps LangGraph supersteps per turn. A tool round costs about **two** supersteps (one model call, one tool node), so 200 is roughly **90 tool calls** — reachable by an ordinary research turn. Two mechanisms keep a turn from ending on a raw limit string:

- **Warning before the wall** — `deep_agents/budget.py` subclasses the existing `TodoListMiddleware` and, at **75%** of the budget (minus 8 turns of headroom), injects one `SystemMessage` telling the model to stop exploring and answer, delegating any remaining research to `task`. It deliberately reuses the `after_model` hook instead of adding a middleware: **every extra middleware installs its own graph node and costs one superstep per turn**, which would work against the budget it protects (measured: same step count as the plain todo middleware).
- **One continuation** — if the turn still hits the limit, `runner._stream_parts_with_continuation` resumes from the checkpoint with **+60** steps and a nudge not to repeat finished calls. The checkpoint survives `GraphRecursionError`, so no tool results are lost; only one continuation is allowed, then the error is reported normally. Scheduled (non-streaming) turns do the same in `run_project_turn`.

**Delegation is the structural lever:** a subagent runs on its own budget, so work delegated via `task` does not consume the parent conversation's steps (verified: a parent with `recursion_limit=15` let a subagent run 30 tool calls). The system prompt directs search-heavy research to the `research` subagent, tells the model not to retry a failing command with a bigger timeout more than once, and to wrap up when the budget warning appears.

When a turn *does* exhaust everything, the error is reported as `Recursion limit exceeded (…)` with no raw stack detail, the persisted assistant row keeps all tool traces, and **sending another message continues from the saved thread** rather than starting over.

#### Shell boundary

`execute` runs `Popen(shell=True)` as the backend process's own user, outside the project directory and without OS isolation — it is what makes real Python, git and the skill CLIs work. `virtual_mode` only constrains **file paths**, never shell commands. `deep_agents/command_policy.py` therefore denies a configurable list of **host-control binaries** (`OPENKMS_AGENT_DENIED_COMMANDS`), and the system prompt states the boundary so the model does not go looking for it.

Matching is **by command position**, so `cd docker && ls`, `rg docker backend/` and `echo 'docker ps'` stay allowed while `docker ps`, `sudo -n docker ps` and `sh -c 'docker ps'` are refused. A refusal returns a normal tool result (`exit_code: 126` + explanation) instead of raising, so the model can adapt rather than the turn failing.

This is a **guard rail, not a sandbox**: it stops the model from wandering into host inspection, but a deliberate escape (`python -c "import subprocess; subprocess.run(['docker','ps'])"`) still gets through. Real isolation needs a container or VM around the shell. Note that in Docker deployments the binaries are absent anyway (no `docker` CLI, no `/var/run/docker.sock`, no kubeconfig in the container) — the local `./dev.sh` setup is the exposed case, since the shell runs directly on the host.

### Implementation layout

| Module | Role |
|--------|------|
| `deep_agents/factory.py` | Build workspace and improvement Deep Agents |
| `deep_agents/turn_prepare.py` | Pre-turn compaction + checkpoint-first message input |
| `deep_agents/llm_chat.py` | ChatOpenAI + thinking / `reasoning_content` shim |
| `agent/tool_transcripts.py` | Persisted tool traces for UI replay (`wiki_tool_traces_v1`) |
| `deep_agents/constants.py` | `STALE_RUNNING_SECONDS` (sync with frontend) |

Remaining gaps: [Tech debt — Project agents](../tech_debt.md#project-agents-deep-agents).

