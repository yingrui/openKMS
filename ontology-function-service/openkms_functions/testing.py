"""Local testing helpers."""

from __future__ import annotations

from openkms_functions.client import OntologyClient
from openkms_functions.context import ExecuteContext


def stub_context(base_url: str, token: str, *, api_name: str = "local", version: int = 1) -> ExecuteContext:
    return ExecuteContext(ontology=OntologyClient(base_url, token), api_name=api_name, version=version)
