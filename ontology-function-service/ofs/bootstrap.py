"""Subprocess bootstrap for user function code."""

from __future__ import annotations

import json
import sys
import traceback
from types import ModuleType
from typing import Any

from openkms_functions.client import OntologyClient
from openkms_functions.context import ExecuteContext


def run_user_function(
    *,
    source_code: str,
    input_payload: dict,
    api_name: str,
    version: int,
    backend_url: str,
    caller_token: str,
) -> dict[str, Any]:
    module = ModuleType("user_function")
    exec(compile(source_code, "<function>", "exec"), module.__dict__)  # noqa: S102
    execute_fn = module.__dict__.get("execute")
    if not callable(execute_fn):
        return {"status": "error", "error": "Missing execute(input, ctx) function"}

    ctx = ExecuteContext(
        ontology=OntologyClient(backend_url, caller_token),
        api_name=api_name,
        version=version,
    )
    try:
        result = execute_fn(input_payload, ctx)
        if not isinstance(result, dict):
            return {"status": "error", "error": "execute() must return a dict"}
        return {"status": "ok", "output": result}
    except Exception as e:
        return {"status": "error", "error": "".join(traceback.format_exception_only(type(e), e)).strip()}


def main() -> None:
    raw = sys.stdin.read()
    payload = json.loads(raw)
    out = run_user_function(
        source_code=payload["source_code"],
        input_payload=payload.get("input") or {},
        api_name=payload.get("api_name", ""),
        version=int(payload.get("version", 1)),
        backend_url=payload["backend_url"],
        caller_token=payload["caller_token"],
    )
    sys.stdout.write(json.dumps(out))


if __name__ == "__main__":
    main()
