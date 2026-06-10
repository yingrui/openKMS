"""Shared dataset column contracts for sync connector output slots."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ConnectorDatasetColumn:
    name: str
    pg_type: str
    nullable: bool = False
    primary_key: bool = False
