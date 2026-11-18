# Workforce agents

A workforce agent (数字员工) is a Q&A service that answers from one or more knowledge bases on behalf of
callers outside openKMS. It is the split the platform needed: a **knowledge base says what is known**, an
**agent says how that knowledge answers for this service**.

Access is **`knowledge_bases:read`** / **`knowledge_bases:write`** — the same keys that gate knowledge
bases, because an agent is a published view of them.

| Feature | Status | Description |
|---------|--------|-------------|
| SPA i18n | ✅ | List + detail use the **`workforce`** namespace (`frontend/src/i18n/locales/{en,zh-CN}/workforce.json`); app name and tagline live in **`layout`** |
| Agent management | ✅ | CRUD via `/api/workforce/agents`; list is a table (name, sources, skills, credentials), detail is an `EntityViewShell` page with the sections below. **Archive**, not delete — bindings and the audit trail keep pointing at a row that exists |
| Ownership | ✅ | An agent is visible to its creator and to admins, and to nobody else. `owner_sub` is the ceiling on what it may read; there is no sharing surface yet |
| Knowledge sources | ✅ | `workforce_agent_kbs` — 1..n knowledge bases. Binding requires the **creator** to be able to read that knowledge base (the agent is their delegation, so it can never look at something they cannot) |
| Data scope | ✅ | `workforce_agent_semantic_models` / `workforce_agent_ontology_groups` — the Catalog models and ontology groups the agent may consult. Recorded per agent; the runtime still resolves the **knowledge source's** scope (see "Not in this version") |
| Behaviour | ✅ | Instructions (`prompts.agents_md`), model, skills, answer policy, orchestration, workspace, sandbox — everything the knowledge base's Agent tab used to hold **except `retrieval`** |
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
3. The request body is built with **the agent's** skills and configuration, plus the knowledge base's
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

Errors: unbound `kb_id` → 404; a credential presented to another agent's endpoint → 403; an archived agent
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
