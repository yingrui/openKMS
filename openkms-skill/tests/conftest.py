"""Smoke-test fixtures: mock httpx transport so commands hit no network."""
from __future__ import annotations

import importlib
import pathlib
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


def _patched_modules() -> list[str]:
    """Every command module that does `from ..client import client`.

    Derived rather than listed: the list used to be hand-kept, so a new command module silently used the
    real HTTP client in tests — `api spec` did, and answered from the network instead of the mock.
    """
    package = pathlib.Path(importlib.import_module("openkms.commands").__path__[0])
    names: list[str] = []
    for source in sorted(package.glob("*.py")):
        if source.name == "__init__.py":
            continue
        # Only the modules that import the client — importing the rest is how the fixture used to break.
        if "client import client" not in source.read_text():
            continue
        names.append(f"openkms.commands.{source.stem}")
    return names


@pytest.fixture
def mock_api(monkeypatch):
    """Yields (recorded_requests_list, response_map_dict).

    Tests pre-program responses by `(METHOD, path)` (query string ignored). Any unmatched
    request falls through to a 200 with an empty JSON object.
    """
    recorded: list[httpx.Request] = []
    response_map: dict[tuple[str, str], tuple[int, Any]] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        recorded.append(request)
        key = (request.method, request.url.path)
        if key in response_map:
            status, payload = response_map[key]
        else:
            status, payload = 200, {}
        if isinstance(payload, (dict, list)):
            return httpx.Response(status, json=payload)
        return httpx.Response(status, content=payload)

    transport = httpx.MockTransport(handler)

    def fake_client() -> httpx.Client:
        return httpx.Client(
            base_url="http://test.local",
            headers={"Authorization": "Bearer okms.test.secret"},
            timeout=10.0,
            transport=transport,
        )

    import openkms.client as oc
    monkeypatch.setattr(oc, "client", fake_client)
    for mod_name in _patched_modules():
        m = importlib.import_module(mod_name)
        monkeypatch.setattr(m, "client", fake_client)

    yield recorded, response_map
