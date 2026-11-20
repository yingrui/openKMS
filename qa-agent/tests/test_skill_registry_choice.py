"""The skill text is fetched from the registry the ids belong to.

Agent Project packages and workforce skills are separate assets, and a slug can exist in both. Sending a bare id
would let the backend serve whichever table it looked in first, which is how an agent ends up carrying another
agent's instructions.
"""
from __future__ import annotations

from unittest.mock import patch

from qa_agent.backend_defaults import fetch_skill_prompts


class _Cfg:
    openkms_backend_url = "http://backend:8102"


def _fetch_with(registry: str | None) -> str:
    seen: list[str] = []

    def fake(url: str, what: str):
        seen.append(url)
        return {"display_name": "合同审阅", "content": "## 何时使用"}

    with patch("qa_agent.backend_defaults._fetch_json", side_effect=fake):
        if registry is None:
            fetch_skill_prompts(_Cfg(), {"contract-review": "1"})
        else:
            fetch_skill_prompts(_Cfg(), {"contract-review": "1"}, registry)
    return seen[0]


def test_workforce_skills_are_fetched_from_the_workforce_registry():
    assert _fetch_with("workforce") == (
        "http://backend:8102/internal-api/skills/workforce/contract-review/1/prompt"
    )


def test_the_default_stays_the_agent_project_registry():
    assert _fetch_with(None).endswith("/internal-api/skills/agent/contract-review/1/prompt")


def test_the_name_and_body_travel_together():
    with patch(
        "qa_agent.backend_defaults._fetch_json",
        return_value={"display_name": "合同审阅", "content": "## 何时使用"},
    ):
        packages = fetch_skill_prompts(_Cfg(), {"contract-review": "1"}, "workforce")
    assert packages == [
        {
            "skill_id": "contract-review",
            "display_name": "合同审阅",
            "version": "1",
            "content": "## 何时使用",
        }
    ]
