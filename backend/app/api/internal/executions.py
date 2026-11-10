"""Execution audit: what code ran, by whose request, in which conversation.

Executions happen inside the qa-agent process and never touch an HTTP route of this service, so the audit middleware — which
records mutations by watching responses — cannot see them. Without this endpoint the audit page can show that someone asked a
question and nothing at all about the code that ran because of it.

**What is recorded:** the kind of execution (python or a shell command), the program a command started, whether it succeeded,
how long it took, whether it was stopped for hitting its time limit, the size and a short hash of the code. **Not** the code
itself and not a command's arguments: the log is for "who did what", and a body is where secrets live.

The caller sends the **user's** token, not the service's: the actor in the audit must be the person who asked, which is also
the authority the code ran with.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.api.auth import require_auth
from app.services.platform.audit import record_audit_event

router = APIRouter(
    prefix="/internal-api/executions",
    tags=["internal-executions"],
    dependencies=[Depends(require_auth)],
)

#: The audit row's own type, so the audit page can filter for them.
RESOURCE_TYPE = "agent_execution"


class ExecutionEvent(BaseModel):
    knowledge_base_id: str = Field(min_length=1, max_length=64)
    session_id: str = Field(min_length=1, max_length=64)
    kind: Literal["python", "command"]
    exit_code: int | None = None
    duration_ms: int = Field(ge=0)
    timed_out: bool = False
    #: Size and short hash of what ran. The body itself is never sent, so it can never be stored by accident.
    code_chars: int = Field(0, ge=0)
    code_sha: str | None = Field(None, max_length=16)
    #: For a shell command: the program that started it (`ls`), never its arguments.
    program: str | None = Field(None, max_length=64)


@router.post("")
async def record_execution(
    body: ExecutionEvent,
    request: Request,
):
    """One execution. Called by the agent after each run; the actor is the token's user."""
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    uname = payload.get("preferred_username") or payload.get("name")
    sub = payload.get("sub")
    detail = {
        "kind": body.kind,
        "exit_code": body.exit_code,
        "duration_ms": body.duration_ms,
        "timed_out": body.timed_out,
        "code_chars": body.code_chars,
        "code_sha": body.code_sha,
    }
    if body.program:
        detail["program"] = body.program
    # No session passed: the recorder opens its own, so an audit write cannot be rolled back with a request's transaction.
    await record_audit_event(
        method="POST",
        path="/internal-api/executions",
        status_code=200,
        actor_sub=sub if isinstance(sub, str) else None,
        actor_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
        auth_mode=payload.get("auth_mode") if isinstance(payload.get("auth_mode"), str) else None,
        detail=detail,
        resource_type=RESOURCE_TYPE,
        resource_id=body.session_id,
        # `response_label` is the generic "what this row is about" field; a session id alone reads as noise in the rail.
        response_label=f"{body.kind} in session {body.session_id[:8]}",
    )
    return {"ok": True}
