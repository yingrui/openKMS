"""The `query_objects` tool: read ontology objects as the caller, over the same API the SDK client uses.

It goes through HTTP rather than a service call on purpose. Permission checks live on the route (`ontology:read` plus
the object-type's ACL), so calling the service directly would execute the model's request with the platform's rights
instead of the person's. ofs already works this way for `client(...)`; a tool is the same shape of request.

The model never sees a raw table: only the properties the flow granted, capped by the tool's `limit`.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote, urlencode

import httpx

from app.services.ontology.function_runtime import function_client_base_url
from app.services.ontology.logic_runtime import FlowError, MAX_TOOL_LIMIT

TIMEOUT_S = 20.0


async def query_objects(
    *,
    caller_token: str,
    tool: dict,
    arguments: dict,
    base_url: str | None = None,
) -> list[dict[str, Any]]:
    """`search` / `filter` come from the model; `object_type` and `limit` come from the flow, never from the model."""
    object_type = str(tool.get("object_type") or "").strip()
    if not object_type:
        raise FlowError("query_objects tool has no object_type")
    limit = int(tool.get("limit") or 5)
    limit = max(1, min(limit, MAX_TOOL_LIMIT))

    search = arguments.get("search")
    filters = arguments.get("filter")
    if filters is not None and not isinstance(filters, dict):
        raise FlowError("filter must be an object of property equalities")

    query: dict[str, str] = {"limit": str(limit)}
    if isinstance(search, str) and search.strip():
        query["search"] = search.strip()
    for key, value in (filters or {}).items():
        if value is None or isinstance(value, (dict, list)):
            continue
        query[f"prop.{key}"] = str(value)

    base = (base_url or function_client_base_url()).rstrip("/")
    headers = {"Authorization": f"Bearer {caller_token}"} if caller_token else {}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            # The tool names an api_name, the objects route wants an id — same resolution the SDK client does.
            type_id = await _resolve_object_type_id(client, base, headers, object_type)
            resp = await client.get(
                f"{base}/api/object-types/{quote(type_id, safe='')}/objects?{urlencode(query)}",
                headers=headers,
            )
    except httpx.RequestError as e:
        raise FlowError(f"query_objects could not reach openKMS: {e}") from e

    if resp.status_code == 403:
        raise FlowError(f"not allowed to read '{object_type}'")
    if resp.status_code >= 400:
        detail = resp.text[:300]
        raise FlowError(f"query_objects failed ({resp.status_code}): {detail}")

    data = resp.json()
    items = data.get("items") if isinstance(data, dict) else data
    return [row for row in (items or []) if isinstance(row, dict)]


async def _resolve_object_type_id(
    client: httpx.AsyncClient, base: str, headers: dict[str, str], object_type: str
) -> str:
    """api_name first (the frozen identifier), then the display name, then the id — the SDK's own order."""
    resp = await client.get(f"{base}/api/object-types", headers=headers)
    if resp.status_code >= 400:
        detail = resp.text[:200]
        raise FlowError(f"query_objects could not list object types ({resp.status_code}): {detail}")
    data = resp.json()
    items = data.get("items") if isinstance(data, dict) else data
    rows = [row for row in (items or []) if isinstance(row, dict)]
    for match in (
        lambda row: row.get("api_name") == object_type,
        lambda row: row.get("name") == object_type,
        lambda row: row.get("id") == object_type,
    ):
        found = next((row.get("id") for row in rows if match(row)), None)
        if found:
            return str(found)
    raise FlowError(f"object type '{object_type}' not found")


def make_tool_runner(caller_token: str) -> Any:
    """`(tool, arguments) -> rows`, bound to one caller."""

    async def run(tool: dict, arguments: dict) -> list[dict[str, Any]]:
        return await query_objects(caller_token=caller_token, tool=tool, arguments=arguments)

    return run
