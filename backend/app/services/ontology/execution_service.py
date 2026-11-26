"""Run ontology functions via OFS and persist audit records."""

from __future__ import annotations

from typing import Any

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.services.ontology.neo4j_async import NEO4J_ERRORS
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ontology_function import (
    OntologyActionLog,
    OntologyActionType,
    OntologyFunction,
    OntologyFunctionExecution,
    OntologyFunctionVersion,
)
from app.schemas.ontology_functions import (
    OntologyActionExecuteResponse,
    OntologyFunctionExecuteResponse,
)
from app.services.ontology.constants import (
    ACTION_LOG_ID_PREFIX,
    EXECUTION_ID_HEX_LENGTH,
    EXECUTION_ID_PREFIX,
    ID_HEX_LENGTH,
)
from fastapi import HTTPException

from app.services.ontology.function_runtime import FunctionExecutionError, execute_in_ofs
from app.services.ontology import logic_runtime
from app.services.ontology.logic_model_registry import resolve_model
from app.services.ontology.logic_runtime import FlowError
from app.services.ontology.logic_tools import function_input_schema, make_tool_runner
from app.services.ontology.function_service import get_function, get_function_by_api_name, resolve_version_for_execute
from app.services.ontology.input_schema import validate_input_against_schema
from app.models.object_type import ObjectType
from app.services.ontology import action_webhook
from app.services.ontology.builtin_action_service import build_edits_for_builtin_action
from app.services.ontology.edit_apply_service import apply_edit_batch_to_objects, extract_edits
from app.services.ontology.object_neo4j_store import sync_edit_apply_result_to_neo4j


def new_execution_id() -> str:
    return f"{EXECUTION_ID_PREFIX}{uuid.uuid4().hex[:EXECUTION_ID_HEX_LENGTH]}"


def new_action_log_id() -> str:
    return f"{ACTION_LOG_ID_PREFIX}{uuid.uuid4().hex[:ID_HEX_LENGTH]}"


def normalize_output(output: object | None) -> dict | None:
    if output is None:
        return None
    if isinstance(output, dict):
        return output
    return {"result": output}


def object_label_for_log(
    props: dict | None,
    *,
    display_property: str | None = None,
    key_property: str | None = None,
) -> str | None:
    """How a reader names the object: its display property, its key, or a common name column."""
    if not props:
        return None
    candidates = (display_property, key_property, "name", "title", "id")
    for key in candidates:
        if not key:
            continue
        value = props.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()[:256]
    return None


@dataclass
class ExecutionOutcome:
    status: str
    output: dict | None
    error: str | None
    duration_ms: int | None
    trace: dict | None = None


async def _run_ofs(
    *,
    ver: OntologyFunctionVersion,
    fn: OntologyFunction,
    input_payload: dict,
    caller_token: str,
    call_depth: int = 0,
    call_stack: list[str] | None = None,
) -> ExecutionOutcome:
    try:
        output, err, duration_ms = await execute_in_ofs(
            source_code=ver.source_code,
            input_payload=input_payload,
            api_name=fn.api_name,
            version=ver.version,
            entrypoint=ver.entrypoint,
            caller_token=caller_token,
            call_depth=call_depth,
            call_stack=call_stack,
        )
    except FunctionExecutionError as e:
        return ExecutionOutcome(status="error", output=None, error=str(e), duration_ms=None)

    status = "ok" if err is None else "error"
    return ExecutionOutcome(
        status=status,
        output=normalize_output(output),
        error=err,
        duration_ms=duration_ms,
    )


async def plan_action_edits(
    db: AsyncSession,
    api_name: str,
    params: dict,
    *,
    caller_token: str = "",
    call_depth: int = 0,
    call_stack: tuple[str, ...] = (),
) -> list[dict]:
    """Compose an action's edit batch without applying it — applying belongs to the Action execute path.

    Built-in rules build the batch directly. A function-backed Action runs its bound function and takes the edits the
    function returned, which is the same computation the Action itself performs — minus the write.
    """
    from app.models.ontology_function import OntologyActionType
    from app.services.ontology.builtin_action_service import build_edits_for_builtin_action
    from app.services.ontology.action_rule_types import BUILTIN_OBJECT_RULE_TYPES

    at = (
        await db.execute(select(OntologyActionType).where(OntologyActionType.api_name == api_name))
    ).scalar_one_or_none()
    if not at:
        raise FlowError(f"action type '{api_name}' not found")
    if not at.object_type_id:
        raise FlowError(f"action type '{api_name}' has no object type")
    ot = await db.get(ObjectType, at.object_type_id)
    if not ot:
        raise FlowError(f"object type of action '{api_name}' not found")

    if at.rule_type in BUILTIN_OBJECT_RULE_TYPES:
        edits, errors = build_edits_for_builtin_action(
            at=at,
            ot=ot,
            input_payload=params,
            object_id=str(params.get("object_id") or "") or None,
        )
        if errors:
            raise FlowError("; ".join(errors))
        return edits

    if at.rule_type != "function":
        raise FlowError(f"action rule_type '{at.rule_type}' is not supported here")
    if not at.function_id:
        raise FlowError(f"action '{api_name}' has no bound function")

    try:
        fn, ver = await resolve_published_version_for_function(
            db, at.function_id, pinned_version=at.function_version
        )
    except ValueError as e:
        raise FlowError(str(e)) from e
    if fn.api_name in call_stack:
        raise FlowError(
            f"action cycle detected: {' → '.join((*call_stack, fn.api_name))}"
        )

    stack = (*call_stack, fn.api_name)
    if getattr(fn, "source", "code") == "logic":
        flow = await logic_runtime.run_flow(
            ver.flow_spec,
            params,
            model_factory=lambda model_id: resolve_model(db, model_id),
            tool_runner=make_tool_runner(
                caller_token, call_depth=call_depth + 1, call_stack=stack
            ),
            action_planner=lambda name, values: plan_action_edits(
                db,
                name,
                values,
                caller_token=caller_token,
                call_depth=call_depth + 1,
                call_stack=stack,
            ),
            schema_resolver=lambda name: function_input_schema(
                caller_token=caller_token, api_name=name
            ),
        )
        if flow.status != "ok":
            raise FlowError(flow.error or f"action function '{fn.api_name}' failed")
        output = flow.output
    else:
        outcome = await _run_ofs(
            ver=ver,
            fn=fn,
            input_payload=params,
            caller_token=caller_token,
            call_depth=call_depth + 1,
            call_stack=list(stack),
        )
        if outcome.status != "ok":
            raise FlowError(outcome.error or f"action function '{fn.api_name}' failed")
        output = outcome.output

    edits = extract_edits(output)
    if not edits:
        # An Action whose function writes through an external service returns no edits — running it inside a flow
        # would perform that write during a preview. Flows compose ontology edits; outward calls stay in the Action.
        raise FlowError(
            f"action function '{fn.api_name}' returned no ontology edits — this Action writes through an external "
            "service, so it cannot be used as a flow node"
        )
    return edits


#: Ontology property types as the JSON schema types a model understands. Anything unlisted is text: a model writing a
#: string where a number belongs is recoverable by the Action; the reverse silently writes the wrong type.
_PROPERTY_JSON_TYPES: dict[str, str] = {
    "boolean": "boolean",
    "bool": "boolean",
    "integer": "integer",
    "int": "integer",
    "long": "integer",
    "number": "number",
    "double": "number",
    "float": "number",
    "array": "array",
    "object": "object",
}


async def action_parameter_schema(db: AsyncSession, api_name: str) -> dict | None:
    """An Action's parameters as a JSON schema, with their *types* — not every field is text.

    The values become edit properties (built-in rules) or a function's arguments (function rules) without coercion, so
    a schema that says "string" for everything teaches the model to write `"true"` where a boolean belongs.
    """
    from app.models.ontology_function import OntologyActionType
    from app.services.ontology.action_rule_types import BUILTIN_OBJECT_RULE_TYPES

    at = (
        await db.execute(select(OntologyActionType).where(OntologyActionType.api_name == api_name))
    ).scalar_one_or_none()
    if not at:
        return None

    if at.rule_type in BUILTIN_OBJECT_RULE_TYPES and at.object_type_id:
        ot = await db.get(ObjectType, at.object_type_id)
        if ot:
            raw = at.parameters or {}
            declared = raw.get("fields") if isinstance(raw, dict) else None
            rows = [
                prop
                for prop in (ot.properties or [])
                if not isinstance(declared, list) or prop.get("name") in declared
            ]
            if rows:
                properties: dict[str, dict[str, str]] = {}
                required: list[str] = []
                for prop in rows:
                    name = str(prop.get("name") or "")
                    if not name:
                        continue
                    properties[name] = {
                        "type": _PROPERTY_JSON_TYPES.get(str(prop.get("type")), "string")
                    }
                    if prop.get("required"):
                        required.append(name)
                return {"type": "object", "properties": properties, "required": required}

    if at.rule_type == "function" and at.function_id:
        # A function-backed Action's contract *is* the function's input schema.
        try:
            fn, ver = await resolve_published_version_for_function(
                db, at.function_id, pinned_version=at.function_version
            )
        except ValueError:
            return None
        schema = ver.input_schema if isinstance(ver.input_schema, dict) else None
        if schema:
            return schema

    raw = at.parameters or {}
    fields = raw.get("fields") if isinstance(raw, dict) else None
    if not isinstance(fields, list) or not fields:
        return None
    return {
        "type": "object",
        "properties": {str(field): {"type": "string"} for field in fields},
        "required": [],
    }


async def dry_run_flow(
    db: AsyncSession,
    fn: OntologyFunction,
    *,
    flow_spec: dict,
    input_payload: dict,
    caller_token: str = "",
    caller_user_id: str | None = None,
    model_factory: logic_runtime.ModelFactory | None = None,
    tool_runner: logic_runtime.ToolRunner | None = None,
) -> OntologyFunctionExecuteResponse:
    """Execute the spec on screen and record it as a *draft* run.

    The run is recorded (it really ran, and cost tokens), but marked `draft` in its trace: a preview must be visible in
    the run panel's history without pretending to be the function's production behaviour. Nothing is written to the
    ontology — that is a different promise, and it still holds.
    """
    if getattr(fn, "source", "code") != "logic":
        raise HTTPException(status_code=400, detail="Only Logic functions have a flow to run")

    if model_factory is None:

        async def model_factory(model_id: str | None) -> Any:
            return await resolve_model(db, model_id)

    flow = await logic_runtime.run_flow(
        flow_spec,
        input_payload,
        model_factory=model_factory,
        tool_runner=tool_runner
        or make_tool_runner(
            caller_token,
            action_planner=lambda api_name, params: plan_action_edits(
                db, api_name, params, caller_token=caller_token
            ),
        ),
        action_schema_resolver=lambda api_name: action_parameter_schema(db, api_name),
        action_planner=lambda api_name, params: plan_action_edits(
            db, api_name, params, caller_token=caller_token
        ),
        schema_resolver=(
            None
            if caller_token == ""
            else lambda api_name: function_input_schema(
                caller_token=caller_token, api_name=api_name
            )
        ),
    )
    trace = dict(flow.trace or {})
    trace["draft"] = True
    execution_id = await _record_draft_run(
        db,
        fn,
        input_payload=input_payload,
        status=flow.status,
        output=normalize_output(flow.output),
        error=flow.error,
        duration_ms=flow.duration_ms,
        trace=trace,
        caller_user_id=caller_user_id,
    )
    return OntologyFunctionExecuteResponse(
        status=flow.status,
        output=normalize_output(flow.output),
        error=flow.error,
        duration_ms=flow.duration_ms,
        execution_id=execution_id,
        trace=trace,
    )


async def _record_draft_run(
    db: AsyncSession,
    fn: OntologyFunction,
    *,
    input_payload: dict,
    status: str,
    output: dict | None,
    error: str | None,
    duration_ms: int | None,
    trace: dict,
    caller_user_id: str | None = None,
) -> str | None:
    """One row per preview, flagged in the trace as a draft. Best effort: a failed insert must not lose the answer."""
    from app.services.ontology.function_service import latest_version

    version = await latest_version(db, fn.id)
    if version is None:
        return None
    exec_id = new_execution_id()
    db.add(
        OntologyFunctionExecution(
            id=exec_id,
            function_id=fn.id,
            version_id=version.id,
            caller_user_id=caller_user_id,
            duration_ms=duration_ms,
            status=status,
            input_payload=input_payload,
            output_payload=output,
            error_message=error,
            trace=trace,
        )
    )
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        return None
    return exec_id


async def _run_flow(
    db: AsyncSession,
    *,
    ver: OntologyFunctionVersion,
    input_payload: dict,
    caller_token: str = "",
    call_depth: int = 0,
    call_stack: list[str] | None = None,
) -> ExecutionOutcome:
    """Logic functions: the backend orchestrates, so a node failure is recorded with its trace."""

    async def model_factory(model_id: str | None) -> Any:
        return await resolve_model(db, model_id)

    flow = await logic_runtime.run_flow(
        ver.flow_spec,
        input_payload,
        model_factory=model_factory,
        tool_runner=make_tool_runner(
            caller_token,
            call_depth=call_depth,
            call_stack=tuple(call_stack or ()),
            action_planner=lambda api_name, params: plan_action_edits(
                db,
                api_name,
                params,
                caller_token=caller_token,
                call_depth=call_depth,
                call_stack=tuple(call_stack or ()),
            ),
        ),
        action_schema_resolver=lambda api_name: action_parameter_schema(db, api_name),
        action_planner=lambda api_name, params: plan_action_edits(
            db,
            api_name,
            params,
            caller_token=caller_token,
            call_depth=call_depth,
            call_stack=tuple(call_stack or ()),
        ),
        schema_resolver=lambda api_name: function_input_schema(
            caller_token=caller_token, api_name=api_name
        ),
    )
    return ExecutionOutcome(
        status=flow.status,
        output=normalize_output(flow.output),
        error=flow.error,
        duration_ms=flow.duration_ms,
        trace=flow.trace or None,
    )


async def execute_function_and_audit(
    db: AsyncSession,
    fn: OntologyFunction,
    ver: OntologyFunctionVersion,
    *,
    input_payload: dict,
    caller_user_id: str | None,
    caller_token: str,
    call_depth: int = 0,
    call_stack: list[str] | None = None,
) -> OntologyFunctionExecuteResponse:
    schema_errors = validate_input_against_schema(input_payload, ver.input_schema)
    if schema_errors:
        raise HTTPException(status_code=400, detail={"message": "Input validation failed", "errors": schema_errors})

    stack = list(call_stack or [])
    if fn.api_name in stack:
        raise HTTPException(
            status_code=400,
            detail=f"Function call cycle detected: {' → '.join(stack + [fn.api_name])}",
        )
    stack.append(fn.api_name)

    exec_id = new_execution_id()
    # Release any open transaction before awaiting OFS so nested Client HTTP
    # (same process, same API key) is not blocked on row locks / idle-in-transaction.
    await db.commit()
    if getattr(fn, "source", "code") == "logic":
        outcome = await _run_flow(
            db,
            ver=ver,
            input_payload=input_payload,
            caller_token=caller_token,
            call_depth=call_depth,
            call_stack=stack,
        )
    else:
        outcome = await _run_ofs(
            ver=ver,
            fn=fn,
            input_payload=input_payload,
            caller_token=caller_token,
            call_depth=call_depth,
            call_stack=stack,
        )
    ex = OntologyFunctionExecution(
        id=exec_id,
        function_id=fn.id,
        version_id=ver.id,
        caller_user_id=caller_user_id,
        duration_ms=outcome.duration_ms,
        status=outcome.status,
        input_payload=input_payload,
        output_payload=outcome.output,
        error_message=outcome.error,
        trace=outcome.trace,
    )
    db.add(ex)
    await db.commit()
    return OntologyFunctionExecuteResponse(
        status=outcome.status,
        output=outcome.output,
        error=outcome.error,
        duration_ms=outcome.duration_ms,
        execution_id=exec_id,
        trace=outcome.trace,
    )


async def execute_function_by_id(
    db: AsyncSession,
    function_id: str,
    *,
    input_payload: dict,
    version_id: str | None,
    use_published: bool,
    caller_user_id: str | None,
    caller_token: str,
    call_depth: int = 0,
    call_stack: list[str] | None = None,
) -> OntologyFunctionExecuteResponse:
    fn = await get_function(db, function_id)
    ver = await resolve_version_for_execute(
        db, fn, version_id=version_id, use_published=use_published
    )
    return await execute_function_and_audit(
        db,
        fn,
        ver,
        input_payload=input_payload,
        caller_user_id=caller_user_id,
        caller_token=caller_token,
        call_depth=call_depth,
        call_stack=call_stack,
    )


async def execute_published_by_api_name(
    db: AsyncSession,
    api_name: str,
    *,
    input_payload: dict,
    caller_user_id: str | None,
    caller_token: str,
    call_depth: int = 0,
    call_stack: list[str] | None = None,
) -> OntologyFunctionExecuteResponse:
    fn = await get_function_by_api_name(db, api_name)
    return await execute_function_by_id(
        db,
        fn.id,
        input_payload=input_payload,
        version_id=None,
        use_published=True,
        caller_user_id=caller_user_id,
        caller_token=caller_token,
        call_depth=call_depth,
        call_stack=call_stack,
    )


async def _apply_edits_and_audit(
    db: AsyncSession,
    at: OntologyActionType,
    *,
    input_payload: dict,
    object_id: str | None,
    caller_user_id: str | None,
    edits: list[dict],
    output: dict | None,
    duration_ms: int | None,
    pre_apply_errors: list[str] | None = None,
    caller_name: str | None = None,
) -> OntologyActionExecuteResponse:
    """Apply edit batch, sync Neo4j, write audit log."""
    log_id = new_action_log_id()
    applied: dict | None = None
    status = "ok"
    error: str | None = None
    # Captured before any rollback below can expire the instance.
    ot = await db.get(ObjectType, at.object_type_id)
    ot_display_property = getattr(ot, "display_property", None) if ot else None
    ot_key_property = (getattr(ot, "key_properties", None) or [None])[0] if ot else None

    if pre_apply_errors:
        status = "error"
        error = "; ".join(pre_apply_errors)
    elif edits:
        apply_result = await apply_edit_batch_to_objects(
            db,
            edits,
            allowed_object_type_id=at.object_type_id,
        )
        applied = apply_result.as_dict()
        if apply_result.errors:
            await db.rollback()
            status = "error"
            error = "; ".join(apply_result.errors)
            applied = {
                "created_ids": [],
                "modified_ids": [],
                "deleted_ids": [],
                "skipped": apply_result.skipped,
                "errors": apply_result.errors,
            }
        else:
            await db.flush()
            # Dataset-backed types included: a modify is an overlay written into the node by its
            # business id. Creates/deletes never reach here for them (apply refuses).
            if ot:
                try:
                    await sync_edit_apply_result_to_neo4j(db, ot, applied)
                except (SQLAlchemyError, *NEO4J_ERRORS) as e:
                    await db.rollback()
                    status = "error"
                    error = f"Neo4j sync failed (queue not committed): {e}"
                    applied = {
                        "created_ids": [],
                        "modified_ids": [],
                        "deleted_ids": [],
                        "skipped": apply_result.skipped,
                        "errors": [error],
                    }

    # A create has no incoming object_id: the object it wrote is the one it acted on.
    created = (applied or {}).get("created_ids") or []
    logged_object_id = object_id or (created[0] if len(created) == 1 else None)
    snapshot = input_payload.get("object")
    if not isinstance(snapshot, dict):
        # A create's input *is* the object's properties.
        snapshot = input_payload if getattr(at, "rule_type", None) == "object_create" else None
    log = OntologyActionLog(
        id=log_id,
        action_type_id=at.id,
        object_id=logged_object_id,
        object_label=object_label_for_log(
            snapshot, display_property=ot_display_property, key_property=ot_key_property
        ),
        caller_user_id=caller_user_id,
        status=status,
        input_payload=input_payload,
        output_payload=output,
        error_message=error,
    )
    db.add(log)
    await db.commit()

    # The change is committed, so delivery is notification, not part of the transaction: a failing
    # webhook must not fail the Action. Its outcome is recorded next to the log.
    webhook: dict | None = None
    webhook_service_id = getattr(at, "webhook_service_id", None)
    webhook_path = getattr(at, "webhook_path", None)
    if status == "ok" and webhook_service_id and webhook_path:
        payload = action_webhook.build_payload(
            action=at,
            object_type_name=(ot.api_name if ot else None),
            # A create has no incoming object_id — the id it just wrote is the one the receiver
            # must record, so the object block is filled from the result, not from the request.
            object_id=logged_object_id,
            object_properties=snapshot if isinstance(snapshot, dict) else None,
            object_key=(
                {
                    column: (snapshot or {}).get(column)
                    for column in (getattr(ot, "key_properties", None) or [])
                }
                if isinstance(snapshot, dict)
                else None
            ),
            input_payload=input_payload,
            applied=applied,
            caller_user_id=caller_user_id,
            caller_name=caller_name,
            action_log_id=log_id,
        )
        webhook = await action_webhook.deliver(db, at, payload)
        if webhook is not None:
            log.output_payload = {**(log.output_payload or {}), "webhook": webhook}
            log.webhook_ok = bool(webhook.get("ok"))
            log.webhook_status = webhook.get("status")
            log.webhook_error = webhook.get("error")
            await db.commit()

    return OntologyActionExecuteResponse(
        status=status,
        output=output,
        error=error,
        duration_ms=duration_ms,
        log_id=log_id,
        applied=applied,
        webhook=webhook,
    )


async def execute_builtin_action_and_audit(
    db: AsyncSession,
    at: OntologyActionType,
    ot: ObjectType,
    *,
    input_payload: dict,
    object_id: str | None,
    caller_user_id: str | None,
    caller_name: str | None = None,
) -> OntologyActionExecuteResponse:
    edits, errors = build_edits_for_builtin_action(
        at=at,
        ot=ot,
        input_payload=input_payload,
        object_id=object_id,
    )
    output = {"edits": edits} if edits else None
    return await _apply_edits_and_audit(
        db,
        at,
        input_payload=input_payload,
        object_id=object_id,
        caller_user_id=caller_user_id,
        edits=edits,
        output=output,
        duration_ms=0,
        pre_apply_errors=errors or None,
        caller_name=caller_name,
    )


async def execute_action_and_audit(
    db: AsyncSession,
    at: OntologyActionType,
    fn: OntologyFunction,
    ver: OntologyFunctionVersion,
    *,
    input_payload: dict,
    object_id: str | None,
    caller_user_id: str | None,
    caller_token: str,
    caller_name: str | None = None,
) -> OntologyActionExecuteResponse:
    await db.commit()
    outcome = await _run_ofs(
        ver=ver,
        fn=fn,
        input_payload=input_payload,
        caller_token=caller_token,
    )
    edits = extract_edits(outcome.output) if outcome.status == "ok" else []
    return await _apply_edits_and_audit(
        db,
        at,
        input_payload=input_payload,
        object_id=object_id,
        caller_user_id=caller_user_id,
        edits=edits,
        output=outcome.output,
        duration_ms=outcome.duration_ms,
        pre_apply_errors=[outcome.error] if outcome.status != "ok" and outcome.error else None,
        caller_name=caller_name,
    )


async def resolve_published_version_for_function(
    db: AsyncSession,
    function_id: str,
    *,
    pinned_version: int | None = None,
) -> tuple[OntologyFunction, OntologyFunctionVersion]:
    """Resolve function + version for Actions.

    When ``pinned_version`` is set, use that version number (must exist).
    Otherwise use the function's currently published version.
    """
    fn = (
        await db.execute(select(OntologyFunction).where(OntologyFunction.id == function_id))
    ).scalar_one_or_none()
    if not fn:
        raise ValueError("Bound function not found")
    if pinned_version is not None:
        ver = (
            await db.execute(
                select(OntologyFunctionVersion).where(
                    OntologyFunctionVersion.function_id == function_id,
                    OntologyFunctionVersion.version == pinned_version,
                )
            )
        ).scalar_one_or_none()
        if not ver:
            raise ValueError(f"Pinned function version not found: {pinned_version}")
        return fn, ver
    if not fn.published_version_id:
        raise ValueError("Bound function has no published version")
    ver = (
        await db.execute(
            select(OntologyFunctionVersion).where(OntologyFunctionVersion.id == fn.published_version_id)
        )
    ).scalar_one_or_none()
    if not ver:
        raise ValueError("Published function version not found")
    return fn, ver
