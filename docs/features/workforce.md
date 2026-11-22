# Workforce agents

A workforce agent (数字员工) is a Q&A service that answers from one or more knowledge bases on behalf of
callers outside openKMS. It is the split the platform needed: a **knowledge base says what is known**, an
**agent says how that knowledge answers for this service**.

Access is **`knowledge_bases:read`** / **`knowledge_bases:write`** — the same keys that gate knowledge
bases, because an agent is a published view of them.

| Feature | Status | Description |
|---------|--------|-------------|
| SPA i18n | ✅ | List + detail use the **`workforce`** namespace (`frontend/src/i18n/locales/{en,zh-CN}/workforce.json`); app name and tagline live in **`layout`** |
| Agent management | ✅ | CRUD via `/api/workforce/agents`; list offers **Cards / List** (the knowledge base pair: cards for a handful at a glance, the table for name, sources, skills, credentials, with the choice stored in localStorage), detail is an `EntityViewShell` page **with routed tabs** — Profile, Model, Skills, Tools, Behavior, Credentials — the same shape as the Catalog's semantic-model and rule pages: each tab is a URL (`/workforce/{id}/behavior` or `/workforce/{id}/knowledge`, …), each opens with `EntityViewHeader` and renders `EntityViewPanel` cards, and each saves its own fields (the update endpoint patches only what is sent).

The tabs are split by **what a setting is**, not by screen region: prompt text (Profile — name, description and the instructions); request parameters (Model — the model, chosen from the registered chat models or left on the deployment default, and the `generation` group: `temperature`, `top_p`, `max_tokens`, `thinking`, `reasoning_effort`); what it knows (Knowledge — corpora, semantic models, ontology groups); capability switches (Skills); what it may lookup or run (Tools — Catalog and ontology lookups, the session folder and code execution); what the runtime *enforces* (Behavior — answer policy and tool-round ceiling, which cannot live in a prompt because a prompt can be argued with); and who may call plus where (Credentials, which ends with the endpoint line). The whole `generation` group is read by the qa-agent and sent with the call; empty means the deployment's behaviour (temperature `0.3`, the gateway's own `top_p`, length limit and effort, thinking off). Sampling has a row of starting points (default / precise / balanced / creative) that set temperature and top-p together; they are values, not a mode — the fields stay editable and a hand-typed number simply leaves no button active. **Reasoning effort is only sent while thinking is on** — an effort level with the switch off is a contradiction, so the runtime drops it and the control is disabled on screen. The levels are `low | high | max` — what both providers we run accept, and an unsupported level is rejected by the vendor rather than ignored. (OpenAI also knows `minimal` and `medium`; they would be offered with the provider that needs them, not held here for a model that would fail.) `thinking` is the one setting that is not portable, and the field is named after the concept rather than the transport: **Thinking mode**, on or off, with the hint saying what it buys (reasoning before the answer), what it costs (latency, tokens), and that some models ignore `temperature` while it is on — the provider documents that side effect, so the screen must too. The shape is per provider, because the same switch is a different field per vendor — and it is two body fragments configured on the provider (Models → Edit provider → Thinking toggle), not here: the runtime merges the `on` or `off` fragment the agent chose, and an empty fragment means nothing is sent because that provider cannot be asked. A vendor with no off switch (Anthropic's token budget, a gateway that always thinks) is expressed by leaving `off` empty rather than by inventing a setting that looks effective — a wrong field is ignored silently, which would make the setting look effective when it is not. Measured on `deepseek-flash`: `enable_thinking: false` still produced a reasoning chain, `{"thinking": {"type": "disabled"}}` produced none (`docs/research/agent-config/deepseek-thinking.md`).

The agent's **Tools** tab uses three words strictly, because mixing them is what made it unreadable:

| Word | What it is | Example | How it is configured |
|---|---|---|---|
| **Capability** | something the agent can do, and a shortcut for picking several tools | `catalog`, `page_index`, `code_execution` | a switch, saved on toggle |
| **Tool** | one callable function a capability brings | `run_sql`, `run_command` | ticked individually inside its capability: the selection's real unit |
| **Resource** | data a capability reads | a semantic model, an ontology group | bound inside its capability |

A resource is bound **inside the capability that reads it**, because a binding without the capability does nothing —
turning Catalog on is where "bind a semantic model" belongs, not a separate resources page. A capability whose switch
is off says so instead of offering a binding it cannot use. The agent stores a **tool ledger**, `{capability_id: "all" | [tool_id, ...]}`: a missing key means off, `"all"` follows
the capability as the runtime grows it, and a list is an explicit subset. Unticking one tool inside an enabled
capability turns `"all"` into that list — `{"code_execution": ["exec.shell"]}` is "shell but not python", which is the
case a capability-level switch cannot express. Tool ids (`catalog.sql`, `exec.shell`) are declared in the catalogue and
survive a rename of the callable function; the callables themselves are named the way other agent platforms name theirs —
verb first, no `_tool` suffix: `read_file`, `write_file`, `run_command`, `run_sql`. Where an object has a settled name in
the data world it keeps it: `list_semantic_models` / `get_semantic_model` / `query_semantic_model`, because "semantic
model" is the term Ossie's spec, Power BI and dbt's semantic layer all use — a bare `models` would read as LLM models.

Limits are shown on the thing they limit: the command allow list constrains `run_command` only — `run_python`
runs code, and code is not a command line — so the list (and its "additional commands" field) sits on that tool's row,
with the shared limits (conversation directory, `out/` writable, 60s) stated once for the capability. Switches save
themselves; the only form on the page is the additional-command list, and its Save appears when there is something to
save.

`agent_config.workspace` was removed (`wf8deadworkspace`): its four fields were written by the UI and read by nobody —
the file tools are switched by the `workspace` capability id, and the session reaper takes its limits from the
qa-agent's own settings. A stored switch that nothing reads is a switch that lies.

Unchecking every capability stores an empty list, which the runtime reads as "use the defaults"; the tab says so under
the switches rather than letting the boxes flip back silently.

**Knowledge and Tools are separate axes**: *knowledge* is data the agent may read, a *capability* is something it may
do. The three kinds — corpora, semantic models, ontology groups — share one tab, because from the agent's side they are
one question ("what does it know?") answered with one action ("bind"). They are all knowledge in different shapes:
documents, metrics, and the object graph. A capability that reads one says so and links there (`Needs a semantic model
(1 bound)`), so the dependency is visible without a second copy of the list and a binding does not disappear when a
capability is switched off. Each section adds through a picker — search, multi-select, one submit — instead of a
dropdown plus a button, because choosing and confirming are one decision, not two. Retrieval depth is neither: it belongs to the corpus, so the knowledge tab links to the
source's settings rather than offering a second place to set `top_k`. The same rule reaches the API: `agent_config_payload` strips
`retrieval` from anything the agent saves. The tab list is one module (`pages/workforce/detail/tabs.ts`) that both the route table and the sidebar rail read, so a tab cannot exist in one place and not the other. **Archive**, not delete — bindings and the audit trail keep pointing at a row that exists |
| Ownership | ✅ | An agent is visible to its creator and to admins, and to nobody else. `owner_sub` is the ceiling on what it may read; there is no sharing surface yet |
| Knowledge sources | ✅ | `workforce_agent_kbs` — 1..n knowledge bases. Binding requires the **creator** to be able to read that knowledge base (the agent is their delegation, so it can never look at something they cannot) |
| Data scope | ✅ | `workforce_agent_semantic_models` / `workforce_agent_ontology_groups` — the Catalog models and ontology groups the agent may consult. Recorded per agent. A knowledge base no longer carries a scope of its own, so there is nothing for the runtime to inherit from the source |
| Answer verification | ✅ | `sources` carry `used` / `consulted` (always — the old `answer_policy.evidence_labels` switch never did anything and is gone). `require_grounded_numbers` is `off \| mark \| enforce`; **`verified` is true only when the policy was `enforce` and every number traced** — "not checked" is not "passed", so with the policy off the answer reports `verified: false` and `grounding.policy: "off"` says why. Callers that need a gate should require both |
| Retrieval (on the knowledge source) | ✅ | `top_k`, `rerank`, `min_score` live on the knowledge base, and `rerank` is honoured: `qa-agent`'s `retrieve(..., rerank=)` reads it, `never` turns reranking off even in a deployment that has it on, and `always` still needs a rerank endpoint — the option's label says so instead of failing silently |
| Skills vs tools | ✅ | Two different things, two tabs. **Tools** = capabilities the runtime provides (ontology, catalog, page index) plus the bound semantic models / ontology groups, the session workspace, code execution and its extra allowed commands. **Skills** = packages from the **workforce skill registry** (`workforce_skills`, `workforce_skill_versions`) — written in the product, not uploaded — stored per agent in `workforce_agents.installed_skills` as `{skill_id: version}`; an installed package contributes its `SKILL.md` to the prompt (`Installed skills:` section). The switch list is `agent_skills`, the package list is `installed_skills` — one is "what it can do", the other "how to do it". Agent Project keeps its own registry of uploaded archives (`agent_skills`); the two never reference each other |
| Session workspace | ✅ | Each conversation gets its own directory (`qa-agent/session_fs.py`): `out/` for artifacts, `uploads/`, `tmp/`. The sandbox runs with that directory as its working directory, so work products land inside the conversation they belong to. Verified: creating a session yields `AGENTS.md`-capable root with `out/`, `uploads/`, `tmp/` |
| Command allowlist | ✅ | `sandbox.allow_commands` on the Tools tab, one command per line. Additive only — it widens the built-in list (20 inspection commands) and cannot narrow it; a rejected program raises `CommandNotAllowed` before anything runs |
| Prompt | ✅ | The system prompt is generated from four things, in this order: **name + description** ("You are <name>. <description>"), the **instruction**, **AGENTS.md** as memory, then the runtime sections. Name and description are part of the prompt rather than decoration — an author who names a service expects the model to know it. Two texts are editable on the Profile tab. `prompts.system_prompt` is the body of the system prompt (empty = built-in). `prompts.agents_md` is agent memory: appended to the same system message inside `<workspace_conventions>` with a note that file content is reference, not instructions, **and** written to `AGENTS.md` in the session workspace for the file tools — the same shape `deepagents` uses (`MemoryMiddleware` appends memory to the system prompt). The composed prompt is `identity → instruction → conventions → installed skills → tool descriptions → answer policy → retrieved passages`; only the first three are authored, the rest are generated by the runtime so a prompt edit cannot remove a behaviour the policy tab enforces. Its own **Prompt preview** tab shows the result as labelled blocks, each naming the tab it comes from (`POST …/prompt-preview`, built by the qa-agent's own `prompt_sections`), with retrieved passages as a marker. It is a top-level tab rather than a switch inside Profile because the prompt is composed from every tab — putting it inside Profile implied it reflected only Profile |
| Behaviour | ✅ | Instructions (`prompts.agents_md`), `model_id`, `generation` (`temperature`, `top_p`, `max_tokens`, `thinking`), skills, answer policy, orchestration, workspace, sandbox — everything the knowledge base's Agent tab used to hold **except `retrieval`**. `generation` is sent with the model call: `temperature` defaults to the deployment's `0.3`, `top_p` and `max_tokens` stay unset (the gateway decides), `thinking` to off |
| Credentials | ✅ | `wfks.{credential_id}.{secret}`, returned **once**. Belongs to the agent, not the person: revoking it stops this service without touching the owner's sign-in. A credential carries its owner's identity (local user id or OIDC sub + realm roles snapshot) |
| Read-only delegation | ✅ | A credential authenticates as the owner but may only read: `GET`/`HEAD`, its own `…/ask`, and the **query plane** its skills call (`POST …/knowledge-bases/{id}/search`, `…/semantic-models/{id}/query`, `…/sql`, `/api/ontology/explore`). Every other mutation is refused with `WORKFORCE_CREDENTIAL_READ_ONLY` |
| Chat | ✅ | `/workforce/:agentId/chat[/:conversationId]?kb=…` — the conversation screen (`pages/workforce/chat/`): session rail, thread, composer, sources, files. A thread belongs to **one knowledge source** (citations must come from one corpus); an agent with several sources asks which one first. The thread store is unchanged (`surface=knowledge_base`), so history written by the knowledge base's old Q&A is here as it was. The entry is the agent's own **Talk to this agent** button, or `/workforce` → the agent; a knowledge base does not link here — it is the corpus, not a way in. |
| Service endpoint | ✅ | `POST /api/workforce/agents/{id}/ask` with `{"kb_id", "question"}`, `conversation_history`, optional `session_id`. Forwards to the qa-agent's `/knowledge-bases/{kb_id}/ask` |
| Audit | ✅ | Recorded by the HTTP audit middleware: `actor_sub` is the owner, `actor_name` is the **agent**, `auth_mode` is `wfks`, and the agent id is the resource id |
| Default agent per knowledge base | ✅ | Creating a knowledge base creates its default agent; migration `wf1agents` seeded one for every existing knowledge base, and `wf3agentdesc` cleared the corpus blurb those copies inherited — an agent's description says who it answers for, not what is known. The knowledge base's own Q&A resolves that agent |

## What lives where

| Setting | Owner | Why |
|---|---|---|
| Documents, wiki pages, FAQs, chunks, embeddings, `chunk_config`, `metadata_keys` | Knowledge base | It is the content |
| `retrieval` (`top_k`, `rerank`, `min_score`) | Knowledge base | Depth is a property of the corpus: an FAQ-shaped base and a dense quant base want different numbers, and a role does not change that |
| Instructions, `model_id`, `agent_skills`, answer policy, orchestration, workspace, sandbox, observability | Agent | It is how this service answers |
| `agent_url` | Deployment (`OPENKMS_QA_AGENT_URL`), per-KB `agent_url` still wins | The qa-agent is one service for the deployment, not a property of a corpus |
| Semantic models / ontology groups | Agent (recorded); knowledge base (used at runtime today) | See below |

**One source, not two.** The knowledge base's Agent tab still speaks `PUT /api/knowledge-bases/{id}`; the
backend mirrors `agent_skills` and `agent_config` (minus `retrieval`) onto the default agent, and the
knowledge base's Q&A reads the agent. Editing either surface produces one configuration. The mirror exists
only until the tab moves onto the agent.

## Runtime

```
POST /api/workforce/agents/{agent_id}/ask
Authorization: Bearer wfks.{credential_id}.{secret}

{"kb_id": "…", "question": "…", "conversation_history": []}
```

1. `authenticate_request` resolves the credential to the owner's identity plus
   `openkms_workforce_agent_id` (the credential row, and the agent it belongs to, must both be live).
2. The service handler proves the credential belongs to **this** agent and that `kb_id` is one of its
   bindings; it then sets the audit label to the agent's name.
3. If the agent names a model (`agent_config.model_id`), the qa-agent resolves **that model's** endpoint and key
   through `GET /internal-api/models/{id}/llm-credentials` — the model may belong to another provider than the
   deployment default. Unset means the default model. A name that no longer resolves falls back to the default with
   an error in the log, and the reply's `model` field says which model actually answered.
4. The request body is built with **the agent's** skills and configuration, plus the knowledge base's
   `retrieval`, and forwarded to `{agent_url}/knowledge-bases/{kb_id}/ask`.
4. The answer, sources, grounding report, warnings and trace id come back as the qa-agent sends them.

`POST /{id}/ask` is a POST by shape and a read by effect — the same is true of the query endpoints the
qa-agent calls back with the same credential (retrieval, Catalog metric/SQL, graph exploration). Those are
allowed; everything that changes state is refused.

## Routes

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/workforce/agents` | Owner-scoped list (admins see all); `limit`, `offset` |
| POST | `/api/workforce/agents` | Create; optional `knowledge_base_ids` bound in the same call |
| GET | `/api/workforce/agents/{id}` | Detail with knowledge, model and ontology bindings |
| GET | `/api/models?api_kind=chat-completions` | The list the Model tab chooses from — a select over the registry, because credentials are resolved per model |
| PUT | `/api/workforce/agents/{id}` | Name, description, `agent_skills`, `agent_config` (wholesale, like the KB API) |
| DELETE | `/api/workforce/agents/{id}` | Archive (204). Credentials stop working immediately |
| GET/POST | `/api/workforce/agents/{id}/knowledge-bases` | List / bind (`knowledge_base_id`, optional `label`, `priority`) |
| DELETE | `/api/workforce/agents/{id}/knowledge-bases/{binding_id}` | Unbind |
| GET/POST | `/api/workforce/agents/{id}/semantic-models` | List / bind |
| DELETE | `/api/workforce/agents/{id}/semantic-models/{binding_id}` | Unbind |
| GET/POST | `/api/workforce/agents/{id}/ontology-groups` | List / bind |
| DELETE | `/api/workforce/agents/{id}/ontology-groups/{binding_id}` | Unbind |
| GET/POST | `/api/workforce/agents/{id}/credentials` | List / mint (`name`). The token is in the POST response only |
| DELETE | `/api/workforce/agents/{id}/credentials/{credential_id}` | Revoke |
| POST | `/api/workforce/agents/{id}/ask` | Service plane. Credential only; `kb_id` names one source |
| GET/POST | `/api/workforce/skills` | Workforce skill registry: list (`items[]` with newest release + draft flag) / create (`id`, `name`, `description`) |
| GET | `/api/workforce/skills/{id}` | Draft files, validation report (`blocking`, `warnings`) and versions |
| PUT/DELETE | `/api/workforce/skills/{id}/draft/file` | Write / delete one draft file (`path`, `content`) |
| POST | `/api/workforce/skills/{id}/publish` | Validate and freeze the draft into an immutable version (400 lists the blocking findings) |
| POST | `/api/workforce/skills/{id}/versions/{version}/deprecate` | Retire a release; installed agents unaffected |
| GET/POST | `/api/workforce/agents/{id}/skills` | Installed packages / install a **published** version |
| GET | `/api/workforce/agents/{id}/skills/available` | Registry entries with at least one published version |
| GET | `/api/workforce/tools` | The runtime tool catalogue (capabilities, tool definitions, code-execution policy); proxied from the qa-agent and cached for 60s |
| DELETE | `/api/workforce/agents/{id}/skills/{skill_id}` | Uninstall |

Errors: unbound `kb_id` → 404; a credential presented to another agent's endpoint → 403; a deleted (retired) agent
→ 409; a non-serving mutation by a credential → 403 `WORKFORCE_CREDENTIAL_READ_ONLY`.

## Skills

A workforce skill is a package a digital employee carries: a `SKILL.md` plus optional Python. It is **authored in
the product** — Workforce → Skills — which is what makes it a different asset from an Agent Project skill (a zip a
developer uploads whole). Two registries, no shared rows; the agent-side endpoints read the workforce one.

| Lifecycle | Meaning |
|---|---|
| `draft` | The editing row. At most one per skill; edited in place, **last write wins** — a draft is a scratchpad, not a shared document |
| `published` | Immutable. The only thing an agent can install |
| `deprecated` | No longer offered to new installs. Agents that already installed it keep working and are **not told**: their answers do not change, and a notice with no action attached is noise |

The registry assigns the version number (`1`, `2`, …). `SKILL.md` frontmatter does not declare one: two places
recording "which version is this" is how they drift. Publishing flips the draft into a release; the next edit opens
a new draft cloned from it, so an author changes one paragraph instead of starting from an empty file.

The editor shows the frontmatter as a form (`name`, the `description` the prompt always carries, the `entrypoint`,
its `subcommands`) and the body as markdown; scripts open in a Python editor. Validation is two-tier: **saving only
warns**, because a half-written skill is a normal state — **publishing refuses** the blocking findings:

| Check | Why |
|---|---|
| `name` equals the skill id, `description` non-empty and ≤ 300 chars | The description is the only text always in the prompt |
| Body ≤ 8000 chars, ≤ 40 files, ≤ 50 KB each, ≤ 200 KB total | A skill is a procedure, not a second system prompt |
| Only text: `.md` / `.py` / `.txt` / `.json` / `.yaml` / `.yml` | Anything binary needs a decision first |
| `entrypoint` exists and is `scripts/*.py` | The one file the runtime can run |
| No API keys, GitHub tokens, AWS keys or private keys | A skill is shared with every agent that installs it |

**Getting the text into the prompt.** The qa-agent does not read either registry's storage; it asks the backend for
one skill's text (`GET /internal-api/skills/{registry}/{skill_id}/{version}/prompt`). `registry` is `agent` for Agent
Project packages or `workforce` for these — the caller has to name it, because a slug can exist in both registries and
a guess would serve another agent's instructions. The backend sends `skills_registry` next to `installed_skills`
whenever a workforce agent asks; a knowledge base's own Q&A sends neither, which means the Agent Project registry.
Only a release is served: a draft is nobody's installation.

**Execution bound (stated plainly).** A script runs as a child process of the service, with the skill directory
read-only, `out/` as the writable place, and the sandbox command allowlist deciding which programs exist. That is a
guard rail, not a sandbox: code inside the process can write wherever the process may write, and the UI does not
claim otherwise ("controlled execution", never "sandbox"). Skills carry no execution tool of their own —
`entrypoint` / `subcommands` are metadata for validation and for telling the model how to call the script, the same
shape Claude Code, pi and deepagents use.

## One area, three lists

The Workforce area has one tab strip — **Agents / Skills / Tools** — and the three lists share one page shape, the same
one Agent Projects uses: the design system's `ListPage` (h1 naming the area **and** the section, e.g. `Workforce – Skills`;
the zh agent list needs no prefix because the area and its agents share one name), one primary action on the header row,
the tab strip directly below it, then cards or a table. Every button on those headers is the shared `.btn`, so sizes and
spacing come from the design system rather than from a page-local override — the Agent Projects header used to carry its
own `font-size: 16px` and compact padding, which is why its buttons stood a few pixels taller than Workforce's. A reader who learned the agents list does not have to learn the skills list. Agent cards carry two shortcuts in
their top row (open a chat, retire the agent); the destructive one is on the list, not on the detail page.

**Tools** is the read-only one, and it is organised as a **catalogue**, not a grid of cards: capabilities are grouped
by what they touch — Documents, Data and graph, Files, Runtime — and each row answers, in order, what the capability is
for, which tools it brings, what it needs bound on the agent, and whether it carries limits. Opening a row shows the
tool definitions the model receives; for code execution it also shows the policy (conversation directory, `out/`
writable, 60s, and the built-in allowlist folded behind a summary).

The grouping is **data**, three fields per capability in `qa-agent/tool_catalog.py` — `group`, one-line `summary`,
`requires` — so a new capability joins a group and the page is unchanged; a capability with limits carries its own
`policy` block instead of the page growing a section. Nothing on this page can be edited: enabling a capability is a
decision about one agent and lives on that agent's Tools tab, which is also where the bound model or ontology group is
chosen.

## Retrieval is two capabilities, not one

Two tools do the same kind of act — look something up — across two different boundaries, so they are two switches:

| Capability | Tool | Reads | Default |
|---|---|---|---|
| Knowledge search | `search_knowledge_base` | this knowledge base, through the same retriever the answer path uses | **on** (core: a service over a corpus that cannot read it is a configuration nobody means to choose) |
| Web search | `search_web` | the public web, through a provider the deployment configures | off, and unavailable until configured |

One switch for both would let "search our documents" also mean "reach the internet". The per-tool checkbox inside a
capability is too easy to miss for a boundary that decides whether tenant data leaves the deployment.

Retrieval is only a tool: there is no node that pre-fetches passages, and `orchestration.retrieve` is gone (`wf10noretrieve`).
An agent with `knowledge_search` off simply cannot read its corpus — that is a configuration, not a bug, and the Knowledge
tab is where its sources are bound.

**Web search is a connector, and the agent binds one.** The credential, the base URL and the provider settings live in a
Connectors entry (`zhipu_web_search` or `deepseek_web_search`), managed on the Connectors screen; the qa-agent holds no
key and asks the backend to run the call. Each agent binds **exactly one** connector on its Knowledge tab
(`PUT …/agents/{id}/web-search-connector`), because two providers answer the same question: which one is a deployment
decision, not something a model can weigh.

A switch that cannot do anything is worse than none, so the catalogue marks `web_search` unavailable when the deployment
has no enabled search connector, and the Tools row says "needs a search connector" with a link to the binding. An agent
that enables the capability without binding one gets a tool that says so, rather than a search through whichever key
happened to be first in the table.

DeepSeek's integration uses its **Search API** (`POST /v1/tools/search`, `need_content: true`), not its `deepseek_web_search`
server tool: the server tool runs inside their chat turn, while the API returns results to us — which is what an answer
that cites them needs. See `api-docs.deepseek.com/api/search`. Results
carry a `note` telling the model they are external: citing a web page as if it were a document in the corpus is a false
citation, and the model copies what it reads.

## Tools are described once

A capability switch (`ontology`, `catalog`, `page_index`, `workspace`) exists to put that capability's tools into the
request's `tools` array. The model then reads each tool's **own description** — what it does, when to use it, what its
parameters mean, what it cannot do. That description is written where the tool is defined (`@tool` docstrings in
`qa-agent/qa_agent/skills/`), and nowhere else:

| Layer | Holds | Where it lives |
|---|---|---|
| Tool definition | name, description, parameter schema | code (the function-calling contract) |
| Capability switch | which tools are available to this agent | `agent_skills` on the agent |
| Code-execution policy | cwd, `out/` writable, built-in command allowlist (41), timeout | runtime defaults + per-agent additions |
| Skill package | procedures and judgement across tools | the skills registry (authored, versioned) |

There is deliberately **no prose block per capability inside the prompt**: it used to exist (`ONTOLOGY_PROMPT`,
`CATALOG_PROMPT`, …) and it was a second copy of text the model already received from the schema, so the two drifted.
`GET /api/workforce/tools` serves the same catalogue the model is given — capabilities with their tools, and the
code-execution policy with its workable command list — so the Tools tab can show the contract instead of summarising
it. The qa-agent builds that payload from its own tool objects (`qa_agent/tool_catalog.py`), which is why adding a tool
needs no front-end change.

## Not in this version

| Item | Trigger to build it |
|---|---|
| Multi-source answer for one question (federated retrieval, source labels) | A real caller needs one question answered across several sources |
| Agent-scoped Catalog / Ontology resolution in the qa-agent | The agent's scope must differ from the knowledge base's in practice |
| Publishing / versions / quotas | An integrator needs a pin or a rate contract |
| Sharing an agent with another user or group | A second person must configure the same service |
| Agent Project workspace in Workforce | Never — those are internal workspaces; this is a request/response service |
| Moving the KB Agent tab off `/api/knowledge-bases` | The knowledge base stops being the write surface for a default agent |

## Verification

- `cd backend && ./check.sh` — includes `tests/test_workforce.py` (config split, skills, credential shape, read-only rule)
  and `tests/test_workforce_skills.py` (the `SKILL.md` contract: name/description/entrypoint/limits/secrets).
- `cd frontend && npm run check` — typecheck, style guards, the draft round-trip test, build.
- `cd backend && uv run alembic upgrade head` — creates the tables and seeds one agent per existing knowledge base;
  `wf7skills` adds the skill registry and drops `installed_skills` bindings that pointed at the Agent Project registry.
- Sweep a locale for the new surface: `npm run screenshot -- --path /workforce --check-overflow`.
- `cd qa-agent && ./check.sh` — includes `tests/test_tool_catalog.py` (every capability lists its tools, descriptions
  are the tools', the code-execution policy carries the real allowlist).
