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

The tabs are split by **what a setting is**, not by screen region: prompt text (Profile — name, description and the instructions); request parameters (Model — the model, chosen from the registered chat models or left on the deployment default, and the `generation` group: `temperature`, `top_p`, `max_tokens`, `thinking`, `reasoning_effort`); what it answers *from* (Knowledge — bound sources only); capability switches (Skills); what it may lookup or run (Tools — Catalog and ontology lookups, the session folder and code execution); what the runtime *enforces* (Behavior — answer policy and tool-round ceiling, which cannot live in a prompt because a prompt can be argued with); and who may call plus where (Credentials, which ends with the endpoint line). The whole `generation` group is read by the qa-agent and sent with the call; empty means the deployment's behaviour (temperature `0.3`, the gateway's own `top_p`, length limit and effort, thinking off). Sampling has a row of starting points (default / precise / balanced / creative) that set temperature and top-p together; they are values, not a mode — the fields stay editable and a hand-typed number simply leaves no button active. **Reasoning effort is only sent while thinking is on** — an effort level with the switch off is a contradiction, so the runtime drops it and the control is disabled on screen. The levels are `low | high | max` — what both providers we run accept, and an unsupported level is rejected by the vendor rather than ignored. (OpenAI also knows `minimal` and `medium`; they would be offered with the provider that needs them, not held here for a model that would fail.) `thinking` is the one setting that is not portable, and the field is named after the concept rather than the transport: **Thinking mode**, on or off, with the hint saying what it buys (reasoning before the answer), what it costs (latency, tokens), and that some models ignore `temperature` while it is on — the provider documents that side effect, so the screen must too. The shape is per provider, because the same switch is a different field per vendor — and it is two body fragments configured on the provider (Models → Edit provider → Thinking toggle), not here: the runtime merges the `on` or `off` fragment the agent chose, and an empty fragment means nothing is sent because that provider cannot be asked. A vendor with no off switch (Anthropic's token budget, a gateway that always thinks) is expressed by leaving `off` empty rather than by inventing a setting that looks effective — a wrong field is ignored silently, which would make the setting look effective when it is not. Measured on `deepseek-flash`: `enable_thinking: false` still produced a reasoning chain, `{"thinking": {"type": "disabled"}}` produced none (`docs/research/agent-config/deepseek-thinking.md`).

**Knowledge is separate from Tools** because they answer different questions: binding a corpus decides what an
answer is drawn from; granting a lookup decides what the agent may consult while answering. Retrieval depth is
neither — it belongs to the corpus, so the Knowledge tab says where it lives and links to the source's settings
rather than offering a second place to set `top_k`. The same rule reaches the API: `agent_config_payload` strips
`retrieval` from anything the agent saves. The tab list is one module (`pages/workforce/detail/tabs.ts`) that both the route table and the sidebar rail read, so a tab cannot exist in one place and not the other. **Archive**, not delete — bindings and the audit trail keep pointing at a row that exists |
| Ownership | ✅ | An agent is visible to its creator and to admins, and to nobody else. `owner_sub` is the ceiling on what it may read; there is no sharing surface yet |
| Knowledge sources | ✅ | `workforce_agent_kbs` — 1..n knowledge bases. Binding requires the **creator** to be able to read that knowledge base (the agent is their delegation, so it can never look at something they cannot) |
| Data scope | ✅ | `workforce_agent_semantic_models` / `workforce_agent_ontology_groups` — the Catalog models and ontology groups the agent may consult. Recorded per agent. A knowledge base no longer carries a scope of its own, so there is nothing for the runtime to inherit from the source |
| Answer verification | ✅ | `sources` carry `used` / `consulted` (always — the old `answer_policy.evidence_labels` switch never did anything and is gone). `require_grounded_numbers` is `off \| mark \| enforce`; **`verified` is true only when the policy was `enforce` and every number traced** — "not checked" is not "passed", so with the policy off the answer reports `verified: false` and `grounding.policy: "off"` says why. Callers that need a gate should require both |
| Retrieval (on the knowledge source) | ✅ | `top_k`, `rerank`, `min_score` live on the knowledge base, and `rerank` is honoured: `qa-agent`'s `retrieve(..., rerank=)` reads it, `never` turns reranking off even in a deployment that has it on, and `always` still needs a rerank endpoint — the option's label says so instead of failing silently |
| Skills vs tools | ✅ | Two different things, two tabs. **Tools** = capabilities the runtime provides (ontology, catalog, page index) plus the bound semantic models / ontology groups, the session workspace, code execution and its extra allowed commands. **Skills** = installable packages from the global registry (`agent_skills`), stored per agent in `workforce_agents.installed_skills` as `{skill_id: version}`; an installed package contributes its `SKILL.md` to the prompt (`Installed skills:` section), the same package an Agent Project installs. The switch list is `agent_skills`, the package list is `installed_skills` — one is "what it can do", the other "how to do it" |
| Session workspace | ✅ | Each conversation gets its own directory (`qa-agent/session_fs.py`): `AGENTS.md`, `out/` for artifacts, `uploads/`, `tmp/`. The sandbox runs with that directory as its working directory, so work products land inside the conversation they belong to. Verified: creating a session yields `AGENTS.md`-capable root with `out/`, `uploads/`, `tmp/` |
| Command allowlist | ✅ | `sandbox.allow_commands` on the Tools tab, one command per line. Additive only — it widens the built-in list (41 commands) and cannot narrow it; a rejected program raises `CommandNotAllowed` before anything runs |
| Prompt | ✅ | Two texts, two destinations, both editable on the Profile tab. `prompts.system_prompt` is the body of the system prompt (empty = built-in). `prompts.agents_md` is agent memory: appended to the same system message inside `<workspace_conventions>` with a note that file content is reference, not instructions, **and** written to `AGENTS.md` in the session workspace for the file tools — the same shape `deepagents` uses (`MemoryMiddleware` appends memory to the system prompt). The composed prompt is `instruction → conventions → skill descriptions → answer policy → retrieved passages`; only the first two are authored, the rest are generated by the runtime so a prompt edit cannot remove a behaviour the policy tab enforces. The **Prompt** button shows the assembled text from the qa-agent's own builder (`POST …/prompt-preview`) and AGENTS.md as written, with retrieved passages as a marker |
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

Errors: unbound `kb_id` → 404; a credential presented to another agent's endpoint → 403; a deleted (retired) agent
→ 409; a non-serving mutation by a credential → 403 `WORKFORCE_CREDENTIAL_READ_ONLY`.

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

- `cd backend && ./check.sh` — includes `tests/test_workforce.py` (config split, skills, credential shape, read-only rule).
- `cd frontend && npm run check` — typecheck, style guards, the draft round-trip test, build.
- `cd backend && uv run alembic upgrade head` — creates the tables and seeds one agent per existing knowledge base.
- Sweep a locale for the new surface: `npm run screenshot -- --path /workforce --check-overflow`.
