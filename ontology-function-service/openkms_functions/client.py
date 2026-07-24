"""Ontology HTTP client for Function authors."""

from __future__ import annotations

import inspect
import json
import urllib.error
import urllib.parse
import urllib.request

from openkms_functions.errors import OntologyApiError

CALL_DEPTH_HEADER = "X-OpenKMS-Function-Call-Depth"
CALL_STACK_HEADER = "X-OpenKMS-Function-Call-Stack"
HTTP_TIMEOUT_SECONDS = 30


class Client:
    """Unified OSDK client — ontology reads and published function calls."""

    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        call_depth: int = 0,
        call_stack: list[str] | None = None,
    ):
        self._base = base_url.rstrip("/")
        self._token = token
        self._call_depth = call_depth
        self._call_stack = list(call_stack or [])

    def __call__(self, entity: object) -> "ClientBound":
        """Palantir-style binding: client(Entity).method(...)."""
        return ClientBound(self, entity)

    def _request(
        self,
        method: str,
        path: str,
        *,
        query: dict | None = None,
        body: dict | None = None,
        extra_headers: dict | None = None,
    ) -> object:
        url = f"{self._base}{path}"
        if query:
            qs = urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
            if qs:
                url = f"{url}?{qs}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self._token}")
        req.add_header("Accept", "application/json")
        if body is not None:
            req.add_header("Content-Type", "application/json")
        for key, value in (extra_headers or {}).items():
            req.add_header(key, value)
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")[:2000]
            raise OntologyApiError(err_body or str(e), status_code=e.code) from e
        except urllib.error.URLError as e:
            raise OntologyApiError(str(e)) from e

    def _resolve_object_type_id(self, object_type_api_name: str) -> str:
        data = self._request("GET", "/api/object-types")
        items = data.get("items") if isinstance(data, dict) else data if isinstance(data, list) else []
        for ot in items:
            if ot.get("name") == object_type_api_name or ot.get("id") == object_type_api_name:
                return ot["id"]
        raise OntologyApiError(f"Object type not found: {object_type_api_name}")

    def _resolve_link_type_id(self, link_type_api_name: str) -> str:
        data = self._request("GET", "/api/link-types")
        items = data.get("items") if isinstance(data, dict) else data if isinstance(data, list) else []
        for lt in items:
            if lt.get("name") == link_type_api_name or lt.get("id") == link_type_api_name:
                return lt["id"]
        raise OntologyApiError(f"Link type not found: {link_type_api_name}")

    def get_object(self, object_type_api_name: str, object_id: str) -> dict:
        type_id = self._resolve_object_type_id(object_type_api_name)
        data = self._request("GET", f"/api/object-types/{type_id}/objects/{object_id}")
        return data if isinstance(data, dict) else {"value": data}

    def search_objects(
        self,
        object_type_api_name: str,
        *,
        filters: dict | None = None,
        limit: int = 100,
    ) -> list[dict]:
        type_id = self._resolve_object_type_id(object_type_api_name)
        data = self._request(
            "GET",
            f"/api/object-types/{type_id}/objects",
            query={"limit": str(limit), "search": (filters or {}).get("search", "")},
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
        link_type_id = self._resolve_link_type_id(link_type_api_name)
        data = self._request(
            "GET",
            f"/api/link-types/{link_type_id}/links",
            query={"limit": str(limit)},
        )
        links = data.get("items") if isinstance(data, dict) else data
        result = list(links or [])
        if source_id:
            result = [
                link
                for link in result
                if link.get("source_id") == source_id or link.get("source_instance_id") == source_id
            ]
        return result

    def execute_function(self, api_name: str, params: dict | None = None) -> dict:
        """Call a published function by api_name (function composition)."""
        stack = ",".join(self._call_stack)
        data = self._request(
            "POST",
            f"/api/ontology/functions/by-api-name/{urllib.parse.quote(api_name, safe='')}/execute",
            body={"input": params or {}, "use_published": True},
            extra_headers={
                CALL_DEPTH_HEADER: str(self._call_depth + 1),
                CALL_STACK_HEADER: stack,
            },
        )
        if not isinstance(data, dict):
            raise OntologyApiError("Invalid execute response")
        if data.get("status") != "ok":
            raise OntologyApiError(data.get("error") or "Function execution failed")
        output = data.get("output")
        return output if isinstance(output, dict) else {"result": output}


# Backward-compatible alias
OntologyClient = Client


class ClientBound:
    """Bound entity operations for client(Entity) invocations."""

    def __init__(self, client: Client, entity: object):
        self._client = client
        self._entity = entity

    def _api_name(self) -> str:
        if isinstance(self._entity, str):
            return self._entity
        if hasattr(self._entity, "api_name"):
            return str(getattr(self._entity, "api_name"))
        if hasattr(self._entity, "API_NAME"):
            return str(getattr(self._entity, "API_NAME"))
        raise OntologyApiError("Entity has no api_name")

    def fetch_one(self, object_id: str) -> dict:
        return self._client.get_object(self._api_name(), object_id)

    def search(self, *, filters: dict | None = None, limit: int = 100) -> list[dict]:
        return self._client.search_objects(self._api_name(), filters=filters, limit=limit)

    def execute_function(self, params: dict | None = None) -> dict:
        return self._client.execute_function(self._api_name(), params)
