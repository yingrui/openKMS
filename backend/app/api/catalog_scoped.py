"""FastAPI dependencies for the **Catalog data plane**.

Catalog reads are decided by two **independent** grants, and this module is careful about which
one it checks where:

- **Model sharing** (`resource_type = 'semantic_model'`) — may this caller open the model, see its
  metrics, fields and relationships? Checked here, by `require_model_read`, and by nothing else.
- **Data resource grant** (`resource_type = 'data_resource'`) — within the model, which rows may
  this caller read? Checked per call in `resolve_catalog_scope`, when the data plane runs.

Keeping them apart is the point: a Catalog user can open a `restricted` model and see what a data
resource *would* give them without reading a restricted row, and a principal holding a grant can
query its slice. Requiring a resource grant to open the model made "look before you grant"
impossible — the model was un-openable until somebody had already been granted part of it.

`data:read` says "may open the Data Model page". Write paths (creating datasets, editing models,
configuring resources) stay on `data:write` — that *is* an operation permission.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.semantic_model import SemanticModel
from app.services.identity.acl.acl_resolve import check_resource_access
from app.services.identity.acl.resource_acl_constants import PERM_READ, RT_SEMANTIC_MODEL


def _subject(request: Request) -> tuple[dict, str | None]:
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    sub = payload.get("sub")
    return payload, sub if isinstance(sub, str) else None


async def require_model_read(model_id: str, request: Request, db: AsyncSession) -> None:
    """May this caller see the model's definition (fields, metrics, tables) and query it?

    Two separate questions, and only one of them is answered here:

    * **May this caller use the model at all?** Model sharing (`RT_SEMANTIC_MODEL`) — the same
      grant that lets them open any other securable resource. This is the gate.
    * **Which rows may they read?** `access_mode` plus a data-resource grant, decided per call in
      `resolve_catalog_scope` when the data plane runs.

    Keeping the row gate out of the metadata gate is what makes the two layers independent: a
    Catalog user can open the model, read its metrics and see what a data resource *would* give
    them, without being able to see a single restricted row. Requiring a resource grant here
    instead made a model un-openable until someone had already been granted a slice of it — which
    made "look before you grant" impossible.
    """
    model = await db.get(SemanticModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Semantic model not found")
    payload, sub = _subject(request)
    # Model sharing comes first: it answers "may this caller use the model at all". A model with
    # an ACL row is closed to callers outside its grants, whether or not it is `public` — the
    # `access_mode` below only decides the row scope within the model.
    if not await check_resource_access(
        db, payload, sub or "", RT_SEMANTIC_MODEL, model_id, PERM_READ
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "MODEL_FORBIDDEN",
                "message": "You do not have access to this semantic model.",
            },
        )


async def readable_model_ids(db: AsyncSession, *, payload: dict, sub: str | None) -> set[str]:
    """Model ids this caller may read: **model sharing only**, never the row scope.

    A restricted model still appears in a list — the caller may open it, read its metrics and
    relationships, and then be told which data resources exist. What they cannot do is read rows
    without a grant, and that is enforced per call in `resolve_catalog_scope`, not here.

    Hiding the model instead made the Catalog look empty to anyone who had not yet been granted a
    slice of it.
    """
    models = (await db.execute(select(SemanticModel))).scalars().all()
    out: set[str] = set()
    for model in models:
        if await check_resource_access(
            db, payload, sub or "", RT_SEMANTIC_MODEL, model.id, PERM_READ
        ):
            out.add(model.id)
    return out


def require_model_access(model_id_param: str = "model_id"):
    """Bind `require_model_read` to a path parameter (defaults to `model_id`)."""

    async def _check(
        request: Request,
        db: AsyncSession = Depends(get_db),
        _auth: str = Depends(require_auth),
    ) -> None:
        model_id = request.path_params.get(model_id_param)
        if not isinstance(model_id, str) or not model_id:
            raise HTTPException(status_code=400, detail="Missing model id")
        await require_model_read(model_id, request, db)

    return _check


async def require_metric_access(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(require_auth),
) -> None:
    """A metric route resolves its model first, then applies the same gate.

    Metrics belong to a model; gating them independently would let a caller read a restricted
    model's definitions through the metric endpoint.
    """
    from app.models.metric_definition import MetricDefinition

    metric_id = request.path_params.get("metric_id")
    if not isinstance(metric_id, str) or not metric_id:
        raise HTTPException(status_code=400, detail="Missing metric id")
    metric = await db.get(MetricDefinition, metric_id)
    if metric is None:
        raise HTTPException(status_code=404, detail="Metric not found")
    await require_model_read(metric.semantic_model_id, request, db)
