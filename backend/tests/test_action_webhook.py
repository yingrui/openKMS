"""An Action announces itself to the app behind the data.

The destination is registered on the Action (service + path), so the platform posts a fixed envelope
after a successful run — no bespoke Function, and the URL is not hidden in source.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.ontology import action_webhook


def _at(**kwargs):
    defaults = {
        "id": "at-1",
        "api_name": "applyPortfolioChanges",
        "display_name": "Apply changes",
        "rule_type": "function",
        "webhook_service_id": "es-1",
        "webhook_path": "/api/webhooks/openkms/portfolio-changes",
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_the_envelope_carries_the_object_the_action_acted_on():
    payload = action_webhook.build_payload(
        action=_at(),
        object_type_name="Portfolio",
        object_id="b10f1cca",
        object_properties={"name": "main"},
        object_key={"id": "b10f1cca"},
        input_payload={"changes": [{"action": "add", "ts_code": "600519.SH"}]},
        applied={"created_ids": [], "modified_ids": ["h1"], "deleted_ids": []},
        caller_user_id="u1",
        caller_name="yingrui",
        action_log_id="al-9",
    )
    assert payload["event"] == "action.executed"
    assert payload["action"]["api_name"] == "applyPortfolioChanges"
    assert payload["object"] == {
        "object_type": "Portfolio",
        "id": "b10f1cca",
        "key": {"id": "b10f1cca"},
        "properties": {"name": "main"},
    }
    assert payload["applied"]["modified_ids"] == ["h1"]
    assert payload["caller"] == {"sub": "u1", "name": "yingrui"}
    assert payload["action_log_id"] == "al-9"
    assert payload["at"]


def test_no_object_id_means_no_object_block():
    payload = action_webhook.build_payload(
        action=_at(),
        object_type_name=None,
        object_id=None,
        object_properties=None,
        input_payload={},
        applied=None,
        caller_user_id=None,
        caller_name=None,
        action_log_id="al-9",
    )
    assert payload["object"] is None
    assert payload["caller"] is None


def test_delivery_is_skipped_when_nothing_is_registered():
    import asyncio

    async def _run() -> None:
        at = _at(webhook_service_id=None, webhook_path=None)
        assert await action_webhook.deliver(None, at, {}) is None

    asyncio.run(_run())


# --- api-level validation ----------------------------------------------------
def test_a_path_outside_the_allowlist_is_refused():
    import asyncio

    from app.api.ontology_action_types import _validate_webhook

    service = SimpleNamespace(id="es-1", api_name="turtle", allowed_paths=["/api/jobs"])

    class _Db:
        async def get(self, model, pk):
            return service if pk == "es-1" else None

    async def _run() -> None:
        await _validate_webhook(_Db(), service_id="es-1", path="/api/jobs")
        with pytest.raises(HTTPException) as ei:
            await _validate_webhook(_Db(), service_id="es-1", path="/api/elsewhere")
        assert "not in the service's allowed prefixes" in str(ei.value.detail)
        with pytest.raises(HTTPException):
            await _validate_webhook(_Db(), service_id=None, path="/api/jobs")
        with pytest.raises(HTTPException):
            await _validate_webhook(_Db(), service_id="es-1", path="http://evil/api")

    asyncio.run(_run())


def test_object_body_is_the_resource_representation():
    """A REST-minded receiver gets its own shape: the object's properties, input on top."""
    body = action_webhook.build_object_body(
        object_properties={"id": "h-1", "ts_code": "600519.SH", "target_weight": 0.01},
        input_payload={"target_weight": 0.05},
    )
    assert body == {"id": "h-1", "ts_code": "600519.SH", "target_weight": 0.05}


def test_path_placeholders_resolve_from_object_and_input():
    path = action_webhook.resolve_path(
        "/api/portfolios/{portfolio_id}/stocks",
        object_properties={"portfolio_id": "b10f1cca", "ts_code": "600519.SH"},
        input_payload={"target_weight": 0.05},
        object_id="h-1",
        object_type="Holding",
    )
    assert path == "/api/portfolios/b10f1cca/stocks"


def test_input_wins_over_the_stale_object_value():
    assert (
        action_webhook.resolve_path(
            "/api/x/{status}",
            object_properties={"status": "watching"},
            input_payload={"status": "holding"},
            object_id=None,
            object_type=None,
        )
        == "/api/x/holding"
    )


def test_a_missing_placeholder_is_an_error_not_a_guess():
    with pytest.raises(ValueError, match="no value"):
        action_webhook.resolve_path(
            "/api/x/{missing}",
            object_properties={"a": 1},
            input_payload={},
            object_id=None,
            object_type=None,
        )


def test_placeholder_values_are_url_escaped():
    assert (
        action_webhook.resolve_path(
            "/api/x/{name}",
            object_properties={"name": "a/b c"},
            input_payload={},
            object_id=None,
            object_type=None,
        )
        == "/api/x/a%2Fb%20c"
    )


# --- where a Function-rule Action actually goes -----------------------------
def test_only_external_calls_in_the_source_are_reported():
    from app.services.ontology.function_external_usage import external_service_names

    source = """
from openkms_functions import Client, function

@function()
def execute(input, client: Client):
    rows = client("WorkItem").search(limit=1)
    a = client.external("turtle").post("/api/jobs", {})
    b = client.external( 'turtle' ).post("/api/jobs", {})
    c = client.external("otherService").get("/x")
    return {"a": a, "b": b, "c": c}
"""
    assert external_service_names(source) == ["otherService", "turtle"]
    assert external_service_names("") == []
    assert external_service_names("client.external('')") == []
