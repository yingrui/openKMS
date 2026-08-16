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
