"""`workforce` CLI ↔ HTTP: the queue and the fleet, one call each.

The group is new, so these tests are the only thing keeping the paths honest — a renamed route would otherwise
surface the first time an agent ran the command against a live server.
"""
from __future__ import annotations

import argparse

import pytest


def _ns(**kw):
    return argparse.Namespace(**{"yes": True, "dry_run": False, **kw})


def test_agents_list(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/workforce/agents")] = (200, {"items": [], "total": 0})
    from openkms.commands.workforce import cmd_agents_list

    cmd_agents_list(_ns(limit=10, offset=0))
    assert recorded[-1].url.path == "/api/workforce/agents"
    assert recorded[-1].url.params["limit"] == "10"


def test_agents_get(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/workforce/agents/wf-1")] = (200, {"id": "wf-1"})
    from openkms.commands.workforce import cmd_agents_get

    cmd_agents_get(_ns(id="wf-1"))
    assert recorded[-1].url.path == "/api/workforce/agents/wf-1"


@pytest.mark.parametrize(("fn_name", "action"), [("cmd_agents_pause", "pause"), ("cmd_agents_resume", "resume")])
def test_pause_and_resume_post_the_right_verb(mock_api, fn_name, action):
    recorded, responses = mock_api
    responses[("POST", f"/api/workforce/agents/wf-1/{action}")] = (200, {"status": "paused"})
    from openkms.commands import workforce

    getattr(workforce, fn_name)(_ns(id="wf-1"))
    assert recorded[-1].method == "POST"
    assert recorded[-1].url.path == f"/api/workforce/agents/wf-1/{action}"


def test_usage_reads_the_operations_route(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/workforce/operations/usage")] = (200, {"items": [], "activity_window_days": 7})
    from openkms.commands.workforce import cmd_usage

    cmd_usage(_ns())
    # Not `/api/workforce/agents`: usage lives on its own route because it reads the audit trail.
    assert recorded[-1].url.path == "/api/workforce/operations/usage"


def test_issues_list_defaults_to_open(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/workforce/issues")] = (200, {"items": [], "total": 0, "counts": {}})
    from openkms.commands.workforce import cmd_issues_list

    cmd_issues_list(_ns(status="open", kind=None, agent=None, limit=50, offset=0))
    assert recorded[-1].url.path == "/api/workforce/issues"
    assert recorded[-1].url.params["status"] == "open"


def test_issues_list_filters_by_agent_and_kind(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/workforce/issues")] = (200, {"items": []})
    from openkms.commands.workforce import cmd_issues_list

    cmd_issues_list(_ns(status="all", kind="refusal", agent="wf-1", limit=50, offset=0))
    params = recorded[-1].url.params
    assert params["agent_id"] == "wf-1"
    assert params["kind"] == "refusal"


def test_resolving_without_a_resolution_is_refused_before_the_call(mock_api):
    recorded, _responses = mock_api
    from openkms.commands.workforce import cmd_issues_resolve

    before = len(recorded)
    with pytest.raises(SystemExit) as raised:
        cmd_issues_resolve(_ns(id="iss-1", resolution=None))
    assert "resolution" in str(raised.value)
    # The API refuses it too; failing here means the agent never sends a request that cannot succeed.
    assert len(recorded) == before


def test_resolve_patches_status_and_resolution(mock_api):
    recorded, responses = mock_api
    responses[("PATCH", "/api/workforce/issues/iss-1")] = (200, {"id": "iss-1", "status": "resolved"})
    from openkms.commands.workforce import cmd_issues_resolve

    cmd_issues_resolve(_ns(id="iss-1", resolution="raised retrieval depth"))
    assert recorded[-1].method == "PATCH"
    assert recorded[-1].content.decode()
    assert b"raised retrieval depth" in recorded[-1].content


def test_ignore_needs_no_resolution(mock_api):
    recorded, responses = mock_api
    responses[("PATCH", "/api/workforce/issues/iss-2")] = (200, {"id": "iss-2", "status": "ignored"})
    from openkms.commands.workforce import cmd_issues_ignore

    cmd_issues_ignore(_ns(id="iss-2", resolution=None))
    assert recorded[-1].method == "PATCH"


def test_withdrawing_a_vote_sends_null(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/workforce/agents/wf-1/feedback")] = (200, {"message_id": "m1", "vote": None})
    from openkms.commands.workforce import cmd_feedback

    cmd_feedback(_ns(agent="wf-1", message="m1", conversation=None, vote="clear"))
    # Compact JSON: the body is built by the client, not printed for a human.
    assert b'"vote":null' in recorded[-1].content


def test_a_write_without_yes_and_without_a_tty_exits_2(mock_api, monkeypatch):
    recorded, responses = mock_api
    responses[("POST", "/api/workforce/agents/wf-1/pause")] = (200, {})
    monkeypatch.setattr("sys.stdin.isatty", lambda: False, raising=False)
    from openkms.commands.workforce import cmd_agents_pause

    before = len(recorded)
    with pytest.raises(SystemExit) as raised:
        cmd_agents_pause(_ns(id="wf-1", yes=False))
    assert raised.value.code == 2
    assert len(recorded) == before
