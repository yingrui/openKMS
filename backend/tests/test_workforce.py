"""Workforce agents: the split between a knowledge source and a service, and the credential rules.

No database here — these are the two decisions the feature rests on:

* **where a setting lives** — retrieval depth is the corpus's, everything else is the service's;
* **what a credential may do** — read, and ask. Nothing else.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from starlette.requests import Request

from app.api.auth import (
    _reject_workforce_mutation,
    _workforce_credential_is_querying,
    _workforce_credential_is_serving,
)
from app.services.workforce.agent_config import (
    CORE_AGENT_SKILLS,
    agent_config_payload,
    resolve_skills,
    runtime_config,
)
from app.services.workforce.credentials import is_credential_token


def _kb(agent_config: dict | None = None, agent_skills: list | None = None):
    return SimpleNamespace(agent_config=agent_config, agent_skills=agent_skills)


def _agent(agent_config: dict | None = None, agent_skills: list | None = None):
    return SimpleNamespace(agent_config=agent_config, agent_skills=agent_skills)


class TestConfigSplit:
    def test_agent_payload_never_carries_retrieval(self):
        payload = agent_config_payload(
            {"retrieval": {"top_k": 9}, "answer_policy": {"unknown_measure": "refuse"}}
        )
        assert payload is not None
        assert "retrieval" not in payload
        assert payload["answer_policy"]["unknown_measure"] == "refuse"

    def test_agent_payload_drops_defaults(self):
        # An empty config means "today's behaviour"; storing every default would hide that.
        assert agent_config_payload(None) is None
        assert agent_config_payload({}) is None

    def test_runtime_config_takes_retrieval_from_the_knowledge_source(self):
        kb = _kb({"retrieval": {"top_k": 14, "rerank": True}})
        agent = _agent({"answer_policy": {"unknown_measure": "refuse"}})
        runtime = runtime_config(kb, agent)
        assert runtime["retrieval"]["top_k"] == 14
        assert runtime["retrieval"]["rerank"] is True
        assert runtime["answer_policy"]["unknown_measure"] == "refuse"

    def test_runtime_config_ignores_retrieval_stored_on_the_agent(self):
        kb = _kb({"retrieval": {"top_k": 3}})
        agent = _agent({"retrieval": {"top_k": 40}})
        assert runtime_config(kb, agent)["retrieval"]["top_k"] == 3

    def test_the_deleted_keys_are_rejected_rather_than_silently_dropped(self):
        # `extra="forbid"` is what makes a stale client fail loudly instead of writing a key nothing reads back.
        import pytest
        from pydantic import ValidationError

        from app.schemas.kb_agent_config import parse_agent_config

        for stale in (
            {"observability": {"sample_rate": 0.5}},
            {"orchestration": {"profile": "rag_only"}},
            {"answer_policy": {"evidence_labels": "flat"}},
        ):
            with pytest.raises(ValidationError):
                parse_agent_config(stale)

    def test_generation_carries_the_whole_sampling_group(self):
        from app.schemas.kb_agent_config import parse_agent_config

        cfg = parse_agent_config(
            {"generation": {"temperature": 0.2, "top_p": 0.9, "max_tokens": 800}}
        )
        assert cfg.generation.model_dump(exclude_none=True) == {
            "temperature": 0.2,
            "top_p": 0.9,
            "max_tokens": 800,
            "thinking": "off",  # two-state, defaulted rather than unset
        }

    def test_runtime_config_without_agent_is_the_old_payload(self):
        kb = _kb({"retrieval": {"top_k": 7}, "workspace": {"enabled": True}})
        runtime = runtime_config(kb, None)
        assert runtime["retrieval"]["top_k"] == 7
        assert runtime["workspace"]["enabled"] is True


class TestSkills:
    def test_null_means_core_defaults(self):
        assert resolve_skills(None) == list(CORE_AGENT_SKILLS)

    def test_empty_means_core_defaults(self):
        assert resolve_skills([]) == list(CORE_AGENT_SKILLS)

    def test_explicit_list_wins(self):
        assert resolve_skills(["catalog"]) == ["catalog"]

    def test_blank_entries_are_dropped(self):
        assert resolve_skills(["catalog", "  "]) == ["catalog"]


class TestCredentialShape:
    def test_accepts_a_workforce_token(self):
        assert is_credential_token("wfks.6f1c0a1e.secret") is True

    @pytest.mark.parametrize(
        "token",
        [
            "okms.6f1c0a1e.secret",  # a personal key is a different principal
            "wfks.only-one-part",
            "wfks.a.b.c",
            "",
        ],
    )
    def test_rejects_anything_else(self, token):
        assert is_credential_token(token) is False


def _request(method: str, path: str, *, agent_id: str | None = None) -> Request:
    payload: dict = {"sub": "user-1"}
    if agent_id:
        payload["openkms_workforce_agent_id"] = agent_id
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "state": {"openkms_jwt_payload": payload},
    }
    return Request(scope)


class TestReadOnlyDelegation:
    def test_serve_endpoint_is_recognised(self):
        assert _workforce_credential_is_serving(
            _request("POST", "/api/workforce/agents/a1/ask")
        )
        assert not _workforce_credential_is_serving(_request("POST", "/api/workforce/agents"))
        assert not _workforce_credential_is_serving(_request("GET", "/api/workforce/agents/a1/ask"))

    def test_reads_pass(self):
        _reject_workforce_mutation(_request("GET", "/api/knowledge-bases", agent_id="a1"))

    def test_asking_passes(self):
        _reject_workforce_mutation(
            _request("POST", "/api/workforce/agents/a1/ask", agent_id="a1")
        )

    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_mutations_are_refused(self, method):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            _reject_workforce_mutation(
                _request(method, "/api/workforce/agents/a1", agent_id="a1")
            )
        assert exc.value.status_code == 403

    def test_a_signed_in_user_is_not_restricted(self):
        _reject_workforce_mutation(_request("DELETE", "/api/workforce/agents/a1"))


class TestQueryPlane:
    """The agent's skills call POST endpoints that only read. Refusing them would leave it mute."""

    @pytest.mark.parametrize(
        "path",
        [
            "/api/knowledge-bases/kb1/search",
            "/api/semantic-models/m1/query",
            "/api/semantic-models/m1/sql",
            "/api/ontology/explore",
        ],
    )
    def test_query_endpoints_are_allowed(self, path):
        assert _workforce_credential_is_querying(_request("POST", path)) is True
        _reject_workforce_mutation(_request("POST", path, agent_id="a1"))

    @pytest.mark.parametrize(
        "method, path",
        [
            ("GET", "/api/knowledge-bases/kb1/search"),
            ("POST", "/api/knowledge-bases/kb1/documents"),
            ("POST", "/api/semantic-models"),
            ("PUT", "/api/semantic-models/m1/query"),
            ("POST", "/api/ontology/functions/f1/execute"),
        ],
    )
    def test_other_paths_are_not_the_query_plane(self, method, path):
        from fastapi import HTTPException

        assert _workforce_credential_is_querying(_request(method, path)) is False
        if method in ("GET", "HEAD"):
            _reject_workforce_mutation(_request(method, path, agent_id="a1"))
            return
        with pytest.raises(HTTPException) as exc:
            _reject_workforce_mutation(_request(method, path, agent_id="a1"))
        assert exc.value.status_code == 403
