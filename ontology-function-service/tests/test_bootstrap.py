"""Tests for ontology-function-service bootstrap."""

from __future__ import annotations

import sys
from pathlib import Path

OFS_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(OFS_ROOT))

from ofs.bootstrap import run_user_function  # noqa: E402


def test_run_decorated_function_with_client() -> None:
    source = '''
from openkms_functions import Client, function

@function
def execute(input: dict, client: Client) -> dict:
    return {"hello": input.get("name", "world")}
'''
    out = run_user_function(
        source_code=source,
        input_payload={"name": "openKMS"},
        api_name="testFn",
        version=1,
        entrypoint="execute",
        backend_url="http://localhost:8102",
        caller_token="test-token",
    )
    assert out["status"] == "ok"
    assert out["output"] == {"hello": "openKMS"}


def test_legacy_execute_with_ctx() -> None:
    source = '''
from openkms_functions import ExecuteContext

def execute(input: dict, ctx: ExecuteContext) -> dict:
    return {"via": "ctx"}
'''
    out = run_user_function(
        source_code=source,
        input_payload={},
        api_name="testFn",
        version=1,
        entrypoint="execute",
        backend_url="http://localhost:8102",
        caller_token="test-token",
    )
    assert out["status"] == "ok"
    assert out["output"] == {"via": "ctx"}


def test_missing_entrypoint_returns_error() -> None:
    out = run_user_function(
        source_code="x = 1",
        input_payload={},
        api_name="testFn",
        version=1,
        entrypoint="execute",
        backend_url="http://localhost:8102",
        caller_token="test-token",
    )
    assert out["status"] == "error"
    assert "Missing entrypoint" in out["error"]
