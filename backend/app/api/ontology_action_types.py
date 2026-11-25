"""Ontology Action Types API."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.api.ontology.deps import jwt_user_from_request, require_caller_token, validate_api_name
from app.database import get_db
from app.models.external_service import ExternalService
from app.models.link_type import LinkType
from app.models.object_type import ObjectType
from app.models.ontology_function import OntologyActionLog, OntologyActionType
from app.schemas.ontology_functions import (
    ActionApplicability,
    ActionApplicabilityRequest,
    OntologyActionWebhookState,
    OntologyActionBatchItem,
    OntologyActionBatchRequest,
    OntologyActionBatchResponse,
    OntologyActionExecuteRequest,
    OntologyActionExecuteResponse,
    OntologyActionLogResponse,
    OntologyActionTypeCreate,
    OntologyActionTypeResponse,
    OntologyActionTypeUpdate,
)
from app.services.ontology.constants import ACTION_TYPE_ID_PREFIX, ID_HEX_LENGTH
from app.services.ontology.action_rule_types import is_builtin_object_rule, normalize_rule_type
from app.services.ontology import action_webhook, execution_service
from app.services.ontology.function_external_usage import function_external_services
from app.services.ontology.builtin_action_service import (
    input_schema_for_action,
    object_param_map,
    object_ref_params,
    submission_criteria,
)
from app.services.ontology.input_schema import validate_input_against_schema
from app.services.ontology.object_query import QueryError, parse_filter
from app.services.ontology.neo4j_async import NEO4J_ERRORS
from app.services.ontology.object_neo4j_store import (
    get_first_neo4j_datasource,
    ids_satisfying,
    link_rel_type,
    object_label,
    refresh_object_type_from_source,
    resolve_id_properties,
    resolve_object_props_for_action,
    run_with_neo4j_driver,
)
from app.services.identity.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE

router = APIRouter(prefix="/ontology/action-types", tags=["ontology-action-types"], dependencies=[Depends(require_auth)])


async def _resolve_input_schema(db: AsyncSession, at: OntologyActionType) -> dict | None:
    if is_builtin_object_rule(at.rule_type):
        ot = await db.get(ObjectType, at.object_type_id)
        if not ot:
            return None
        return input_schema_for_action(at, ot)
    if not at.function_id:
        return None
    try:
        _, ver = await execution_service.resolve_published_version_for_function(
            db, at.function_id, pinned_version=at.function_version
        )
    except ValueError:
        return None
    return ver.input_schema if isinstance(ver.input_schema, dict) else None


WEBHOOK_METHODS = ("POST", "PUT", "PATCH", "DELETE", "GET")


def _validate_webhook_method(method: str | None) -> None:
    if method is None:
        return
    if method.upper() not in WEBHOOK_METHODS:
        raise HTTPException(
            status_code=400, detail=f"webhook_method must be one of {WEBHOOK_METHODS}"
        )


def _validate_webhook_body(mode: str | None) -> None:
    if mode is None:
        return
    if mode not in action_webhook.BODY_MODES:
        raise HTTPException(
            status_code=400, detail=f"webhook_body must be one of {action_webhook.BODY_MODES}"
        )


def _caller_name(request: Request) -> str | None:
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    name = payload.get("preferred_username") or payload.get("name")
    return str(name) if name else None


async def _webhook_service_name(db: AsyncSession, service_id: str | None) -> str | None:
    if not service_id:
        return None
    service = await db.get(ExternalService, service_id)
    return service.api_name if service else None


async def _validate_webhook(
    db: AsyncSession, *, service_id: str | None, path: str | None
) -> None:
    """A path without a service (or one outside its allowlist) is a webhook that never lands."""
    if not service_id and not path:
        return
    if not service_id:
        raise HTTPException(status_code=400, detail="webhook_path needs webhook_service_id")
    service = await db.get(ExternalService, service_id)
    if not service:
        raise HTTPException(status_code=400, detail="Unknown webhook service")
    if not path:
        return
    if not path.startswith("/") or "://" in path:
        raise HTTPException(status_code=400, detail="webhook_path must start with '/' and be relative")
    if not any(path.startswith(prefix) for prefix in (service.allowed_paths or [])):
        raise HTTPException(
            status_code=400,
            detail=f"webhook_path {path!r} is not in the service's allowed prefixes {service.allowed_paths}",
        )


async def _last_webhook_states(
    db: AsyncSession, action_ids: list[str]
) -> dict[str, OntologyActionWebhookState]:
    """Newest delivery attempt per Action — one query, DISTINCT ON, no N+1 on the list page."""
    if not action_ids:
        return {}
    rows = (
        await db.execute(
            select(
                OntologyActionLog.action_type_id,
                OntologyActionLog.webhook_ok,
                OntologyActionLog.webhook_status,
                OntologyActionLog.webhook_error,
                OntologyActionLog.created_at,
            )
            .where(
                OntologyActionLog.action_type_id.in_(action_ids),
                OntologyActionLog.webhook_ok.isnot(None),
            )
            .order_by(OntologyActionLog.action_type_id, OntologyActionLog.created_at.desc())
            .distinct(OntologyActionLog.action_type_id)
        )
    ).all()
    return {
        row.action_type_id: OntologyActionWebhookState(
            ok=bool(row.webhook_ok),
            status=row.webhook_status,
            error=row.webhook_error,
            at=row.created_at,
        )
        for row in rows
    }


async def _to_response(
    db: AsyncSession,
    at: OntologyActionType,
    *,
    last_webhook: OntologyActionWebhookState | None = None,
) -> OntologyActionTypeResponse:
    return OntologyActionTypeResponse(
        id=at.id,
        api_name=at.api_name,
        display_name=at.display_name,
        description=at.description,
        object_type_id=at.object_type_id,
        rule_type=at.rule_type,
        function_id=at.function_id,
        function_version=at.function_version,
        parameters=at.parameters,
        webhook_service_id=at.webhook_service_id,
        webhook_service_name=await _webhook_service_name(db, at.webhook_service_id),
        webhook_path=at.webhook_path,
        webhook_body=getattr(at, "webhook_body", None) or "envelope",
        webhook_method=getattr(at, "webhook_method", None) or "POST",
        function_external_services=(
            await function_external_services(db, at.function_id) if at.function_id else []
        ),
        last_webhook=last_webhook,
        status=at.status,
        created_at=at.created_at,
        updated_at=at.updated_at,
        input_schema=await _resolve_input_schema(db, at),
    )


async def _get_action_type(db: AsyncSession, action_type_id: str) -> OntologyActionType:
    at = (await db.execute(select(OntologyActionType).where(OntologyActionType.id == action_type_id))).scalar_one_or_none()
    if not at:
        raise HTTPException(status_code=404, detail="Action type not found")
    return at


def _validate_action_type_fields(
    *,
    rule_type: str,
    function_id: str | None,
) -> None:
    try:
        rt = normalize_rule_type(rule_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if is_builtin_object_rule(rt) and function_id:
        raise HTTPException(
            status_code=400,
            detail="Built-in object actions cannot bind a function",
        )


@router.get("", response_model=list[OntologyActionTypeResponse])
async def list_action_types(
    object_type_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    q = select(OntologyActionType).order_by(OntologyActionType.api_name)
    if object_type_id:
        q = q.where(OntologyActionType.object_type_id == object_type_id)
    rows = (await db.execute(q)).scalars().all()
    states = await _last_webhook_states(db, [r.id for r in rows])
    return [await _to_response(db, r, last_webhook=states.get(r.id)) for r in rows]


@router.get("/{action_type_id}", response_model=OntologyActionTypeResponse)
async def get_action_type(
    action_type_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    at = await _get_action_type(db, action_type_id)
    return await _to_response(db, at, last_webhook=(await _last_webhook_states(db, [at.id])).get(at.id))


@router.post("", response_model=OntologyActionTypeResponse, status_code=201)
async def create_action_type(
    body: OntologyActionTypeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    validate_api_name(body.api_name)
    _validate_action_type_fields(rule_type=body.rule_type, function_id=body.function_id)
    exists = (
        await db.execute(select(OntologyActionType.id).where(OntologyActionType.api_name == body.api_name))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="api_name already exists")
    _validate_webhook_body(body.webhook_body)
    _validate_webhook_method(body.webhook_method)
    await _validate_webhook(
        db, service_id=body.webhook_service_id, path=body.webhook_path
    )
    uid, uname = jwt_user_from_request(request)
    at = OntologyActionType(
        id=f"{ACTION_TYPE_ID_PREFIX}{uuid.uuid4().hex[:ID_HEX_LENGTH]}",
        api_name=body.api_name,
        display_name=body.display_name,
        description=body.description,
        object_type_id=body.object_type_id,
        rule_type=body.rule_type,
        function_id=body.function_id,
        function_version=body.function_version,
        parameters=body.parameters,
        webhook_service_id=body.webhook_service_id,
        webhook_path=(body.webhook_path or "").strip() or None,
        webhook_body=body.webhook_body,
        webhook_method=body.webhook_method.upper(),
        created_by=uid,
        created_by_name=uname,
    )
    db.add(at)
    await db.commit()
    await db.refresh(at)
    return await _to_response(db, at)


@router.patch("/{action_type_id}", response_model=OntologyActionTypeResponse)
async def update_action_type(
    action_type_id: str,
    body: OntologyActionTypeUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    at = await _get_action_type(db, action_type_id)
    data = body.model_dump(exclude_unset=True)
    next_rule_type = data.get("rule_type", at.rule_type)
    if "function_id" in data:
        next_function_id = data["function_id"]
    elif "rule_type" in data and is_builtin_object_rule(data["rule_type"]):
        # Converting to built-in CRUD clears any prior Function binding.
        next_function_id = None
    else:
        next_function_id = at.function_id
    if "rule_type" in data or "function_id" in data:
        _validate_action_type_fields(rule_type=next_rule_type, function_id=next_function_id)
    if "webhook_body" in data:
        _validate_webhook_body(data["webhook_body"])
    if "webhook_method" in data and data["webhook_method"]:
        _validate_webhook_method(data["webhook_method"])
        data["webhook_method"] = data["webhook_method"].upper()
    if "webhook_service_id" in data or "webhook_path" in data:
        await _validate_webhook(
            db,
            service_id=data.get("webhook_service_id", at.webhook_service_id),
            path=data.get("webhook_path", at.webhook_path),
        )
    for field, val in data.items():
        setattr(at, field, val)
    if "rule_type" in data and is_builtin_object_rule(data["rule_type"]) and "function_id" not in data:
        at.function_id = None
        at.function_version = None
    await db.commit()
    await db.refresh(at)
    return await _to_response(db, at)


@router.delete("/{action_type_id}", status_code=204)
async def delete_action_type(
    action_type_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    at = await _get_action_type(db, action_type_id)
    await db.delete(at)
    await db.commit()


async def _satisfies_criteria(
    db: AsyncSession, at: OntologyActionType, object_id: str, criteria: list[str]
) -> bool:
    """Whether one object may take this action, asked of the graph in one query."""
    obj_type = await db.get(ObjectType, at.object_type_id)
    if obj_type is None:
        return False
    neo4j_ds = await get_first_neo4j_datasource(db)
    if not neo4j_ds:
        return True
    try:
        filters = [parse_filter(text) for text in criteria]
    except QueryError:
        return False
    link_info = await _link_info(db, obj_type)
    label = object_label(obj_type)
    columns = resolve_id_properties(obj_type)
    satisfying = await run_with_neo4j_driver(
        neo4j_ds,
        lambda driver: ids_satisfying(driver, label, columns, [object_id], filters, link_info),
    )
    return object_id in satisfying


async def _link_info(db: AsyncSession, obj_type: ObjectType) -> dict[str, tuple[str, str]]:
    """`link api_name → (rel type, direction)` — the shape every object query here expects."""
    links = (
        await db.execute(
            select(LinkType).where(
                or_(
                    LinkType.source_object_type_id == obj_type.id,
                    LinkType.target_object_type_id == obj_type.id,
                )
            )
        )
    ).scalars().all()
    info: dict[str, tuple[str, str]] = {}
    for link in links:
        direction = "out" if link.source_object_type_id == obj_type.id else "in"
        rel = link_rel_type(link)
        for key in (link.api_name, link.id):
            if key:
                info[key] = (rel, direction)
    return info


async def _annotate_object_refs(
    db: AsyncSession, schema: dict | None, at: OntologyActionType
) -> dict | None:
    """Mark reference parameters in the schema so the form can offer a picker instead of a text box.

    The form has no way to know that `product_code` is a Product; the action says so, and this puts the type, its id
    and the property that carries the value into the schema the client already receives.
    """
    refs = object_ref_params(at.parameters)
    if not schema or not refs:
        return schema
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return schema
    for param, spec in refs.items():
        entry = properties.get(param)
        if not isinstance(entry, dict):
            continue
        target = (
            await db.execute(select(ObjectType).where(ObjectType.name == spec["type"]))
        ).scalars().first()
        if target is None:
            continue
        entry["object_ref"] = {
            "type_id": target.id,
            "type_name": target.name,
            "property": spec["property"] or (target.key_properties or ["id"])[0],
            "label_property": target.display_property or (target.key_properties or ["id"])[0],
            "many": bool(spec.get("many")),
        }
        if spec.get("many"):
            entry["type"] = "array"
    return schema


async def _validate_object_refs(
    db: AsyncSession, at: OntologyActionType, payload: dict
) -> str | None:
    """Why a referenced value is not an object of the declared type, or None when every one is.

    A reference that cannot be resolved is a typing mistake, and the function would only discover it after its own
    work started — so it is answered here, naming the parameter and the value.
    """
    refs = object_ref_params(at.parameters)
    if not refs:
        return None
    neo4j_ds = await get_first_neo4j_datasource(db)
    for param, spec in refs.items():
        value = payload.get(param)
        if value in (None, "", []):
            continue
        values = value if isinstance(value, list) else [value]
        target = (
            await db.execute(select(ObjectType).where(ObjectType.name == spec["type"]))
        ).scalars().first()
        if target is None:
            return f"`{param}` refers to an unknown object type `{spec['type']}`"
        property_name = spec["property"] or (target.key_properties or ["id"])[0]
        if not neo4j_ds:
            continue
        label = object_label(target)
        wanted = [str(entry) for entry in values]
        found = await run_with_neo4j_driver(
            neo4j_ds,
            lambda driver, label=label, prop=property_name, vals=wanted: {
                str(record["v"])
                for record in driver.session().run(
                    f"MATCH (n:{label}) WHERE toString(n.`{prop}`) IN $vals RETURN DISTINCT toString(n.`{prop}`) AS v",
                    vals=vals,
                )
            },
        )
        missing = [entry for entry in wanted if entry not in found]
        if missing:
            return f"`{param}`: no {target.name} has {property_name} = {missing[0]!r}"
    return None


async def _refresh_after_action(
    db: AsyncSession, at: OntologyActionType, result: OntologyActionExecuteResponse | None
) -> bool:
    """Make the write visible to the reader.

    A Function-rule Action writes through a downstream service into the **source table**, while the object layer
    reads the graph. Built-in edits merge the ids they touched; a Function's effects are opaque, so the type is
    re-read — otherwise the exploration that just acted reports that nothing changed.
    """
    if result is not None and result.status != "ok":
        return False
    if is_builtin_object_rule(at.rule_type):
        return False
    obj_type = await db.get(ObjectType, at.object_type_id)
    if obj_type is None:
        return False
    try:
        return await refresh_object_type_from_source(db, obj_type)
    except NEO4J_ERRORS:
        return False


async def _execute_one(
    db: AsyncSession,
    at: OntologyActionType,
    request: Request,
    *,
    object_id: str | None,
    input_payload: dict,
) -> OntologyActionExecuteResponse:
    """One action, one object — the body both the single and the batch entry point share."""
    input_payload = dict(input_payload or {})
    criteria = submission_criteria(at.parameters)
    if object_id:
        ot = await db.get(ObjectType, at.object_type_id)
        if not ot:
            raise HTTPException(status_code=404, detail="Object type not found")
        resolved = await resolve_object_props_for_action(db, ot, object_id)
        if not resolved:
            raise HTTPException(status_code=404, detail="Object instance not found")
        canonical_id, props = resolved
        if criteria and not await _satisfies_criteria(db, at, canonical_id, criteria):
            return OntologyActionExecuteResponse(
                status="error",
                error=(
                    "this object does not satisfy the action's submission criteria: "
                    + ", ".join(criteria)
                ),
            )
        input_payload.setdefault("object_id", canonical_id)
        input_payload.setdefault("object", props)
        # A parameter that names the object is filled from the object: the caller selected it, so asking for it again
        # is asking the same question twice — and a batch cannot answer it once for many objects.
        for param, prop_name in object_param_map(at.parameters).items():
            if input_payload.get(param) in (None, "") and prop_name in props:
                input_payload[param] = props[prop_name]
            input_payload.setdefault(param, props.get(prop_name))
        object_id = canonical_id

    ref_error = await _validate_object_refs(db, at, input_payload)
    if ref_error:
        return OntologyActionExecuteResponse(status="error", error=ref_error)

    uid, _ = jwt_user_from_request(request)

    if is_builtin_object_rule(at.rule_type):
        ot = await db.get(ObjectType, at.object_type_id)
        if not ot:
            raise HTTPException(status_code=404, detail="Object type not found")
        schema_errors = validate_input_against_schema(
            input_payload, input_schema_for_action(at, ot)
        )
        if schema_errors:
            raise HTTPException(status_code=400, detail="; ".join(schema_errors))
        return await execution_service.execute_builtin_action_and_audit(
            db,
            at,
            ot,
            input_payload=input_payload,
            object_id=object_id,
            caller_user_id=uid,
            caller_name=_caller_name(request),
        )

    if not at.function_id:
        raise HTTPException(status_code=400, detail="Action has no bound function")

    try:
        fn, ver = await execution_service.resolve_published_version_for_function(
            db, at.function_id, pinned_version=at.function_version
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return await execution_service.execute_action_and_audit(
        db,
        at,
        fn,
        ver,
        input_payload=input_payload,
        object_id=object_id,
        caller_user_id=uid,
        caller_token=require_caller_token(request),
        caller_name=_caller_name(request),
    )




@router.post("/{action_type_id}/execute", response_model=OntologyActionExecuteResponse)
async def execute_action_type(
    action_type_id: str,
    body: OntologyActionExecuteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    at = await _get_action_type(db, action_type_id)
    if at.status != "active":
        raise HTTPException(status_code=400, detail="Action type is not active")
    result = await _execute_one(
        db, at, request, object_id=body.object_id, input_payload=body.input
    )
    await _refresh_after_action(db, at, result)
    return result


# Palantir's Explorer passes a selection of up to 1000 objects to an action form; ours stops well short of that
# because the work is sequential and each object writes its own audit row.
BATCH_MAX = 200


@router.post("/{action_type_id}/execute-batch", response_model=OntologyActionBatchResponse)
async def execute_action_type_batch(
    action_type_id: str,
    body: OntologyActionBatchRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    """Run one action over the objects an exploration selected, reporting per object.

    A batch is not a transaction: one object that refuses (a validation rule, a missing reference) must not undo the
    others, so each runs on its own and the answer says which ones failed and why.
    """
    at = await _get_action_type(db, action_type_id)
    if at.status != "active":
        raise HTTPException(status_code=400, detail="Action type is not active")
    object_ids = list(dict.fromkeys(body.object_ids))
    if not object_ids:
        raise HTTPException(status_code=400, detail="Pass at least one object id")
    if len(object_ids) > BATCH_MAX:
        raise HTTPException(
            status_code=400, detail=f"At most {BATCH_MAX} objects per batch ({len(object_ids)} given)"
        )
    results: list[OntologyActionBatchItem] = []
    for object_id in object_ids:
        # Each run commits, and a commit expires the instances it touched — reading `at.object_type_id` afterwards is
        # a lazy refresh outside the async greenlet, which fails as `MissingGreenlet`. Re-read the action per object.
        at = await _get_action_type(db, action_type_id)
        try:
            outcome = await _execute_one(
                db, at, request, object_id=object_id, input_payload=body.input
            )
            ok = outcome.status == "ok"
            results.append(
                OntologyActionBatchItem(
                    object_id=object_id,
                    status=outcome.status,
                    error=None if ok else (outcome.error or "failed"),
                )
            )
        except HTTPException as exc:
            # A refusal is about this object (a rule, a missing reference): report it and carry on. Anything else is
            # a bug in the action itself, and it should abort the batch rather than be repeated 200 times.
            await db.rollback()
            results.append(
                OntologyActionBatchItem(object_id=object_id, status="error", error=str(exc.detail))
            )
    failed = sum(1 for item in results if item.status != "ok")
    refreshed = False
    if len(results) > failed:
        refreshed = await _refresh_after_action(db, at, None)
    return OntologyActionBatchResponse(
        succeeded=len(results) - failed, failed=failed, results=results, refreshed=refreshed
    )


@router.post("/applicable", response_model=list[ActionApplicability])
async def applicable_actions(
    body: ActionApplicabilityRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    """Which actions this set / selection may take, with the count that decides it.

    A menu that lists an action the caller cannot use is a promise the executor breaks. The submission criteria are
    asked here — against the same set the exploration is showing — so the menu can leave the action out instead.
    """
    obj_type = await db.get(ObjectType, body.object_type_id)
    if obj_type is None:
        raise HTTPException(status_code=404, detail="Object type not found")
    actions = (
        await db.execute(
            select(OntologyActionType).where(
                OntologyActionType.object_type_id == obj_type.id,
                OntologyActionType.status == "active",
            )
        )
    ).scalars().all()
    if not actions:
        return []
    neo4j_ds = await get_first_neo4j_datasource(db)
    link_info = await _link_info(db, obj_type)
    label = object_label(obj_type)
    columns = resolve_id_properties(obj_type)
    try:
        set_filters = [parse_filter(text) for text in body.conditions]
    except QueryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    async def count_set(filters) -> int:
        if not neo4j_ds:
            return 0

        def run(driver):
            from app.services.ontology.object_query import count_query, where_clause

            where, params = where_clause(filters, link_info=link_info)
            with driver.session() as session:
                return session.run(count_query(label, where), **params).single()["c"] or 0

        return await run_with_neo4j_driver(neo4j_ds, run)

    out: list[ActionApplicability] = []
    for action in actions:
        criteria = submission_criteria(action.parameters)
        if not criteria:
            eligible = await count_set(set_filters)
            selected_eligible = len(body.object_ids)
        else:
            try:
                criteria_filters = [parse_filter(text) for text in criteria]
            except QueryError as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"action {action.api_name}: {exc}",
                ) from exc
            eligible = await count_set([*set_filters, *criteria_filters])
            selected_eligible = 0
            if body.object_ids and neo4j_ds:
                satisfying = await run_with_neo4j_driver(
                    neo4j_ds,
                    lambda driver, f=criteria_filters: ids_satisfying(
                        driver, label, columns, body.object_ids, f, link_info
                    ),
                )
                selected_eligible = sum(1 for oid in body.object_ids if oid in satisfying)
        schema = await _annotate_object_refs(db, input_schema_for_action(action, obj_type), action)
        out.append(
            ActionApplicability(
                id=action.id,
                api_name=action.api_name,
                display_name=action.display_name,
                description=action.description,
                submission_criteria=criteria,
                input_schema=schema,
                parameters=action.parameters,
                eligible=eligible,
                selected_eligible=selected_eligible,
            )
        )
    return out


@router.get("/{action_type_id}/logs", response_model=list[OntologyActionLogResponse])
async def list_action_logs(
    action_type_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
    limit: int = Query(50, ge=1, le=200),
):
    await _get_action_type(db, action_type_id)
    rows = (
        await db.execute(
            select(OntologyActionLog)
            .where(OntologyActionLog.action_type_id == action_type_id)
            .order_by(OntologyActionLog.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [
        OntologyActionLogResponse(
            id=r.id,
            action_type_id=r.action_type_id,
            object_id=r.object_id,
            object_label=r.object_label,
            caller_user_id=r.caller_user_id,
            status=r.status,
            input_payload=r.input_payload,
            output_payload=r.output_payload,
            error_message=r.error_message,
            webhook_ok=r.webhook_ok,
            webhook_status=r.webhook_status,
            webhook_error=r.webhook_error,
            created_at=r.created_at,
        )
        for r in rows
    ]
