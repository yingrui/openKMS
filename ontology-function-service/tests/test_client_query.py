"""Tests for ofs Client search_objects / get_links query wiring."""

from __future__ import annotations

from openkms_functions.client import Client


class _FakeClient(Client):
    def __init__(self):
        super().__init__("http://example.test", "tok")
        self.calls: list[tuple[str, str, dict | None]] = []

    def _request(self, method, path, *, query=None, body=None, extra_headers=None):
        self.calls.append((method, path, query))
        if path == "/api/object-types":
            return {"items": [{"id": "ot-1", "name": "WorkItem"}]}
        if path == "/api/link-types":
            return {"items": [{"id": "lt-1", "name": "dependsOn"}]}
        if "/objects" in path:
            return {"items": [{"id": "a", "data": {"status": "open"}}]}
        if "/links" in path:
            return {
                "items": [
                    {
                        "id": "l1",
                        "source_object_id": "wi-1",
                        "target_object_id": "wi-2",
                    }
                ]
            }
        return {}


def test_search_objects_forwards_prop_filters():
    c = _FakeClient()
    items = c.search_objects("WorkItem", filters={"status": "in_progress", "search": "bug"}, limit=50)
    assert len(items) == 1
    method, path, query = c.calls[-1]
    assert method == "GET"
    assert path.endswith("/objects")
    assert query == {
        "limit": "50",
        "search": "bug",
        "prop.status": "in_progress",
    }


def test_get_links_passes_source_object_id():
    c = _FakeClient()
    links = c.get_links("dependsOn", source_id="wi-1", limit=20)
    assert len(links) == 1
    method, path, query = c.calls[-1]
    assert method == "GET"
    assert path.endswith("/links")
    assert query == {"limit": "20", "source_object_id": "wi-1"}


def test_api_name_wins_over_a_stale_display_name():
    """The frozen identifier is what a Function should match, even after a display rename."""

    class _Renamed(_FakeClient):
        def _request(self, method, path, *, query=None, body=None, extra_headers=None):
            self.calls.append((method, path, query))
            if path == "/api/object-types":
                return {"items": [{"id": "ot-1", "api_name": "WorkItem", "name": "Task"}]}
            if "/objects" in path:
                return {"id": "wi-1", "data": {"status": "open"}}
            return {}

    c = _Renamed()
    assert c.get_object("WorkItem", "wi-1")["id"] == "wi-1"


def test_display_name_match_keeps_legacy_functions_working():
    """Rows created before api_name existed have `api_name: null` and resolve by name."""

    class _Legacy(_FakeClient):
        def _request(self, method, path, *, query=None, body=None, extra_headers=None):
            self.calls.append((method, path, query))
            if path == "/api/object-types":
                return {"items": [{"id": "ot-1", "api_name": None, "name": "WorkItem"}]}
            if "/objects" in path:
                return {"id": "wi-1", "data": {}}
            return {}

    c = _Legacy()
    assert c.get_object("WorkItem", "wi-1")["id"] == "wi-1"


def test_a_uuid_still_resolves():
    class _ById(_FakeClient):
        def _request(self, method, path, *, query=None, body=None, extra_headers=None):
            self.calls.append((method, path, query))
            if path == "/api/object-types":
                return {"items": [{"id": "536033d0", "api_name": "Stock", "name": "股票"}]}
            if "/objects" in path:
                return {"id": "536033d0", "data": {}}
            return {}

    c = _ById()
    assert c.get_object("536033d0", "x")["id"] == "536033d0"


# --- external services ------------------------------------------------------
def test_external_service_is_resolved_once_and_sends_the_credential(monkeypatch):
    """The source names a service; the registry supplies URL + secret; the sandbox sends it."""
    import json as _json
    import urllib.request as _urllib

    calls: list[tuple[str, dict]] = []
    sent: list[_urllib.Request] = []

    def _fake_urlopen(req, timeout=None):
        sent.append(req)

        class _Resp:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def read(self):
                return _json.dumps({"ok": True, "id": "job-1"}).encode()

        return _Resp()

    monkeypatch.setattr(_urllib, "urlopen", _fake_urlopen)

    class _C(Client):
        def _request(self, method, path, *, query=None, body=None, extra_headers=None):
            calls.append((method, path, query))
            return {
                "api_name": "turtle",
                "base_url": "http://backend:8200",
                "auth_kind": "bearer",
                "secret": "s3cret",
                "allowed_paths": ["/api/jobs"],
                "timeout_seconds": 5,
            }

    c = _C("http://example.test", "tok")
    out = c.external("turtle").post("/api/jobs", {"type": "simulation"})
    assert out == {"ok": True, "id": "job-1"}
    assert len(calls) == 1 and "/external-services/by-api-name/turtle/resolve" in calls[0][1]
    assert sent[0].full_url == "http://backend:8200/api/jobs"
    assert sent[0].get_header("Authorization") == "Bearer s3cret"
    # Second use reuses the resolution.
    c.external("turtle").post("/api/jobs", {})
    assert len(calls) == 1


def test_external_service_refuses_a_path_outside_the_allowlist():
    from openkms_functions.errors import OntologyApiError
    from openkms_functions.external import ExternalService

    svc = ExternalService(
        None,
        {
            "api_name": "turtle",
            "base_url": "http://backend:8200",
            "allowed_paths": ["/api/jobs"],
        },
    )
    try:
        svc.post("/api/portfolios", {})
    except OntologyApiError as e:
        assert "not in the allowed prefixes" in str(e)
    else:
        raise AssertionError("expected the allowlist to refuse a foreign path")


def test_external_service_refuses_an_absolute_url():
    from openkms_functions.errors import OntologyApiError
    from openkms_functions.external import ExternalService

    svc = ExternalService(
        None,
        {"api_name": "turtle", "base_url": "http://backend:8200", "allowed_paths": ["/api/"]},
    )
    try:
        svc.get("http://evil.test/api/x")
    except OntologyApiError as e:
        assert "must start with '/'" in str(e)
    else:
        raise AssertionError("expected an absolute URL to be refused")


def test_a_k8s_service_is_relayed_through_the_backend(monkeypatch):
    """The sandbox cannot resolve a cluster Service, so the backend makes that call."""
    calls: list[tuple[str, str, dict]] = []
    bodies: list[dict] = []

    class _C(Client):
        def _request(self, method, path, *, query=None, body=None, extra_headers=None):
            calls.append((method, path, body))
            if path.endswith("/resolve"):
                return {
                    "api_name": "turtle",
                    "kind": "k8s_service",
                    "transport": "backend",
                    "auth_kind": "hmac",
                    "secret": None,
                    "allowed_paths": ["/api/jobs"],
                    "timeout_seconds": 10,
                }
            bodies.append(body or {})
            return {"status": 201, "body": {"id": "job-7"}}

    c = _C("http://example.test", "tok")
    out = c.external("turtle").post("/api/jobs", {"type": "simulation"})
    assert out == {"id": "job-7"}
    assert calls[-1][1].endswith("/by-api-name/turtle/call")
    assert bodies[-1] == {
        "method": "POST",
        "path": "/api/jobs",
        "query": None,
        "body": {"type": "simulation"},
    }


def test_a_relayed_error_becomes_an_ontology_error():
    from openkms_functions.errors import OntologyApiError

    class _C(Client):
        def _request(self, method, path, *, query=None, body=None, extra_headers=None):
            if path.endswith("/resolve"):
                return {
                    "api_name": "turtle",
                    "kind": "k8s_service",
                    "transport": "backend",
                    "allowed_paths": ["/api/jobs"],
                }
            return {"status": 500, "body": {"detail": "boom"}}

    c = _C("http://example.test", "tok")
    try:
        c.external("turtle").post("/api/jobs", {})
    except OntologyApiError as e:
        assert e.status_code == 500
        assert "boom" in str(e)
    else:
        raise AssertionError("expected the relayed failure to raise")


def test_the_allowlist_also_guards_relayed_calls():
    from openkms_functions.errors import OntologyApiError
    from openkms_functions.external import ExternalService

    svc = ExternalService(
        None,
        {
            "api_name": "turtle",
            "kind": "k8s_service",
            "transport": "backend",
            "allowed_paths": ["/api/jobs"],
        },
    )
    try:
        svc.get("/api/portfolios")
    except OntologyApiError as e:
        assert "not in the allowed prefixes" in str(e)
    else:
        raise AssertionError("expected the allowlist to refuse a foreign path")
