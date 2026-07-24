"""Local testing helpers."""

from openkms_functions.client import Client
from openkms_functions.context import ExecuteContext


def stub_context(base_url: str, token: str, *, api_name: str = "test", version: int = 1) -> ExecuteContext:
    return ExecuteContext(client=Client(base_url, token), api_name=api_name, version=version)
