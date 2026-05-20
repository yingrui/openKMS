"""Smoke: OpenAPI exposes paginated agent message list shape."""

from __future__ import annotations


def test_openapi_includes_agent_message_list_response(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    spec = r.json()
    ref = spec.get("components", {}).get("schemas", {}).get("AgentMessageListResponse")
    assert ref is not None
    props = ref.get("properties", {})
    assert "items" in props and "total" in props and "limit" in props and "offset" in props
