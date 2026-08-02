"""Canonical ontology property types and per-datasource source-type adapters.

Ontology property types are datasource-agnostic. Each tabular datasource kind
maps its native column types into this set. Row cell serialization stays
driver-agnostic (UUID / date / Decimal → JSON primitives) so Neo4j index and
API responses do not depend on PostgreSQL-specific objects.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

OntologyPropertyType = Literal["string", "number", "boolean", "date", "datetime", "uuid"]

ONTOLOGY_PROPERTY_TYPES: tuple[OntologyPropertyType, ...] = (
    "string",
    "number",
    "boolean",
    "date",
    "datetime",
    "uuid",
)

_ONTOLOGY_PROPERTY_TYPE_SET = frozenset(ONTOLOGY_PROPERTY_TYPES)

# Exact PostgreSQL type names → ontology (after normalize_postgresql_column_type).
_PG_EXACT: dict[str, OntologyPropertyType] = {
    "uuid": "uuid",
    "date": "date",
    "boolean": "boolean",
    "bool": "boolean",
    "smallint": "number",
    "integer": "number",
    "bigint": "number",
    "int": "number",
    "int2": "number",
    "int4": "number",
    "int8": "number",
    "numeric": "number",
    "decimal": "number",
    "real": "number",
    "double precision": "number",
    "float": "number",
    "float4": "number",
    "float8": "number",
    "money": "number",
    # interval contains "int" as substring — keep as string, not number
    "interval": "string",
}


def is_ontology_property_type(value: str) -> bool:
    return value in _ONTOLOGY_PROPERTY_TYPE_SET


def normalize_postgresql_column_type(data_type: str, udt_name: str = "") -> str:
    """Normalize information_schema.data_type (+ udt_name) for PG sources."""
    dt = (data_type or "").strip().lower()
    udt = (udt_name or "").strip().lower()
    if dt == "user-defined" and udt:
        return udt
    if dt in ("character varying", "varchar", "character", "char"):
        return "text"
    if dt == "double precision":
        return "double precision"
    return dt or udt or "text"


def map_postgresql_type_to_ontology(source_type: str) -> OntologyPropertyType:
    """Map a normalized PostgreSQL column type to an ontology property type."""
    t = (source_type or "").strip().lower()
    if not t:
        return "string"
    exact = _PG_EXACT.get(t)
    if exact is not None:
        return exact
    if "timestamp" in t:
        return "datetime"
    if t.endswith("[]"):
        return "string"
    # Avoid matching "interval" via substring "int"
    if "interval" in t:
        return "string"
    if any(tok in t for tok in ("int", "numeric", "decimal", "real", "double", "float")):
        return "number"
    if "bool" in t:
        return "boolean"
    if t == "uuid" or t.endswith(".uuid"):
        return "uuid"
    return "string"


def map_source_type_to_ontology(kind: str, source_type: str) -> OntologyPropertyType:
    """Dispatch native column type → ontology type by datasource kind.

    Unknown kinds fall back to string so new tabular sources can be added
    without breaking metadata consumers.
    """
    if kind == "postgresql":
        return map_postgresql_type_to_ontology(source_type)
    return "string"


def serialize_cell_value(obj: Any) -> Any:
    """Serialize a DB driver cell value to JSON/Neo4j-safe primitives."""
    if obj is None:
        return None
    if isinstance(obj, uuid.UUID):
        return str(obj)
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return obj
