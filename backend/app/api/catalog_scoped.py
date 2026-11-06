"""FastAPI dependencies for the **Catalog data plane**.

Catalog reads — a model's fields/metrics, answering a query, running SQL Lab — are decided
by the **data resource grant**, not by an operation key. `data:read` says "may open the Data
Model page"; it does not say "may read these rows". Keeping them separate is the whole point:

- a principal with a grant can query the slice without being a Catalog user;
- a principal with `data:read` can administer the Catalog without seeing restricted rows;
- a **public** model is readable by any authenticated principal, which is what "public"
  means and is a deliberate decision, not an accident of a missing check.

Write paths (creating datasets, editing models, configuring resources) stay on
`data:write` — that *is* an operation permission.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.semantic_model import SemanticModel
from app.services.acl.acl_resolve import check_resource_access
from app.services.acl.resource_acl_constants import PERM_READ, RT_SEMANTIC_MODEL
from app.services.data_layer.catalog_access import has_model_grant


def _subject(request: Request) -> tuple[dict, str | None]:
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    sub = payload.get("sub")
    return payload, sub if isinstance(sub, str) else None


async def require_model_read(model_id: str, request: Request, db: AsyncSession) -> None:
    """May this caller see the model's definition (fields, metrics, tables) and query it?

    Public model → any authenticated caller. Restricted model → only with a read grant on one of
    its data resources. Being an admin, or holding `data:read`, is **not** sufficient.
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
    if not model.is_restricted:
        return
    if await has_model_grant(db, payload=payload, sub=sub, model_id=model_id):
        return
    raise HTTPException(
        status_code=403,
        detail={
            "code": "MODEL_FORBIDDEN",
            "message": "This semantic model is restricted and no data resource is granted to you.",
        },
    )


async def readable_model_ids(db: AsyncSession, *, payload: dict, sub: str | None) -> set[str]:
    """Model ids this caller may read — the same two gates as `require_model_read`.

    Model sharing first (an ACL row closes the model to non-grantees), then the row scope
    (`access_mode`). A list endpoint must apply both: showing a model the caller cannot open
    turns a click into a 403, and hiding one they *can* open makes the Catalog look empty.
    """
    models = (await db.execute(select(SemanticModel))).scalars().all()
    out: set[str] = set()
    for model in models:
        if not await check_resource_access(
            db, payload, sub or "", RT_SEMANTIC_MODEL, model.id, PERM_READ
        ):
            continue
        if not model.is_restricted:
            out.add(model.id)
        elif sub and await has_model_grant(db, payload=payload, sub=sub, model_id=model.id):
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
