"""workforce — the digital employees: what they are, whether they serve, and what needs a person.

A workforce agent publishes knowledge as a service outsiders call. This group is the operating side of that: read the
fleet, stop or resume one, read how it is being used, and work the queue of problems (a 👎, a refusal, and later
Guardrails findings) through to closed.

The service plane — `POST /api/workforce/agents/{id}/ask` — is deliberately **not** here: it authenticates with the
agent's own `wfks.…` credential, and this CLI speaks with a personal API key. Asking is an integrator's call, not a
configuration one.
"""
from __future__ import annotations

import argparse

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def _list_params(ns: argparse.Namespace, pairs: tuple[tuple[str, str], ...]) -> dict[str, object]:
    params: dict[str, object] = {}
    for attr, query in pairs:
        value = getattr(ns, attr, None)
        if value not in (None, ""):
            params[query] = value
    return params


# --- agents ---


def cmd_agents_list(ns: argparse.Namespace) -> None:
    params = _list_params(ns, (("limit", "limit"), ("offset", "offset")))
    with client() as s:
        r = s.get("/api/workforce/agents", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_agents_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/workforce/agents/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def _serve(ns: argparse.Namespace, action: str) -> None:
    path = f"/api/workforce/agents/{ns.id}/{action}"
    confirm_or_abort(
        action=f"{action} agent {ns.id}",
        method="POST",
        path=path,
        body=None,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(path)
    r.raise_for_status()
    print_json(r.json())


def cmd_agents_pause(ns: argparse.Namespace) -> None:
    _serve(ns, "pause")


def cmd_agents_resume(ns: argparse.Namespace) -> None:
    _serve(ns, "resume")


# --- usage ---


def cmd_usage(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/workforce/operations/usage")
    r.raise_for_status()
    print_json(r.json())


# --- issues ---


def cmd_issues_list(ns: argparse.Namespace) -> None:
    params = _list_params(
        ns,
        (
            ("status", "status"),
            ("kind", "kind"),
            ("agent", "agent_id"),
            ("limit", "limit"),
            ("offset", "offset"),
        ),
    )
    with client() as s:
        r = s.get("/api/workforce/issues", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_issues_get(ns: argparse.Namespace) -> None:
    """One item, read out of the queue listing: the API exposes the queue, not a single item."""
    with client() as s:
        r = s.get("/api/workforce/issues", params={"status": "all", "limit": 200})
    r.raise_for_status()
    for item in r.json().get("items", []):
        if item.get("id") == ns.id:
            print_json(item)
            return
    raise SystemExit(f"issue {ns.id} not found in the newest 200 items")


def cmd_issues_close(ns: argparse.Namespace, status: str) -> None:
    path = f"/api/workforce/issues/{ns.id}"
    body: dict[str, object] = {"status": status}
    if ns.resolution:
        body["resolution"] = ns.resolution
    if status == "resolved" and not ns.resolution:
        # The API refuses this too; failing here saves a round trip and says the same thing.
        raise SystemExit("resolving needs --resolution: what was done about it")
    confirm_or_abort(
        action=f"mark issue {ns.id} {status}",
        method="PATCH",
        path=path,
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_issues_resolve(ns: argparse.Namespace) -> None:
    cmd_issues_close(ns, "resolved")


def cmd_issues_ignore(ns: argparse.Namespace) -> None:
    cmd_issues_close(ns, "ignored")


def cmd_issues_reopen(ns: argparse.Namespace) -> None:
    path = f"/api/workforce/issues/{ns.id}"
    body = {"status": "open", "resolution": None}
    confirm_or_abort(
        action=f"reopen issue {ns.id}",
        method="PATCH",
        path=path,
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


# --- feedback ---


def cmd_feedback(ns: argparse.Namespace) -> None:
    """Cast, change, or withdraw this reader's verdict on one answer (`--vote clear` withdraws)."""
    path = f"/api/workforce/agents/{ns.agent}/feedback"
    body = {
        "message_id": ns.message,
        "conversation_id": ns.conversation or None,
        "vote": None if ns.vote == "clear" else ns.vote,
    }
    confirm_or_abort(
        action=f"record vote {ns.vote} on {ns.message}",
        method="POST",
        path=path,
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser(
        "workforce",
        help="digital employees: fleet, service state, usage, and the problem queue",
    )
    wf = p.add_subparsers(dest="workforce_cmd", required=True)

    agents = wf.add_parser("agents", help="the fleet").add_subparsers(
        dest="workforce_agents_cmd", required=True
    )
    ls = agents.add_parser("list", help="GET /api/workforce/agents")
    ls.add_argument("--limit", type=int, default=50)
    ls.add_argument("--offset", type=int, default=0)
    ls.set_defaults(fn=cmd_agents_list)
    get = agents.add_parser("get", help="GET /api/workforce/agents/{id}")
    get.add_argument("--id", required=True)
    get.set_defaults(fn=cmd_agents_get)
    for name, doc, fn in (
        ("pause", "stop serving; configuration and keys survive", cmd_agents_pause),
        ("resume", "serve again", cmd_agents_resume),
    ):
        sp = agents.add_parser(name, help=doc)
        sp.add_argument("--id", required=True)
        add_write_flags(sp)
        sp.set_defaults(fn=fn)

    usage = wf.add_parser("usage", help="GET /api/workforce/operations/usage — calls, failures, votes")
    usage.set_defaults(fn=cmd_usage)

    issues = wf.add_parser("issues", help="the Operations queue").add_subparsers(
        dest="workforce_issues_cmd", required=True
    )
    ils = issues.add_parser("list", help="GET /api/workforce/issues")
    ils.add_argument("--status", default="open", choices=("open", "resolved", "ignored", "all"))
    ils.add_argument("--kind", default=None, help="negative_feedback / refusal / violation / risk / prompt_injection")
    ils.add_argument("--agent", default=None, help="agent id")
    ils.add_argument("--limit", type=int, default=50)
    ils.add_argument("--offset", type=int, default=0)
    ils.set_defaults(fn=cmd_issues_list)
    iget = issues.add_parser("get", help="one queue item by id")
    iget.add_argument("--id", required=True)
    iget.set_defaults(fn=cmd_issues_get)
    for name, doc, fn in (
        ("resolve", "close it — needs --resolution", cmd_issues_resolve),
        ("ignore", "close it as not worth acting on", cmd_issues_ignore),
        ("reopen", "put it back in the queue", cmd_issues_reopen),
    ):
        sp = issues.add_parser(name, help=doc)
        sp.add_argument("--id", required=True)
        sp.add_argument("--resolution", default=None, help="what was done (required to resolve)")
        add_write_flags(sp)
        sp.set_defaults(fn=fn)

    fb = wf.add_parser("feedback", help="POST /api/workforce/agents/{id}/feedback")
    fb.add_argument("--agent", required=True)
    fb.add_argument("--message", required=True, help="the assistant message id")
    fb.add_argument("--conversation", default=None)
    fb.add_argument("--vote", required=True, choices=("up", "down", "clear"))
    add_write_flags(fb)
    fb.set_defaults(fn=cmd_feedback)
