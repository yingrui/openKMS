"""Execute context injected by ofs bootstrap."""

from __future__ import annotations

from dataclasses import dataclass

from openkms_functions.client import OntologyClient


@dataclass
class ExecuteContext:
    ontology: OntologyClient
    api_name: str
    version: int
