"""Subprocess bootstrap for user function code."""

from __future__ import annotations

import inspect
import json
import sys
import traceback
import warnings
from types import ModuleType
from typing import Any

from openkms_functions.client import Client
from openkms_functions.context import ExecuteContext
from openkms_functions.decorators import find_entrypoint


def _invoke_user_function(
    fn: Any,
    input_payload: dict,
    ctx: ExecuteContext,
) -> dict[str, Any]:
    sig = inspect.signature(fn)
    params = list(sig.parameters.values())
    if len(params) >= 2 and params[1].name in ("client", "ctx"):
        second = params[1].name
        if second == "client":
            result = fn(input_payload, ctx.client)
        else:
            warnings.warn(
                "ExecuteContext ctx parameter is deprecated; use client as second argument",
                DeprecationWarning,
                stacklevel=2,
            )
            result = fn(input_payload, ctx)
    elif len(params) >= 1:
        result = fn(input_payload)
    else:
        result = fn()
    if not isinstance(result, dict):
        return {"status": "error", "error": f"{fn.__name__}() must return a dict"}
    return {"status": "ok", "output": result}


def run_user_function(
    *,
    source_code: str,
    input_payload: dict,
    api_name: str,
    version: int,
    entrypoint: str,
    backend_url: str,
    caller_token: str,
    call_depth: int = 0,
    call_stack: list[str] | None = None,
) -> dict[str, Any]:
    module = ModuleType("user_function")
    exec(compile(source_code, "<function>", "exec"), module.__dict__)  # noqa: S102

    entry_fn = find_entrypoint(module.__dict__, entrypoint)
    if entry_fn is None:
        return {
            "status": "error",
            "error": f"Missing entrypoint {entrypoint!r} (@function or def execute)",
        }

    # Nested Client calls inherit the full stack including this function.
    stack = list(call_stack or [])
    if api_name and (not stack or stack[-1] != api_name):
        stack.append(api_name)

    ctx = ExecuteContext(
        client=Client(backend_url, caller_token, call_depth=call_depth, call_stack=stack),
        api_name=api_name,
        version=version,
    )
    try:
        return _invoke_user_function(entry_fn, input_payload, ctx)
    except Exception as e:
        return {"status": "error", "error": "".join(traceback.format_exception_only(type(e), e)).strip()}


def main() -> None:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        sys.stdout.write(json.dumps({"status": "error", "error": "Invalid bootstrap JSON"}))
        return

    for key in ("source_code", "backend_url", "caller_token"):
        if key not in payload:
            sys.stdout.write(json.dumps({"status": "error", "error": f"Missing required field: {key}"}))
            return

    raw_stack = payload.get("call_stack") or []
    if isinstance(raw_stack, str):
        call_stack = [p for p in raw_stack.split(",") if p]
    elif isinstance(raw_stack, list):
        call_stack = [str(p) for p in raw_stack if p]
    else:
        call_stack = []

    out = run_user_function(
        source_code=payload["source_code"],
        input_payload=payload.get("input") or {},
        api_name=payload.get("api_name", ""),
        version=int(payload.get("version", 1)),
        entrypoint=payload.get("entrypoint", "execute"),
        backend_url=payload["backend_url"],
        caller_token=payload["caller_token"],
        call_depth=int(payload.get("call_depth", 0)),
        call_stack=call_stack,
    )
    sys.stdout.write(json.dumps(out))


if __name__ == "__main__":
    main()
