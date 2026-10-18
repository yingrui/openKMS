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
