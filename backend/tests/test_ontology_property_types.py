"""Canonical ontology property types and PostgreSQL adapter."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from app.services.ontology.property_types import (
    map_postgresql_type_to_ontology,
    map_source_type_to_ontology,
    normalize_postgresql_column_type,
    serialize_cell_value,
)


def test_serialize_uuid_to_str():
    u = uuid.UUID("550e8400-e29b-41d4-a716-446655440000")
    assert serialize_cell_value(u) == "550e8400-e29b-41d4-a716-446655440000"


def test_serialize_other_primitives():
    assert serialize_cell_value(None) is None
    assert serialize_cell_value(date(2024, 1, 2)) == "2024-01-02"
    assert serialize_cell_value(datetime(2024, 1, 2, 3, 4, 5)) == "2024-01-02T03:04:05"
    assert serialize_cell_value(Decimal("1.5")) == 1.5
    assert serialize_cell_value("ok") == "ok"


def test_normalize_pg_uuid_types():
    assert normalize_postgresql_column_type("uuid", "uuid") == "uuid"
    assert normalize_postgresql_column_type("USER-DEFINED", "uuid") == "uuid"
    assert normalize_postgresql_column_type("character varying", "varchar") == "text"
    assert normalize_postgresql_column_type("timestamp with time zone", "timestamptz") == (
        "timestamp with time zone"
    )


def test_map_postgresql_common_types():
    assert map_postgresql_type_to_ontology("uuid") == "uuid"
    assert map_postgresql_type_to_ontology("date") == "date"
    assert map_postgresql_type_to_ontology("timestamp with time zone") == "datetime"
    assert map_postgresql_type_to_ontology("boolean") == "boolean"
    assert map_postgresql_type_to_ontology("integer") == "number"
    assert map_postgresql_type_to_ontology("text") == "string"
    # substring "int" must not classify interval as number
    assert map_postgresql_type_to_ontology("interval") == "string"


def test_map_source_type_dispatches_by_kind():
    assert map_source_type_to_ontology("postgresql", "uuid") == "uuid"
    # Unknown tabular kinds stay string until an adapter is registered
    assert map_source_type_to_ontology("mysql", "varchar") == "string"
