"""Deliver an executed Action to the application that owns the data.

The object/link change already happened in the ontology; the app behind it (a backtester, a
scheduler) needs to hear about it. Registering the destination **on the Action** — external service
+ path — makes that a platform behaviour instead of a bespoke Function, and puts the destination
where a reader can see it.

The payload is a fixed envelope, not the Action's own output shape, so one receiver can serve every
Action:

    {"event": "action.executed", "action": {...}, "object": {...} | null,
     "input": {...}, "applied": {...} | null, "caller": {...} | null,
     "status": "ok", "action_log_id": "al-…", "at": "…"}

Delivery is best-effort: the change is committed, so a failed webhook must not fail the Action. The
outcome is written next to the Action log (`output_payload.webhook`) and returned to the caller.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.external_service import ExternalService
from app.models.kubernetes_cluster import KubernetesCluster
from app.models.ontology_function import OntologyActionType
from app.services.boundaries import boundary
from app.services.ontology import external_calls

logger = logging.getLogger(__name__)

EVENT_NAME = "action.executed"


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
    """Post the envelope to the Action's registered webhook. Returns the outcome, or None if unset.

    Never raises: the caller has already committed the object change.
    """
    if not action.webhook_service_id or not action.webhook_path:
        return None
    service = await db.get(ExternalService, action.webhook_service_id)
    if not service:
        return {"ok": False, "error": "the registered webhook service no longer exists"}
    if not external_calls.path_allowed(service, action.webhook_path):
        return {
            "ok": False,
            "error": f"path {action.webhook_path!r} is outside the service's allowed prefixes",
        }
    cluster = (
        await db.get(KubernetesCluster, service.cluster_id) if service.cluster_id else None
    )
    with boundary("deliver an Action webhook", logger=logger) as failed:
        status, body = await external_calls.call_service(
            service,
            cluster,
            method="POST",
            path=action.webhook_path,
            body=payload,
        )
    if failed:
        return {"ok": False, "error": str(failed[0])[:500]}
    return {
        "service": service.api_name,
        "path": action.webhook_path,
        "status": status,
        "ok": status < 400,
        "error": None
        if status < 400
        else body.decode("utf-8", errors="replace")[:500] or f"HTTP {status}",
    }
