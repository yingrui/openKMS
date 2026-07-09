"""Read-only Ontology HTTP client for Function authors."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

from openkms_functions.errors import OntologyApiError


class OntologyClient:
    def __init__(self, base_url: str, token: str):
        self._base = base_url.rstrip("/")
        self._token = token

    def _request(self, method: str, path: str, *, query: dict | None = None) -> object:
        url = f"{self._base}{path}"
        if query:
            qs = urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
            if qs:
                url = f"{url}?{qs}"
        req = urllib.request.Request(url, method=method)
        req.add_header("Authorization", f"Bearer {self._token}")
        req.add_header("Accept", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:2000]
            raise OntologyApiError(body or str(e), status_code=e.code) from e
        except urllib.error.URLError as e:
            raise OntologyApiError(str(e)) from e

    def _resolve_type_id(self, object_type_api_name: str) -> str:
        data = self._request("GET", "/api/object-types")
        items = data.get("items") or data if isinstance(data, list) else []
        for ot in items:
            if ot.get("name") == object_type_api_name or ot.get("id") == object_type_api_name:
                return ot["id"]
        raise OntologyApiError(f"Object type not found: {object_type_api_name}")

    def get_object(self, object_type_api_name: str, object_id: str) -> dict:
        type_id = self._resolve_type_id(object_type_api_name)
        data = self._request("GET", f"/api/object-types/{type_id}/objects/{object_id}")
        return data if isinstance(data, dict) else {"value": data}

    def search_objects(
        self,
        object_type_api_name: str,
        *,
        filter: dict | None = None,
        limit: int = 100,
    ) -> list[dict]:
        type_id = self._resolve_type_id(object_type_api_name)
        data = self._request(
            "GET",
            f"/api/object-types/{type_id}/objects",
            query={"limit": str(limit), "search": (filter or {}).get("search", "")},
        )
        items = data.get("items") if isinstance(data, dict) else data
        return list(items or [])

    def get_links(
        self,
        link_type_api_name: str,
        *,
        source_id: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        data = self._request("GET", "/api/link-types")
        items = data.get("items") or data if isinstance(data, list) else []
        link_type_id = None
        for lt in items:
            if lt.get("name") == link_type_api_name or lt.get("id") == link_type_api_name:
                link_type_id = lt["id"]
                break
        if not link_type_id:
            raise OntologyApiError(f"Link type not found: {link_type_api_name}")
        data = self._request(
            "GET",
            f"/api/link-types/{link_type_id}/links",
            query={"limit": str(limit)},
        )
        links = data.get("items") if isinstance(data, dict) else data
        result = list(links or [])
        if source_id:
            result = [l for l in result if l.get("source_id") == source_id or l.get("source_instance_id") == source_id]
        return result
