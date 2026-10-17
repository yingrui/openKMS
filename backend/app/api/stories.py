"""Stories API — saved analyses for the Data Insights app.

A **story** is the document: a question, a narrative, and the **findings** in it. Each finding owns
its **source** (a dataset or a semantic model) and the query it came from, so one story can mix
sources and `POST /{id}/run` re-runs each finding through its own engine.

**Permissions.** Stories have their own keys (`insights:read` / `insights:write`): an analysis is
not the same grant as the data it came from. Re-running is a **read** (it recomputes each finding from
its source and writes only our own cached results), so the run needs `insights:read`.

**Each finding's source ACL still applies.** Results are stored, so reading a finding is reading the
data behind it: a finding whose source this caller may not read answers with a classified
`REPORT_SOURCE_FORBIDDEN` **instead of its rows**, and a story is listed only while at least
one of its findings (or none — a draft) is readable. Semantic models carry no per-resource ACL, so
they are gated by the data-layer keys alone.
"""
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.database import get_db
from app.api.query_errors import query_failure_detail
from app.models.story import Story
from app.models.dataset import Dataset
from app.models.semantic_model import SemanticModel
from app.schemas.story import (
    StoryCreate,
    StoryListResponse,
    StoryResponse,
    StorySource,
    StorySummary,
    StoryUpdate,
)
from app.services.data_layer.dataset_rows import query_dataset_rows, query_dataset_summary
from app.services.data_layer.stories import (
    SOURCE_SEMANTIC_MODEL,
    FindingSource,
    dataset_query_kwargs,
    dataset_summary_kwargs,
    is_summary_query,
    model_query_kwargs,
    finding_source,
    source_failure,
    source_forbidden,
)
from app.services.data_layer.query import QueryError, run_query
from app.services.data_layer.query_errors import QueryFailure
from app.services.data_layer.row_filters import RowFilterError
from app.services.acl.resource_acl_constants import PERM_READ, RT_DATASET
from app.services.acl.resource_acl_service import readable_resource_ids
from app.services.evaluations.dataset_scope import load_dataset_scoped
from app.services.permissions.permission_catalog import PERM_INSIGHTS_READ, PERM_INSIGHTS_WRITE

router = APIRouter(
    prefix="/stories",
    tags=["stories"],
    dependencies=[Depends(require_auth)],
)
_VIEW = (PERM_INSIGHTS_READ,)
_WRITE = (PERM_INSIGHTS_WRITE,)

#: Stored per-finding result keys — dropped when the caller may not read that finding's source.
_RESULT_KEYS = ("columns", "rows", "total", "capped", "duration_ms", "sql")


def _failure_dict(failure: QueryFailure) -> dict:
    """What a run persists for a failed finding: the code + kind, never a localized string."""
    return {
        "code": failure.code,
        "kind": failure.kind,
        "detail": failure.detail,
        "params": failure.params,
    }


def _localize(finding: dict, request: Request) -> dict:
    """A stored failure, with its message localized for the caller."""
    error = finding.get("error")
    if isinstance(error, dict) and isinstance(error.get("code"), str):
        failure = QueryFailure(
            error["code"],
            error.get("kind") or "request",
            error.get("detail"),
            error.get("params") or {},
        )
        return {**finding, "error": query_failure_detail(request, failure)}
    return finding


def _findings_response(
    story: Story, request: Request, readable: set[str] | None
) -> list[dict] | None:
    """The story's findings, each localized — and reduced when its source is out of reach.

    `readable` is the caller's readable dataset ids (`None` = every dataset), so a finding this caller
    may not read keeps its existence and title but loses the rows it once returned.
    """
    if story.findings is None:
        return None
    out: list[dict] = []
    for entry in story.findings:
        if not isinstance(entry, dict):
            out.append(entry)
            continue
        source = finding_source(entry)
        if not _may_read(source, readable):
            failure = query_failure_detail(request, source_forbidden(source))
            hidden = {k: v for k, v in entry.items() if k not in _RESULT_KEYS}
            out.append({**hidden, "error": failure, "ran_at": None})
            continue
        out.append(_localize(entry, request))
    return out


def _response(
    story: Story, request: Request | None = None, readable: set[str] | None = None
) -> StoryResponse:
    return StoryResponse(
        id=story.id,
        name=story.name,
        question=story.question,
        status=story.status,
        narrative=story.narrative,
        findings=_findings_response(story, request, readable) if request is not None else story.findings,
        created_by_name=story.created_by_name,
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


def _may_read(source: FindingSource, readable: set[str] | None) -> bool:
    """Datasets carry per-resource ACLs (`readable` = the caller's); semantic models do not."""
    if source.kind == SOURCE_SEMANTIC_MODEL:
        return True
    if readable is None:
        return True
    return bool(source.dataset_id) and source.dataset_id in readable


async def _readable_datasets(db: AsyncSession, request: Request) -> set[str] | None:
    """The dataset ids this caller may read; `None` when ACLs do not restrict them."""
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")
    return await readable_resource_ids(
        db, payload, sub if isinstance(sub, str) else None, RT_DATASET
    )


async def _source_labels(db: AsyncSession, sources: list[StorySource]) -> None:
    """Name the sources in place — two queries for the whole page, not one per finding."""
    dataset_ids = {s.id for s in sources if s.kind != SOURCE_SEMANTIC_MODEL}
    model_ids = {s.id for s in sources if s.kind == SOURCE_SEMANTIC_MODEL}
    labels: dict[str, str] = {}
    if dataset_ids:
        rows = (
            await db.execute(
                select(Dataset.id, Dataset.display_name, Dataset.schema_name, Dataset.table_name).where(
                    Dataset.id.in_(dataset_ids)
                )
            )
        ).all()
        labels.update(
            {str(i): (display or f"{schema}.{table}") for i, display, schema, table in rows}
        )
    if model_ids:
        rows = (
            await db.execute(select(SemanticModel.id, SemanticModel.name).where(SemanticModel.id.in_(model_ids)))
        ).all()
        labels.update({str(i): str(name) for i, name in rows})
    for source in sources:
        source.label = labels.get(source.id, source.id)


def _summary(story: Story, readable: set[str] | None) -> StorySummary:
    """A list entry: only the findings this caller may read are counted (and their sources named)."""
    sources: list[StorySource] = []
    seen: set[tuple[str, str | None]] = set()
    finding_count = 0
    for entry in story.findings or []:
        source = finding_source(entry)
        if not _may_read(source, readable):
            continue
        finding_count += 1
        key = (source.kind, source.resource_id)
        if source.resource_id and key not in seen:
            seen.add(key)
            sources.append(StorySource(kind=source.kind, id=source.resource_id, label=source.resource_id))
    return StorySummary(
        id=story.id,
        name=story.name,
        question=story.question,
        status=story.status,
        finding_count=finding_count,
        sources=sources,
        created_by_name=story.created_by_name,
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


async def _get(db: AsyncSession, story_id: str) -> Story:
    row = await db.get(Story, story_id)
    if not row:
        raise HTTPException(status_code=404, detail="Story not found")
    return row


async def _require_sources(db: AsyncSession, request: Request, story: Story) -> None:
    """Every finding must name a source the caller may read — fail early, not at run time."""
    for entry in story.findings or []:
        source = finding_source(entry)
        if source.kind == SOURCE_SEMANTIC_MODEL:
            continue
        if not source.dataset_id:
            continue  # a finding may still be a draft; `run` findings the missing source
        await load_dataset_scoped(db, request, source.dataset_id, PERM_READ)


@router.get(
    "",
    response_model=StoryListResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_stories(
    request: Request,
    search: str | None = None,
    dataset_id: str | None = Query(None, description="only stories with a finding on this dataset"),
    db: AsyncSession = Depends(get_db),
):
    """Stories with at least one readable finding (or none yet, when a draft just started).

    `dataset_id` is the reverse lookup a catalog needs: "which stories read this table?" — a finding
    carries its own source, so it is a question about the findings, not about the story.
    """
    readable = await _readable_datasets(db, request)
    rows = (
        await db.execute(select(Story).order_by(Story.updated_at.desc()))
    ).scalars().all()
    needle = (search or "").strip().casefold()
    visible = [
        d
        for d in rows
        if (not d.findings or any(_may_read(finding_source(e), readable) for e in d.findings))
        and (
            not dataset_id
            or any(finding_source(e).dataset_id == dataset_id for e in (d.findings or []))
        )
        and (
            not needle
            or any(
                needle in field.casefold()
                for field in (d.name, d.question or "", d.narrative or "")
            )
        )
    ]
    summaries = [_summary(d, readable) for d in visible]
    await _source_labels(db, [s for summary in summaries for s in summary.sources])
    return StoryListResponse(items=summaries, total=len(summaries))


@router.post(
    "",
    response_model=StoryResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_INSIGHTS_WRITE))],
)
async def create_story(
    request: Request,
    body: StoryCreate,
    db: AsyncSession = Depends(get_db),
):
    payload = request.state.openkms_jwt_payload
    uname = payload.get("preferred_username") or payload.get("name")
    story = Story(
        id=str(uuid.uuid4()),
        name=body.name,
        question=body.question,
        status=body.status,
        narrative=body.narrative,
        findings=body.findings,
        created_by=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    await _require_sources(db, request, story)
    db.add(story)
    await db.commit()
    await db.refresh(story)
    return _response(story, request, await _readable_datasets(db, request))


@router.get(
    "/{story_id}",
    response_model=StoryResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def get_story(story_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    story = await _get(db, story_id)
    return _response(story, request, await _readable_datasets(db, request))


@router.put(
    "/{story_id}",
    response_model=StoryResponse,
    dependencies=[Depends(require_permission(PERM_INSIGHTS_WRITE))],
)
async def update_story(
    story_id: str,
    request: Request,
    body: StoryUpdate,
    db: AsyncSession = Depends(get_db),
):
    story = await _get(db, story_id)
    data = body.model_dump(exclude_unset=True)
    for field in ("name", "question", "status", "narrative", "findings"):
        if field in data:
            setattr(story, field, data[field])
    # Findings may keep a source the caller has since lost access to (that is findinged per finding);
    # a **new** binding has to be one they can read.
    if "findings" in data:
        await _require_sources(db, request, story)
    await db.commit()
    await db.refresh(story)
    return _response(story, request, await _readable_datasets(db, request))


async def _run_finding(
    db: AsyncSession,
    entry: dict,
    source_error: QueryFailure | None,
) -> dict:
    """Run one finding through its own source. A failure is recorded on it, never raised: one broken
    finding must not hide the others."""
    ran_at = datetime.now(timezone.utc).isoformat()
    if source_error is not None:
        return {**entry, "error": _failure_dict(source_error), "ran_at": ran_at}
    source = finding_source(entry)
    try:
        if source.kind == SOURCE_SEMANTIC_MODEL:
            sql, columns, rows, capped, duration_ms = await run_query(
                db,
                model_id=source.semantic_model_id or "",
                **model_query_kwargs(entry.get("query")),
            )
            result = {
                "columns": columns,
                "rows": rows,
                "capped": capped,
                "duration_ms": duration_ms,
                "sql": sql,
            }
        elif is_summary_query(entry.get("query")):
            summary = await query_dataset_summary(
                db, source.dataset_id or "", **dataset_summary_kwargs(entry.get("query"))
            )
            result = {
                "sql": summary.sql,
                "columns": summary.columns,
                "rows": summary.rows,
                # `total` = the summary's rows (one per group).
                "total": summary.row_count,
                "capped": summary.capped,
                "duration_ms": summary.duration_ms,
            }
        else:
            started = time.perf_counter()
            page = await query_dataset_rows(
                db, source.dataset_id or "", **dataset_query_kwargs(entry.get("query"))
            )
            result = {
                "sql": page.sql,
                "columns": page.columns,
                "rows": page.rows,
                # `total` counts the rows the filters match — the page may be a slice of it.
                "total": page.total,
                "capped": page.capped,
                "duration_ms": int((time.perf_counter() - started) * 1000),
            }
    except (QueryError, RowFilterError) as exc:
        return {**entry, "error": _failure_dict(exc.failure), "ran_at": ran_at}
    return {**entry, **result, "error": None, "ran_at": ran_at}


@router.post(
    "/{story_id}/run",
    response_model=StoryResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def run_story(story_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Run every finding against **its own** source and keep the results.

    Both engines are read-only and capped. A finding whose source the caller may not read stores the
    classified `REPORT_SOURCE_FORBIDDEN` (and the response never carries its old rows); any other
    failing finding stores its own classified reason while the rest still run.
    """
    story = await _get(db, story_id)
    readable = await _readable_datasets(db, request)
    findings: list[dict] = []
    for entry in story.findings or []:
        source = finding_source(entry)
        if not _may_read(source, readable):
            findings.append({**entry, "error": _failure_dict(source_forbidden(source)), "ran_at": None})
            continue
        findings.append(await _run_finding(db, entry, source_failure(source)))
    story.findings = findings
    await db.commit()
    await db.refresh(story)
    return _response(story, request, readable)


@router.delete(
    "/{story_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_INSIGHTS_WRITE))],
)
async def delete_story(story_id: str, db: AsyncSession = Depends(get_db)):
    story = await _get(db, story_id)
    await db.delete(story)
