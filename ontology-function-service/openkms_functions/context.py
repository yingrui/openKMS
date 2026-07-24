"""Execute context injected by ofs bootstrap."""

from __future__ import annotations

from dataclasses import dataclass

from openkms_functions.client import Client


@dataclass
class ExecuteContext:
    client: Client
    api_name: str
    version: int

    @property
    def ontology(self) -> Client:
        """Deprecated alias — use ctx.client."""
        return self.client
