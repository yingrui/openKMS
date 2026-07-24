"""ontology-function-service — sandbox executor for Ontology Functions."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

SERVICE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TIMEOUT = int(os.environ.get("OPENKMS_ONTOLOGY_FUNCTION_TIMEOUT_SECONDS", "30"))

app = FastAPI(title="ontology-function-service", version="0.1.0")


class ExecuteRequest(BaseModel):
    source_code: str
    input: dict = Field(default_factory=dict)
    api_name: str = ""
    version: int = 1
    entrypoint: str = "execute"
    backend_url: str
    caller_token: str
    call_depth: int = 0
    call_stack: list[str] = Field(default_factory=list)


class ExecuteResponse(BaseModel):
    status: str
    output: dict | None = None
    error: str | None = None
    duration_ms: int | None = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/execute", response_model=ExecuteResponse)
def execute(body: ExecuteRequest):
    bootstrap = SERVICE_ROOT / "ofs" / "bootstrap.py"
    env = os.environ.copy()
    env["PYTHONPATH"] = str(SERVICE_ROOT)
    payload = json.dumps(
        {
            "source_code": body.source_code,
            "input": body.input,
            "api_name": body.api_name,
            "version": body.version,
            "entrypoint": body.entrypoint,
            "backend_url": body.backend_url.rstrip("/"),
            "caller_token": body.caller_token,
            "call_depth": body.call_depth,
            "call_stack": body.call_stack,
        }
    )
    started = time.perf_counter()
    try:
        proc = subprocess.run(
            [sys.executable, str(bootstrap)],
            input=payload,
            capture_output=True,
            text=True,
            timeout=DEFAULT_TIMEOUT,
            env=env,
            cwd=str(SERVICE_ROOT),
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail=f"Execution timed out after {DEFAULT_TIMEOUT}s") from None

    duration_ms = int((time.perf_counter() - started) * 1000)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "subprocess failed")[:4000]
        return ExecuteResponse(status="error", error=err, duration_ms=duration_ms)

    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        return ExecuteResponse(status="error", error="Invalid executor output", duration_ms=duration_ms)

    return ExecuteResponse(
        status=data.get("status", "error"),
        output=data.get("output"),
        error=data.get("error"),
        duration_ms=duration_ms,
    )
