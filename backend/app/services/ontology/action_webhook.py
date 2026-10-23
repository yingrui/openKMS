"""Deliver an executed Action to the application that owns the data.

The object/link change already happened in the ontology; the app behind it (a backtester, a
scheduler) needs to hear about it. Registering the destination **on the Action** — external service
+ path — makes that a platform behaviour instead of a bespoke Function, and puts the destination
where a reader can see it.

Two body shapes, because two receivers exist:

* ``envelope`` keeps the metadata (`action`, `applied`, `caller`, `log id`) so one receiver can serve
  every Action;
* ``object`` sends the object's own properties with the Action's input on top — the resource
  representation a REST endpoint already accepts, so the app keeps its API instead of growing a
  webhook-shaped one. Identity travels in headers.

Path placeholders (``/api/portfolios/{portfolio_id}/stocks``) resolve from the object's properties,
the input, and ``object_id`` / ``object_type``.

The envelope:

    {"event": "action.executed", "action": {...}, "object": {...} | null,
     "input": {...}, "applied": {...} | null, "caller": {...} | null,
     "status": "ok", "action_log_id": "al-…", "at": "…"}

Delivery is best-effort: the change is committed, so a failed webhook must not fail the Action. The
outcome is written next to the Action log (`output_payload.webhook`) and returned to the caller.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from urllib.parse import quote

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.external_service import ExternalService
from app.models.kubernetes_cluster import KubernetesCluster
from app.models.ontology_function import OntologyActionType
from app.services.boundaries import boundary
from app.services.ontology import external_calls

logger = logging.getLogger(__name__)

EVENT_NAME = "action.executed"


BODY_ENVELOPE = "envelope"
BODY_OBJECT = "object"
BODY_MODES = (BODY_ENVELOPE, BODY_OBJECT)

#: Header names that identify the event when the body is a bare resource representation.
EVENT_HEADER = "X-OpenKMS-Event"
OBJECT_TYPE_HEADER = "X-OpenKMS-Object-Type"
OBJECT_ID_HEADER = "X-OpenKMS-Object-Id"


def resolve_path(path: str, *, object_properties: dict | None, input_payload: dict | None,
                 object_id: str | None, object_type: str | None) -> str:
    """Fill `{field}` placeholders from the object, the input, and the object identity.

    A missing field raises: a half-substituted path would hit the wrong endpoint silently.
    """
    values: dict[str, str] = {
        str(k): str(v) for k, v in (object_properties or {}).items() if v is not None
    }
    values.update(
        {str(k): str(v) for k, v in (input_payload or {}).items() if v is not None}
    )
    if object_id:
        values["object_id"] = str(object_id)
    if object_type:
        values["object_type"] = object_type

    out: list[str] = []
    index = 0
    while index < len(path):
        char = path[index]
        if char == "{":
            end = path.find("}", index)
            if end == -1:
                raise ValueError(f"unclosed placeholder in path {path!r}")
            name = path[index + 1 : end]
            if name not in values:
                raise ValueError(
                    f"path placeholder {{{name}}} has no value on this object or input"
                )
            out.append(quote(values[name], safe=""))
            index = end + 1
            continue
        out.append(char)
        index += 1
    return "".join(out)


def build_object_body(
    *,
    object_properties: dict | None,
    input_payload: dict,
) -> dict:
    """The resource representation: the object's properties, with what the Action changed on top."""
    body = {k: v for k, v in (object_properties or {}).items() if v is not None}
    body.update({k: v for k, v in (input_payload or {}).items() if v is not None})
    return body


def build_payload(
    *,
    action: OntologyActionType,
    object_type_name: str | None,
    object_id: str | None,
    object_properties: dict | None,
    input_payload: dict,
    applied: dict | None,
    caller_user_id: str | None,
    caller_name: str | None,
    action_log_id: str,
) -> dict:
    """The envelope. Pure, so the contract is testable without a database."""
    return {
        "event": EVENT_NAME,
        "action": {
            "id": action.id,
            "api_name": action.api_name,
            "display_name": action.display_name,
            "rule_type": action.rule_type,
        },
        "object": (
            {
                "object_type": object_type_name,
                "id": object_id,
                "properties": object_properties or {},
            }
            if object_type_name and object_id
            else None
        ),
        "input": input_payload,
        "applied": applied,
        "caller": (
            {"sub": caller_user_id, "name": caller_name} if caller_user_id or caller_name else None
        ),
        "status": "ok",
        "action_log_id": action_log_id,
        "at": datetime.now(timezone.utc).isoformat(),
    }


async def deliver(
    db: AsyncSession,
    action: OntologyActionType,
    payload: dict,
) -> dict | None:
    """Post to the Action's registered webhook. Returns the outcome, or None if unset."""
    """Post the envelope to the Action's registered webhook. Returns the outcome, or None if unset.

    Never raises: the caller has already committed the object change.
    """
    if not action.webhook_service_id or not action.webhook_path:
        return None
    service = await db.get(ExternalService, action.webhook_service_id)
    if not service:
        return {"ok": False, "error": "the registered webhook service no longer exists"}
    mode = getattr(action, "webhook_body", BODY_ENVELOPE) or BODY_ENVELOPE
    obj = payload.get("object") or {}
    try:
        path = resolve_path(
            action.webhook_path,
            object_properties=obj.get("properties"),
            input_payload=payload.get("input"),
            object_id=obj.get("id"),
            object_type=obj.get("object_type"),
        )
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    if not external_calls.path_allowed(service, path):
        return {"ok": False, "error": f"path {path!r} is outside the service's allowed prefixes"}
    if mode == BODY_OBJECT:
        body = build_object_body(
            object_properties=obj.get("properties"), input_payload=payload.get("input") or {}
        )
    else:
        body = payload
    cluster = (
        await db.get(KubernetesCluster, service.cluster_id) if service.cluster_id else None
    )
    identity = {
        EVENT_HEADER: str(payload.get("event") or EVENT_NAME),
    }
    if obj.get("object_type"):
        identity[OBJECT_TYPE_HEADER] = str(obj["object_type"])
    if obj.get("id"):
        identity[OBJECT_ID_HEADER] = str(obj["id"])

    with boundary("deliver an Action webhook", logger=logger) as failed:
        status, response_body = await external_calls.call_service(
            service,
            cluster,
            method=(getattr(action, "webhook_method", None) or "POST").upper(),
            path=path,
            body=body,
            identity=identity,
        )
    if failed:
        return {"service": service.api_name, "path": path, "body": mode, "ok": False,
                "status": None, "error": str(failed[0])[:500]}
    return {
        "service": service.api_name,
        "method": (getattr(action, "webhook_method", None) or "POST").upper(),
        "path": path,
        "body": mode,
        "status": status,
        "ok": status < 400,
        "error": None
        if status < 400
        else response_body.decode("utf-8", errors="replace")[:500] or f"HTTP {status}",
    }
