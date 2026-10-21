"""Ontology HTTP client for Function authors."""

from __future__ import annotations

import inspect
import json
import urllib.error
import urllib.parse
import urllib.request

from openkms_functions.errors import OntologyApiError
from openkms_functions.external import ExternalService

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
        self._externals: dict[str, ExternalService] = {}

    def __call__(self, entity: object) -> "ClientBound":
        """Palantir-style binding: client(Entity).method(...)."""
        return ClientBound(self, entity)

    def external(self, api_name: str) -> ExternalService:
        """A registered external service, e.g. `client.external("turtle").post(...)`.

        Resolved once per run (the registry holds the URL, credential and allowed path prefixes);
        the Function source never sees the secret. An unknown name raises at first use.
        """
        service = self._externals.get(api_name)
        if service is None:
            service = ExternalService(self, self.resolve_external_service(api_name))
            self._externals[api_name] = service
        return service

    def resolve_external_service(self, api_name: str) -> dict:
        data = self._request(
            "POST",
            f"/api/ontology/external-services/by-api-name/{urllib.parse.quote(api_name, safe='')}/resolve",
        )
        if not isinstance(data, dict):
            raise OntologyApiError(f"Invalid external service resolution for {api_name!r}")
        return data

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

    @staticmethod
    def _match_entity(items: list, api_name: str) -> str | None:
        """`api_name` first (the frozen identifier), then the display name, then the id.

        The display-name match keeps Functions written before api_name existed working; the id
        match is what an agent with only an id can use.
        """
        for item in items:
            if item.get("api_name") == api_name:
                return item["id"]
        for item in items:
            if item.get("name") == api_name:
                return item["id"]
        for item in items:
            if item.get("id") == api_name:
                return item["id"]
        return None

    def _resolve_object_type_id(self, object_type_api_name: str) -> str:
        data = self._request("GET", "/api/object-types")
        items = data.get("items") if isinstance(data, dict) else data if isinstance(data, list) else []
        type_id = self._match_entity(list(items or []), object_type_api_name)
        if type_id is None:
            raise OntologyApiError(f"Object type not found: {object_type_api_name}")
        return type_id

    def _resolve_link_type_id(self, link_type_api_name: str) -> str:
        data = self._request("GET", "/api/link-types")
        items = data.get("items") if isinstance(data, dict) else data if isinstance(data, list) else []
        type_id = self._match_entity(list(items or []), link_type_api_name)
        if type_id is None:
            raise OntologyApiError(f"Link type not found: {link_type_api_name}")
        return type_id

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
        query: dict[str, str] = {"limit": str(limit)}
        for key, value in (filters or {}).items():
            if value is None:
                continue
            if key == "search":
                query["search"] = str(value)
            else:
                query[f"prop.{key}"] = str(value)
        data = self._request(
            "GET",
            f"/api/object-types/{type_id}/objects",
            query=query,
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
        query: dict[str, str] = {"limit": str(limit)}
        if source_id:
            query["source_object_id"] = source_id
        data = self._request(
            "GET",
            f"/api/link-types/{link_type_id}/links",
            query=query,
        )
        links = data.get("items") if isinstance(data, dict) else data
        return list(links or [])

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
