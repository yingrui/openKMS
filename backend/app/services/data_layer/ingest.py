"""File ingest: parse an uploaded CSV/TSV/JSON/Excel file into a PostgreSQL table.

The raw file lives in object storage; a data-layer PostgreSQL data source receives
the parsed table. No transforms beyond schema inference and column-name safety.
"""
from __future__ import annotations

import io

import pandas as pd
from sqlalchemy import text

from app.models.data_source import DataSource
from app.services.ontology.dataset_tables import is_valid_identifier, pg_engine_for_datasource
from app.services.storage import get_object


class IngestError(ValueError):
    """Raised when a file cannot be parsed or loaded; surfaced as HTTP 400."""


def _ext(filename: str) -> str:
    return ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""


def read_dataframe(content: bytes, filename: str, *, nrows: int | None = None) -> pd.DataFrame:
    ext = _ext(filename)
    buf = io.BytesIO(content)
    try:
        if ext in (".csv", ".tsv"):
            return pd.read_csv(buf, sep="\t" if ext == ".tsv" else ",", nrows=nrows)
        if ext == ".json":
            df = pd.read_json(buf)
            return df.head(nrows) if nrows else df
        if ext in (".xlsx", ".xls"):
            return pd.read_excel(buf, nrows=nrows)
    except Exception as exc:
        raise IngestError(f"Failed to parse {filename}: {exc}") from exc
    raise IngestError(f"Unsupported file type '{ext or filename}'. Use CSV, TSV, JSON, or Excel.")


def pg_type_for(dtype: object) -> str:
    if pd.api.types.is_integer_dtype(dtype):
        return "BIGINT"
    if pd.api.types.is_float_dtype(dtype):
        return "DOUBLE PRECISION"
    if pd.api.types.is_bool_dtype(dtype):
        return "BOOLEAN"
    if pd.api.types.is_datetime64_any_dtype(dtype):
        return "TIMESTAMP"
    return "TEXT"


def preview_columns(df: pd.DataFrame) -> list[dict]:
    out: list[dict] = []
    for col in df.columns:
        samples = [
            str(v)
            for v in df[col].head(3).tolist()
            if v is not None and str(v).lower() != "nan"
        ]
        out.append(
            {"name": str(col), "pg_type": pg_type_for(df[col].dtype), "sample_values": samples}
        )
    return out


def read_head(storage_key: str, filename: str, nrows: int = 1000) -> pd.DataFrame:
    return read_dataframe(get_object(storage_key), filename, nrows=nrows)


def load_dataframe(
    content: bytes,
    filename: str,
    ds: DataSource,
    schema: str,
    table: str,
    mode: str,
) -> int:
    """Load a file into schema.table. Returns the resulting row count."""
    if not (is_valid_identifier(schema) and is_valid_identifier(table)):
        raise IngestError("Invalid schema or table name.")
    if mode not in ("overwrite", "append"):
        raise IngestError("Mode must be 'overwrite' or 'append'.")

    df = read_dataframe(content, filename)
    df.columns = [str(c).strip().replace(" ", "_") for c in df.columns]
    for c in df.columns:
        if not is_valid_identifier(str(c)):
            raise IngestError(f"Column '{c}' has characters that are not allowed.")

    engine = pg_engine_for_datasource(ds)
    try:
        with engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        df.to_sql(
            table,
            engine,
            schema=schema,
            if_exists="replace" if mode == "overwrite" else "append",
            index=False,
            method="multi",
            chunksize=1000,
        )
        with engine.connect() as conn:
            count = conn.execute(text(f'SELECT COUNT(*) FROM "{schema}"."{table}"')).scalar() or 0
        return int(count)
    except IngestError:
        raise
    except Exception as exc:
        raise IngestError(f"Failed to load table: {exc}") from exc
    finally:
        engine.dispose()
