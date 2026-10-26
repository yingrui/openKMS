"""File datasets: create the catalog entry, assemble versions, publish them, read them back.

A table dataset asks its source what it holds; a file dataset has to be **told**, and what it is told
has to stay true — which is why a version is frozen at publish and its manifest is written once.

Reading a file never goes through SQL: it reads parquet/CSV from object storage and does **column and
row selection** (predicates on a date column, column pruning). That is not a join, and this module
refuses to pretend otherwise — see the guards in `datasets.py`, `object_types.py` and
`dataset_tables.py`.
"""

from __future__ import annotations

import hashlib
import io
import json
import uuid
from datetime import date, datetime, timezone
from typing import Any

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion, DatasetVersionFile
from app.services.storage import get_object, get_redirect_url, object_exists, upload_object

#: The seeded source for the deployment's own bucket (see migration `d1f2a3b4c5d6`).
BUILTIN_SOURCE_ID = "00000000-0000-4000-8000-00000000f11e"

#: Columns that make a file sliceable; the first one present becomes the version's date column.
DATE_COLUMN_CANDIDATES = ("trade_date", "date", "dt", "as_of_date", "asof", "timestamp")

SUPPORTED_SUFFIXES = (".parquet", ".csv", ".jsonl", ".json")

#: A single file is downloaded whole before it is parsed (parquet needs a seekable stream), so its size is the
#: memory floor. Refuse the absurd ones by name instead of letting the process discover the limit.
MAX_READ_BYTES = 512 * 1024 * 1024


class FileDatasetError(ValueError):
    """A request the file dataset layer refuses; surfaced as HTTP 400."""


def version_prefix(dataset_id: str, version: int) -> str:
    return f"datasets/{dataset_id}/versions/{version}"


def manifest_key(dataset_id: str, version: int) -> str:
    return f"{version_prefix(dataset_id, version)}/manifest.json"


def file_key(dataset_id: str, version: int, name: str) -> str:
    return f"{version_prefix(dataset_id, version)}/files/{name}"


# --- reading a file --------------------------------------------------------------------


def read_file_bytes(
    content: bytes,
    name: str,
    *,
    nrows: int | None = None,
    columns: list[str] | None = None,
    filters: list[tuple[str, str, Any]] | None = None,
) -> pd.DataFrame:
    """Parse a file with the bounds the caller can afford — never the whole frame by accident.

    Reading is the expensive part, so the pruning happens **in the reader**: `columns` and `filters` go to
    pyarrow for parquet (column pruning and row-group skipping), `usecols`/`nrows` to the CSV parser. A file
    dataset can hold a season of tick data; a grid asking for 100 rows must not materialise all of it.
    """
    if len(content) > MAX_READ_BYTES:
        raise FileDatasetError(
            f"{name} is {len(content) // (1024 * 1024)} MB, over the {MAX_READ_BYTES // (1024 * 1024)} MB read "
            "limit. Narrow the version's files, or raise MAX_READ_BYTES deliberately."
        )
    suffix = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""
    if suffix not in SUPPORTED_SUFFIXES:
        raise FileDatasetError(f"Unsupported file type '{name}'. Use parquet, csv, jsonl or json.")
    try:
        if suffix == ".parquet":
            frame = pd.read_parquet(
                io.BytesIO(content), columns=columns, filters=filters or None
            )
            return frame.head(nrows) if nrows else frame
        if suffix == ".csv":
            frame = pd.read_csv(io.BytesIO(content), nrows=nrows, usecols=columns or None)
            return frame
        if suffix == ".jsonl":
            frame = pd.read_json(io.BytesIO(content), lines=True, nrows=nrows)
        else:
            frame = pd.read_json(io.BytesIO(content))
            if nrows:
                frame = frame.head(nrows)
        return frame[[c for c in (columns or []) if c in frame.columns]] if columns else frame
    except FileDatasetError:
        raise
    except Exception as exc:  # a corrupt file is the uploader's problem, not a server error
        raise FileDatasetError(f"Failed to parse {name}: {exc}") from exc


def date_column_of(columns: list[dict]) -> str | None:
    """Which recorded column carries the date — the candidate list, matched against what the version stored."""
    names = {entry.get("name") for entry in columns or []}
    return next((c for c in DATE_COLUMN_CANDIDATES if c in names), None)


def iter_filtered_frames(
    content: bytes,
    name: str,
    *,
    columns: list[str] | None,
    start: date | None,
    end: date | None,
    date_column: str | None,
    need: int,
):
    """Yield frames from one file that fall inside the window, ~50k rows at a time.

    A window is not "the first N rows": the rows it wants can be anywhere in the file, and a `nrows` cap before
    the filter silently returns nothing for any window that does not begin at the top. Bounded memory and a
    correct answer need both halves — chunked reads, a per-chunk filter, and a stop once `need` is satisfied.
    """
    suffix = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""
    if len(content) > MAX_READ_BYTES:
        raise FileDatasetError(
            f"{name} is {len(content) // (1024 * 1024)} MB, over the {MAX_READ_BYTES // (1024 * 1024)} MB read "
            "limit. Narrow the version's files, or raise MAX_READ_BYTES deliberately."
        )
    if suffix not in SUPPORTED_SUFFIXES:
        raise FileDatasetError(f"Unsupported file type '{name}'. Use parquet, csv, jsonl or json.")
    buffer = io.BytesIO(content)
    produced = 0
    try:
        if suffix == ".parquet":
            import pyarrow.parquet as pq

            # Batches, with `columns` pruned before decompression.
            chunks = (b.to_pandas() for b in pq.ParquetFile(buffer).iter_batches(batch_size=50_000, columns=columns or None))
        elif suffix == ".csv":
            chunks = pd.read_csv(buffer, usecols=columns or None, chunksize=50_000)
        elif suffix == ".jsonl":
            chunks = [pd.read_json(buffer, lines=True)]
        else:
            chunks = [pd.read_json(buffer)]
        for frame in chunks:
            if date_column and (start or end) and date_column in frame.columns:
                values = pd.to_datetime(frame[date_column], errors="coerce")
                if start:
                    frame = frame[values >= pd.Timestamp(start)]
                if end:
                    frame = frame[values <= pd.Timestamp(end)]
            if frame.empty:
                continue
            yield frame
            produced += len(frame)
            if produced >= need:
                return
    except FileDatasetError:
        raise
    except Exception as exc:  # a corrupt file is the uploader's problem, not a server error
        raise FileDatasetError(f"Failed to parse {name}: {exc}") from exc


def _json_type(dtype: Any) -> str:
    if pd.api.types.is_integer_dtype(dtype):
        return "integer"
    if pd.api.types.is_float_dtype(dtype):
        return "number"
    if pd.api.types.is_bool_dtype(dtype):
        return "boolean"
    if pd.api.types.is_datetime64_any_dtype(dtype):
        return "datetime"
    return "string"


def columns_of(frame: pd.DataFrame) -> list[dict]:
    return [{"name": str(c), "type": _json_type(frame[c].dtype)} for c in frame.columns]


def _date_column(frame: pd.DataFrame) -> str | None:
    for candidate in DATE_COLUMN_CANDIDATES:
        if candidate in frame.columns:
            return candidate
    return None


def _date_bounds(frame: pd.DataFrame) -> tuple[date | None, date | None]:
    column = _date_column(frame)
    if column is None or frame.empty:
        return None, None
    values = pd.to_datetime(frame[column], errors="coerce").dropna()
    if values.empty:
        return None, None
    return values.min().date(), values.max().date()


def _merge_schema(existing: list[dict], incoming: list[dict]) -> list[dict]:
    """Recorded, not enforced: a later file may carry a column an earlier one did not."""
    merged = {entry["name"]: entry for entry in existing or []}
    for entry in incoming:
        merged.setdefault(entry["name"], entry)
    return list(merged.values())


# --- writing ---------------------------------------------------------------------------


async def create_file_dataset(
    db: AsyncSession,
    *,
    display_name: str,
    description: str | None,
    owner_sub: str | None,
    owner_name: str | None,
    domain: str | None = None,
    tags: list | None = None,
) -> Dataset:
    dataset = Dataset(
        id=str(uuid.uuid4()),
        data_source_id=BUILTIN_SOURCE_ID,
        kind="file",
        schema_name=None,
        table_name=None,
        display_name=display_name,
        description=description,
        domain=domain,
        tags=tags or [],
        owner_sub=owner_sub,
        created_by=owner_sub,
        created_by_name=owner_name,
        is_editable=False,
    )
    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)
    return dataset


async def get_version(db: AsyncSession, dataset_id: str, version: int) -> DatasetVersion:
    row = (
        await db.execute(
            select(DatasetVersion).where(
                DatasetVersion.dataset_id == dataset_id, DatasetVersion.version == version
            )
        )
    ).scalars().first()
    if row is None:
        raise FileDatasetError(f"dataset has no version {version}")
    return row


async def open_version(db: AsyncSession, dataset: Dataset, *, notes: str | None, user: dict) -> DatasetVersion:
    """Open the next draft. Numbering never reuses: a deleted draft burns its number."""
    highest = (
        await db.execute(
            select(func.max(DatasetVersion.version)).where(DatasetVersion.dataset_id == dataset.id)
        )
    ).scalar() or 0
    row = DatasetVersion(
        id=str(uuid.uuid4()),
        dataset_id=dataset.id,
        version=int(highest) + 1,
        notes=notes,
        status="draft",
        columns=[],
        created_by=user.get("sub"),
        created_by_name=user.get("name"),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def add_file(
    db: AsyncSession,
    dataset: Dataset,
    version: DatasetVersion,
    *,
    name: str,
    content: bytes,
    user: dict,
) -> DatasetVersionFile:
    """Store one file in this version's prefix and record what is inside it."""
    if version.status != "draft":
        raise FileDatasetError(
            f"v{version.version} is {version.status}: files can only be added to a draft"
        )
    safe_name = name.replace("/", "_").strip()
    if not safe_name or safe_name in (".", ".."):
        raise FileDatasetError("a file needs a usable name")

    existing = await db.get(DatasetVersionFile, {"version_id": version.id, "name": safe_name})
    if existing is not None:
        raise FileDatasetError(f"{safe_name} is already in v{version.version}")
    file_exists = (
        await db.execute(
            select(DatasetVersionFile).where(
                DatasetVersionFile.version_id == version.id, DatasetVersionFile.name == safe_name
            )
        )
    ).scalars().first()
    if file_exists is not None:  # pragma: no cover - defensive, mirrors the check above
        raise FileDatasetError(f"{safe_name} is already in v{version.version}")

    frame = read_file_bytes(content, safe_name)
    key = file_key(dataset.id, version.version, safe_name)
    upload_object(key, content, "application/octet-stream")

    date_from, date_to = _date_bounds(frame)
    row = DatasetVersionFile(
        version_id=version.id,
        name=safe_name,
        storage_key=key,
        sha256=hashlib.sha256(content).hexdigest(),
        columns=columns_of(frame),
        rows=int(len(frame)),
        bytes=len(content),
        date_from=date_from,
        date_to=date_to,
        created_by=user.get("sub"),
    )
    db.add(row)
    await db.flush()
    await _refresh_totals(db, version)
    await db.commit()
    await db.refresh(row)
    return row


async def remove_file(db: AsyncSession, version: DatasetVersion, name: str) -> None:
    if version.status != "draft":
        raise FileDatasetError(f"v{version.version} is {version.status}: its files are frozen")
    row = (
        await db.execute(
            select(DatasetVersionFile).where(
                DatasetVersionFile.version_id == version.id, DatasetVersionFile.name == name
            )
        )
    ).scalars().first()
    if row is None:
        raise FileDatasetError(f"no file {name} in v{version.version}")
    await db.delete(row)
    await db.flush()
    await _refresh_totals(db, version)
    await db.commit()


async def reuse_files(
    db: AsyncSession, dataset: Dataset, version: DatasetVersion, from_version: int
) -> int:
    """Carry a previous version's files into this draft without copying any object."""
    if version.status != "draft":
        raise FileDatasetError(f"v{version.version} is {version.status}: files are frozen")
    source = await get_version(db, dataset.id, from_version)
    if source.status == "draft":
        raise FileDatasetError(f"v{from_version} is a draft: publish it before reusing its files")
    files = (
        await db.execute(
            select(DatasetVersionFile).where(DatasetVersionFile.version_id == source.id)
        )
    ).scalars().all()
    for source_file in files:
        db.add(
            DatasetVersionFile(
                version_id=version.id,
                name=source_file.name,
                storage_key=source_file.storage_key,
                sha256=source_file.sha256,
                rows=source_file.rows,
                bytes=source_file.bytes,
                date_from=source_file.date_from,
                date_to=source_file.date_to,
                reused_from_version=from_version,
            )
        )
    await db.flush()
    await _refresh_totals(db, version)
    await db.commit()
    return len(files)


async def _refresh_totals(db: AsyncSession, version: DatasetVersion) -> None:
    files = (
        await db.execute(
            select(DatasetVersionFile).where(DatasetVersionFile.version_id == version.id)
        )
    ).scalars().all()
    version.file_count = len(files)
    version.row_count = sum(int(f.rows or 0) for f in files)
    version.byte_size = sum(int(f.bytes or 0) for f in files)
    starts = [f.date_from for f in files if f.date_from]
    ends = [f.date_to for f in files if f.date_to]
    version.date_from = min(starts) if starts else None
    version.date_to = max(ends) if ends else None
    version.columns = _merge_schema(version.columns or [], _schema_from_files(files))
    await db.flush()


def _schema_from_files(files: list[DatasetVersionFile]) -> list[dict]:
    # A draft can be assembled from files added at different times; the schema is the union, and it
    # is recorded (for a reader's expectation), not enforced.
    return [entry for f in files for entry in (f.columns or [])]


async def publish(db: AsyncSession, dataset: Dataset, version: DatasetVersion) -> DatasetVersion:
    """Freeze the version: write its manifest, then make it pinnable."""
    if version.status != "draft":
        raise FileDatasetError(f"v{version.version} is already {version.status}")
    files = (
        await db.execute(
            select(DatasetVersionFile)
            .where(DatasetVersionFile.version_id == version.id)
            .order_by(DatasetVersionFile.name)
        )
    ).scalars().all()
    if not files:
        raise FileDatasetError("a version needs at least one file before it can be published")

    key = manifest_key(dataset.id, version.version)
    manifest = {
        "dataset_id": dataset.id,
        "dataset_name": dataset.display_name,
        "version": version.version,
        "notes": version.notes,
        "created_by": version.created_by_name or version.created_by,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "schema": version.columns or [],
        "files": [
            {
                "name": f.name,
                "key": f.storage_key,
                "reused_from_version": f.reused_from_version,
                "rows": int(f.rows or 0),
                "bytes": int(f.bytes or 0),
                "sha256": f.sha256,
                "date_range": [
                    f.date_from.isoformat() if f.date_from else None,
                    f.date_to.isoformat() if f.date_to else None,
                ],
            }
            for f in files
        ],
    }
    upload_object(key, json.dumps(manifest, ensure_ascii=False, indent=1).encode(), "application/json")
    version.manifest_key = key
    version.status = "published"
    version.published_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(version)
    return version


async def deprecate(db: AsyncSession, version: DatasetVersion) -> DatasetVersion:
    if version.status != "published":
        raise FileDatasetError(f"only a published version can be deprecated (v{version.version} is {version.status})")
    version.status = "deprecated"
    await db.commit()
    await db.refresh(version)
    return version


async def list_versions(db: AsyncSession, dataset_id: str) -> list[DatasetVersion]:
    return list(
        (
            await db.execute(
                select(DatasetVersion)
                .where(DatasetVersion.dataset_id == dataset_id)
                .order_by(DatasetVersion.version)
            )
        ).scalars().all()
    )


async def version_files(db: AsyncSession, version: DatasetVersion) -> list[DatasetVersionFile]:
    return list(
        (
            await db.execute(
                select(DatasetVersionFile)
                .where(DatasetVersionFile.version_id == version.id)
                .order_by(DatasetVersionFile.name)
            )
        ).scalars().all()
    )


async def download_url(db: AsyncSession, version: DatasetVersion, name: str, *, expires_in: int = 900) -> str:
    if version.status == "draft":
        raise FileDatasetError(f"v{version.version} is a draft: publish it before handing out links")
    files = {f.name: f for f in await version_files(db, version)}
    target = files.get(name)
    if target is None:
        raise FileDatasetError(f"no file {name} in v{version.version}")
    if not object_exists(target.storage_key):
        raise FileDatasetError(f"the stored object for {name} is missing")
    return get_redirect_url(target.storage_key, expires_in=expires_in)


async def preview(db: AsyncSession, version: DatasetVersion, *, limit: int = 100) -> dict:
    """First rows of the version, read in file order (which is slice order, e.g. by month)."""
    files = await version_files(db, version)
    if not files:
        return {"columns": [], "rows": [], "file": None}
    frame = read_file_bytes(get_object(files[0].storage_key), files[0].name, nrows=limit)
    return {
        "file": files[0].name,
        "columns": [str(c) for c in frame.columns],
        "rows": json.loads(frame.head(limit).to_json(orient="records", date_format="iso")),
    }


async def rows(
    db: AsyncSession,
    version: DatasetVersion,
    *,
    columns: list[str] | None = None,
    start: date | None = None,
    end: date | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """Column and row selection across the version's files — no join, no SQL.

    Files whose recorded date range misses the window are skipped without being read, which is what
    makes "only June to September" cheap.
    """
    if version.status == "draft":
        raise FileDatasetError(f"v{version.version} is a draft: publish it before reading it")
    files = await version_files(db, version)
    if columns:
        known = {entry["name"] for entry in (version.columns or [])}
        unknown = [c for c in columns if c not in known]
        if unknown:
            raise FileDatasetError(f"not in this version: {', '.join(sorted(unknown))}")

    date_column = date_column_of(version.columns or [])
    collected: list[pd.DataFrame] = []
    skip = offset
    produced = 0
    for f in files:
        if start and f.date_to and f.date_to < start:
            continue
        if end and f.date_from and f.date_from > end:
            continue
        # Chunked, filtered, and stopped once this page is full: a window can start anywhere in the file, so a
        # `nrows` cap before the filter is not an optimisation, it is a wrong answer.
        for frame in iter_filtered_frames(
            get_object(f.storage_key),
            f.name,
            columns=columns,
            start=start,
            end=end,
            date_column=date_column,
            need=offset + limit + 1,
        ):
            if skip >= len(frame):
                skip -= len(frame)
                continue
            collected.append(frame.iloc[skip:])
            skip = 0
            produced += len(collected[-1])
            if produced >= limit:
                break
        if produced >= limit:
            break

    if not collected:
        return {"columns": list(columns or []), "rows": [], "total_scanned": produced}
    frame = pd.concat(collected, ignore_index=True).iloc[offset: offset + limit]
    return {
        "columns": [str(c) for c in frame.columns],
        "rows": json.loads(frame.to_json(orient="records", date_format="iso")),
        "total_scanned": produced,
    }
