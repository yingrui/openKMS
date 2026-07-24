"""Run ontology functions via OFS and persist audit records."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
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
from app.services.ontology.function_service import get_function, get_function_by_api_name, resolve_version_for_execute
from app.services.ontology.input_schema import validate_input_against_schema


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


@dataclass
class ExecutionOutcome:
    status: str
    output: dict | None
    error: str | None
    duration_ms: int | None


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
    )
    db.add(ex)
    await db.commit()
    return OntologyFunctionExecuteResponse(
        status=outcome.status,
        output=outcome.output,
        error=outcome.error,
        duration_ms=outcome.duration_ms,
        execution_id=exec_id,
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
) -> OntologyActionExecuteResponse:
    log_id = new_action_log_id()
    outcome = await _run_ofs(
        ver=ver,
        fn=fn,
        input_payload=input_payload,
        caller_token=caller_token,
    )
    log = OntologyActionLog(
        id=log_id,
        action_type_id=at.id,
        object_id=object_id,
        caller_user_id=caller_user_id,
        status=outcome.status,
        input_payload=input_payload,
        output_payload=outcome.output,
        error_message=outcome.error,
    )
    db.add(log)
    await db.commit()
    return OntologyActionExecuteResponse(
        status=outcome.status,
        output=outcome.output,
        error=outcome.error,
        duration_ms=outcome.duration_ms,
        log_id=log_id,
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
