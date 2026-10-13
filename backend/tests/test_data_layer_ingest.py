"""File-ingest parsing + type inference tests (pure, no DB/network)."""
import pandas as pd
import pytest

from app.services.data_layer.ingest import (
    IngestError,
    pg_type_for,
    preview_columns,
    read_dataframe,
)


def test_csv_schema_inference():
    df = read_dataframe(b"a,b\n1,x\n2,y\n", "t.csv")
    cols = {c["name"]: c["pg_type"] for c in preview_columns(df)}
    assert cols["a"] == "BIGINT"
    assert cols["b"] == "TEXT"


def test_json_records():
    df = read_dataframe(b'[{"a":1,"b":"x"}]', "t.json")
    assert list(df.columns) == ["a", "b"]
    assert df.iloc[0]["a"] == 1


def test_tsv_uses_tab_separator():
    df = read_dataframe(b"a\tb\n1\tx\n", "t.tsv")
    assert list(df.columns) == ["a", "b"]


def test_unsupported_extension_raises():
    with pytest.raises(IngestError):
        read_dataframe(b"x", "t.parquet")


def test_unparseable_file_raises_ingest_error():
    with pytest.raises(IngestError):
        read_dataframe(b"not json at all", "t.json")


def test_pg_type_for():
    assert pg_type_for(pd.Series([1]).dtype) == "BIGINT"
    assert pg_type_for(pd.Series([1.5]).dtype) == "DOUBLE PRECISION"
    assert pg_type_for(pd.Series([True]).dtype) == "BOOLEAN"
    assert pg_type_for(pd.Series(["x"]).dtype) == "TEXT"
