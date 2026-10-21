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
