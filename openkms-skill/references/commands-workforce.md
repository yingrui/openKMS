# Workforce: the fleet, its service state, and the problem queue

A workforce agent publishes knowledge as a service. Callers outside openKMS reach it with their own credential. This
group is the operating side. It reads the fleet, stops or resumes one agent, reads usage, and closes problems in the
queue.

Agent configuration (knowledge, tools, answer policy) is a screen job. `workforce agents get` reads the result. There
is no `agents create` on purpose: one agent has about a dozen binding decisions, and a flag list cannot express them.

## The fleet

```bash
python scripts/cli.py workforce agents list              # GET /api/workforce/agents
python scripts/cli.py workforce agents get --id AGENT_ID # + bindings, counts
python scripts/cli.py workforce agents pause --id AGENT_ID -y
python scripts/cli.py workforce agents resume --id AGENT_ID -y
```

`status` is `active`, `paused`, or `archived`.

Paused keeps everything: configuration, knowledge sources, keys. Callers get a `503` with the agent's paused message.

`archived` is the result of `DELETE`. The row stays. The keys stop working. There is no restore.

## Usage

```bash
python scripts/cli.py workforce usage
```

The response gives these fields for each agent:

- `calls_7d`: calls in the window.
- `errors_7d`: calls that returned 4xx or 5xx. This is what a caller sees as "it did not work".
- `last_call_at`: the most recent call.
- `upvotes` / `downvotes`: all-time votes.

Call counts come from `audit_events`. Every `POST …/ask` is a mutation, so the call is already recorded.
`activity_window_days` in the response gives the window.

Votes are all-time. Feedback arrives slowly, and one week of it is usually zero.

## The queue

`GET /api/workforce/issues` is the Operations queue. Each item is a problem that a person must review and close.

| `kind` | Written by | Meaning |
|---|---|---|
| `negative_feedback` | a 👎 on the conversation screen | the question, an answer excerpt, and who objected |
| `refusal` | the answer policy replaced an answer | `reason` is `no_citations` or `unsourced_numbers` |
| `violation` / `risk` | Guardrails (reserved) | named, no producer yet |
| `prompt_injection` | reserved | a question that looked like an instruction override |

```bash
python scripts/cli.py workforce issues list                          # open, newest first
python scripts/cli.py workforce issues list --status all --kind refusal
python scripts/cli.py workforce issues list --agent AGENT_ID
python scripts/cli.py workforce issues get --id ISSUE_ID
python scripts/cli.py workforce issues resolve --id ISSUE_ID --resolution "retrieval depth too low; raised it" -y
python scripts/cli.py workforce issues ignore --id ISSUE_ID --resolution "scope question, not an answer" -y
python scripts/cli.py workforce issues reopen --id ISSUE_ID -y
```

An item has one of three statuses: `open`, `resolved`, or `ignored`.

**`resolve` needs `--resolution`.** The command rejects an empty value before it sends a request, and the API rejects
it too. The next reader must know what happened. Without a sentence, they cannot tell "fixed" from "waved through".

Withdrawing a 👎 closes the item it opened. The status becomes `ignored` with the reason "vote withdrawn".

**Refusals enter the queue only when the agent allows it.** The setting is `answer_policy.queue_refusals` (Behavior →
Answer policy) and it is on by default. A new agent refuses often, and most of those refusals are wrong. Turn the
setting off when the answers are stable.

## Votes

```bash
python scripts/cli.py workforce feedback --agent AGENT_ID --message MESSAGE_ID --vote down -y
python scripts/cli.py workforce feedback --agent AGENT_ID --message MESSAGE_ID --vote clear -y
```

`--message` is the id of the **assistant** message. Get it from a conversation's message list.

There is one row for each reader and message. A second vote edits that row. `--vote clear` withdraws the vote and
closes any queue item it opened.

## Not in this group

`POST /api/workforce/agents/{id}/ask` authenticates with the agent's own `wfks.…` credential, not a personal API key.
This CLI speaks as a person. Ask an agent with its own key from an HTTP client, or from the conversation screen.

## Gotchas

- `issues get` reads the queue listing and picks the id from it. The API exposes the queue, not one item. The command
  searches the newest 200 items. For an older id, use `issues list --status all`.
- `pause` and `resume` print the agent. They do not print "ok". Run `agents get` if you need the new state.
- `calls_7d` includes failed calls. `errors_7d` is the subset that failed. `0 calls` and `0 errors` means nobody
  called. It does not mean that every call worked.
