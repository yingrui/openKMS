"""Evaluation dataset API for KB search retrieval evaluation."""
import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.services.data_scope import effective_evaluation_dataset_ids, scope_applies
from app.models.evaluation_dataset import EvaluationDataset, EvaluationDatasetItem
from app.models.evaluation_run import EvaluationRun, EvaluationRunItem
from app.models.knowledge_base import KnowledgeBase
from app.schemas.evaluation_dataset import (
    EvaluationCompareResponse,
    EvaluationCompareRow,
    EvaluationDatasetCreate,
    EvaluationDatasetItemCreate,
    EvaluationDatasetItemListResponse,
    EvaluationDatasetItemResponse,
    EvaluationDatasetItemUpdate,
    EvaluationDatasetListResponse,
    EvaluationDatasetResponse,
    EvaluationDatasetUpdate,
    EvaluationRunListItem,
    EvaluationRunListResponse,
    EvaluationRunRequestBody,
    EvaluationRunResponse,
    EvaluationRunResult,
    SearchResultSnippet,
)
from app.services.evaluation.execute import (
    ALLOWED_EVALUATION_TYPES,
    EVALUATION_TYPE_QA_ANSWER,
    EVALUATION_TYPE_SEARCH_RETRIEVAL,
    resolve_judge_config,
    run_qa_answer_evaluation,
    run_search_retrieval_evaluation,
)

router = APIRouter(
    prefix="/evaluation-datasets",
    tags=["evaluation-datasets"],
    dependencies=[Depends(require_auth)],
)


async def get_eval_dataset_scoped(
    dataset_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvaluationDataset:
    ds = await db.get(EvaluationDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        allowed = await effective_evaluation_dataset_ids(db, sub)
        if allowed is not None and dataset_id not in allowed:
            raise HTTPException(status_code=404, detail="Evaluation dataset not found")
    return ds


async def _item_count(db: AsyncSession, dataset_id: str) -> int:
    return (await db.execute(
        select(func.count()).select_from(EvaluationDatasetItem).where(
            EvaluationDatasetItem.evaluation_dataset_id == dataset_id
        )
    )).scalar_one()


def _dataset_to_response(
    ds: EvaluationDataset, kb_name: str | None, item_count: int
) -> EvaluationDatasetResponse:
    return EvaluationDatasetResponse(
        id=ds.id,
        name=ds.name,
        knowledge_base_id=ds.knowledge_base_id,
        knowledge_base_name=kb_name,
        description=ds.description,
        item_count=item_count,
        created_at=ds.created_at,
        updated_at=ds.updated_at,
    )


def _aggregates(item_rows: list[dict]) -> tuple[int, int, float | None]:
    n = len(item_rows)
    if n == 0:
        return 0, 0, None
    pc = sum(1 for r in item_rows if r.get("passed"))
    avg = sum(float(r.get("score", 0)) for r in item_rows) / n
    return n, pc, avg


def _snippet_model_from_dict(s: dict) -> SearchResultSnippet:
    return SearchResultSnippet(
        content=str(s.get("content", "")),
        score=float(s.get("score", 0)),
        source_type=str(s.get("source_type", "unknown")),
    )


def _result_dicts_to_schemas(evaluation_type: str, rows: list[dict]) -> list[EvaluationRunResult]:
    out: list[EvaluationRunResult] = []
    for r in rows:
        detail = r.get("detail") or {}
        srs = [_snippet_model_from_dict(s) for s in (detail.get("search_results") or [])]
        qas = [_snippet_model_from_dict(s) for s in (detail.get("sources") or [])]
        out.append(
            EvaluationRunResult(
                item_id=r["evaluation_dataset_item_id"],
                query=r["query"],
                expected_answer=r["expected_answer"],
                search_results=srs if evaluation_type == EVALUATION_TYPE_SEARCH_RETRIEVAL else [],
                generated_answer=detail.get("answer") if evaluation_type == EVALUATION_TYPE_QA_ANSWER else None,
                qa_sources=qas if evaluation_type == EVALUATION_TYPE_QA_ANSWER else [],
                pass_=bool(r.get("passed")),
                score=float(r.get("score", 0)),
                reasoning=str(r.get("reasoning", "")),
            )
        )
    return out


def _run_item_to_result(
    ri: EvaluationRunItem, item: EvaluationDatasetItem, evaluation_type: str
) -> EvaluationRunResult:
    detail = ri.detail or {}
    srs = [_snippet_model_from_dict(s) for s in (detail.get("search_results") or [])]
    qas = [_snippet_model_from_dict(s) for s in (detail.get("sources") or [])]
    return EvaluationRunResult(
        item_id=item.id,
        query=item.query,
        expected_answer=item.expected_answer,
        search_results=srs if evaluation_type == EVALUATION_TYPE_SEARCH_RETRIEVAL else [],
        generated_answer=detail.get("answer") if evaluation_type == EVALUATION_TYPE_QA_ANSWER else None,
        qa_sources=qas if evaluation_type == EVALUATION_TYPE_QA_ANSWER else [],
        pass_=ri.passed,
        score=float(ri.score),
        reasoning=ri.reasoning or "",
    )


async def _persist_run(
    db: AsyncSession,
    *,
    dataset_id: str,
    knowledge_base_id: str,
    evaluation_type: str,
    config_snapshot: dict | None,
    item_rows: list[dict],
    status: str = "completed",
    error_message: str | None = None,
) -> EvaluationRun:
    n, pc, avg = _aggregates(item_rows)
    run = EvaluationRun(
        id=str(uuid.uuid4()),
        evaluation_dataset_id=dataset_id,
        knowledge_base_id=knowledge_base_id,
        evaluation_type=evaluation_type,
        status=status,
        error_message=error_message,
        item_count=n,
        pass_count=pc,
        avg_score=avg,
        config_snapshot=config_snapshot,
        finished_at=datetime.now(timezone.utc),
    )
    db.add(run)
    await db.flush()
    for r in item_rows:
        db.add(
            EvaluationRunItem(
                id=str(uuid.uuid4()),
                evaluation_run_id=run.id,
                evaluation_dataset_item_id=r["evaluation_dataset_item_id"],
                passed=bool(r.get("passed")),
                score=float(r.get("score", 0)),
                reasoning=str(r.get("reasoning", "")),
                detail=r.get("detail"),
            )
        )
    await db.flush()
    await db.refresh(run)
    return run


def _run_to_response(run: EvaluationRun, results: list[EvaluationRunResult]) -> EvaluationRunResponse:
    return EvaluationRunResponse(
        run_id=run.id,
        evaluation_type=run.evaluation_type,
        status=run.status,
        item_count=run.item_count,
        pass_count=run.pass_count,
        avg_score=run.avg_score,
        error_message=run.error_message,
        results=results,
    )


# --- CRUD ---

@router.get("", response_model=EvaluationDatasetListResponse)
async def list_evaluation_datasets(
    request: Request,
    knowledge_base_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(EvaluationDataset).order_by(EvaluationDataset.created_at.desc())
    if knowledge_base_id:
        q = q.where(EvaluationDataset.knowledge_base_id == knowledge_base_id)
    result = await db.execute(q)
    datasets = list(result.scalars().all())
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        allowed = await effective_evaluation_dataset_ids(db, sub)
        if allowed is not None:
            if not allowed:
                return EvaluationDatasetListResponse(items=[], total=0)
            datasets = [ds for ds in datasets if ds.id in allowed]
    items = []
    for ds in datasets:
        kb = await db.get(KnowledgeBase, ds.knowledge_base_id)
        count = await _item_count(db, ds.id)
        items.append(_dataset_to_response(ds, kb.name if kb else None, count))
    return EvaluationDatasetListResponse(items=items, total=len(items))


@router.post("", response_model=EvaluationDatasetResponse, status_code=201)
async def create_evaluation_dataset(
    body: EvaluationDatasetCreate,
    db: AsyncSession = Depends(get_db),
):
    kb = await db.get(KnowledgeBase, body.knowledge_base_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    ds = EvaluationDataset(
        id=str(uuid.uuid4()),
        name=body.name,
        knowledge_base_id=body.knowledge_base_id,
        description=body.description,
    )
    db.add(ds)
    await db.flush()
    await db.refresh(ds)
    return _dataset_to_response(ds, kb.name, 0)


@router.get("/{dataset_id}", response_model=EvaluationDatasetResponse)
async def get_evaluation_dataset(
    dataset_id: str,
    ds: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    kb = await db.get(KnowledgeBase, ds.knowledge_base_id)
    count = await _item_count(db, ds.id)
    return _dataset_to_response(ds, kb.name if kb else None, count)


@router.put("/{dataset_id}", response_model=EvaluationDatasetResponse)
async def update_evaluation_dataset(
    dataset_id: str,
    body: EvaluationDatasetUpdate,
    ds: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ds, field, value)
    await db.flush()
    await db.refresh(ds)
    kb = await db.get(KnowledgeBase, ds.knowledge_base_id)
    count = await _item_count(db, ds.id)
    return _dataset_to_response(ds, kb.name if kb else None, count)


@router.delete("/{dataset_id}", status_code=204)
async def delete_evaluation_dataset(
    dataset_id: str,
    ds: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    await db.delete(ds)


# --- Items ---

@router.get("/{dataset_id}/items", response_model=EvaluationDatasetItemListResponse)
async def list_evaluation_dataset_items(
    dataset_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=200),
    ds: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    count_q = await db.execute(
        select(func.count()).select_from(EvaluationDatasetItem).where(
            EvaluationDatasetItem.evaluation_dataset_id == dataset_id
        )
    )
    total = count_q.scalar_one()
    result = await db.execute(
        select(EvaluationDatasetItem)
        .where(EvaluationDatasetItem.evaluation_dataset_id == dataset_id)
        .order_by(EvaluationDatasetItem.sort_order, EvaluationDatasetItem.created_at)
        .offset(offset)
        .limit(limit)
    )
    rows = result.scalars().all()
    return EvaluationDatasetItemListResponse(
        items=[EvaluationDatasetItemResponse.model_validate(i) for i in rows],
        total=total,
    )


@router.post("/{dataset_id}/items", response_model=EvaluationDatasetItemResponse, status_code=201)
async def create_evaluation_dataset_item(
    dataset_id: str,
    body: EvaluationDatasetItemCreate,
    ds: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    item = EvaluationDatasetItem(
        id=str(uuid.uuid4()),
        evaluation_dataset_id=dataset_id,
        query=body.query,
        expected_answer=body.expected_answer,
        topic=body.topic,
        sort_order=body.sort_order,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return EvaluationDatasetItemResponse(
        id=item.id,
        evaluation_dataset_id=item.evaluation_dataset_id,
        query=item.query,
        expected_answer=item.expected_answer,
        topic=item.topic,
        sort_order=item.sort_order,
        created_at=item.created_at,
    )


@router.put("/{dataset_id}/items/{item_id}", response_model=EvaluationDatasetItemResponse)
async def update_evaluation_dataset_item(
    dataset_id: str,
    item_id: str,
    body: EvaluationDatasetItemUpdate,
    ds: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(EvaluationDatasetItem, item_id)
    if not item or item.evaluation_dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Evaluation dataset item not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return EvaluationDatasetItemResponse(
        id=item.id,
        evaluation_dataset_id=item.evaluation_dataset_id,
        query=item.query,
        expected_answer=item.expected_answer,
        topic=item.topic,
        sort_order=item.sort_order,
        created_at=item.created_at,
    )


@router.post("/{dataset_id}/items/import")
async def import_evaluation_dataset_items(
    dataset_id: str,
    file: UploadFile = File(...),
    ds: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Import evaluation items from a CSV file. Expected columns: topic (optional), query, answer or expected_answer."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no headers")

    # Normalize column names (lowercase, strip)
    normalized = {h.strip().lower(): h for h in reader.fieldnames}
    query_col = normalized.get("query")
    answer_col = normalized.get("answer") or normalized.get("expected_answer")
    topic_col = normalized.get("topic")

    if not query_col or not answer_col:
        raise HTTPException(
            status_code=400,
            detail="CSV must have 'query' and 'answer' (or 'expected_answer') columns",
        )

    created = 0
    for idx, row in enumerate(reader):
        query = (row.get(query_col) or "").strip()
        expected = (row.get(answer_col) or "").strip()
        if not query or not expected:
            continue
        topic_val = (row.get(topic_col) or "").strip() if topic_col else None
        topic_val = topic_val or None

        item = EvaluationDatasetItem(
            id=str(uuid.uuid4()),
            evaluation_dataset_id=dataset_id,
            query=query,
            expected_answer=expected,
            topic=topic_val,
            sort_order=idx,
        )
        db.add(item)
        created += 1

    await db.flush()
    return {"imported": created}


@router.delete("/{dataset_id}/items/{item_id}", status_code=204)
async def delete_evaluation_dataset_item(
    dataset_id: str,
    item_id: str,
    ds: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(EvaluationDatasetItem, item_id)
    if not item or item.evaluation_dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Evaluation dataset item not found")
    await db.delete(item)


# --- Run evaluation & persisted reports ---


@router.get("/{dataset_id}/runs/compare", response_model=EvaluationCompareResponse)
async def compare_evaluation_runs(
    dataset_id: str,
    run_a: str = Query(..., description="First evaluation run id"),
    run_b: str = Query(..., description="Second evaluation run id"),
    _: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Compare two runs item-by-item (pass/score deltas)."""
    ra = await db.get(EvaluationRun, run_a)
    rb = await db.get(EvaluationRun, run_b)
    if not ra or ra.evaluation_dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Run A not found for this dataset")
    if not rb or rb.evaluation_dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Run B not found for this dataset")

    res_a = await db.execute(
        select(EvaluationRunItem).where(EvaluationRunItem.evaluation_run_id == run_a)
    )
    res_b = await db.execute(
        select(EvaluationRunItem).where(EvaluationRunItem.evaluation_run_id == run_b)
    )
    map_a = {x.evaluation_dataset_item_id: x for x in res_a.scalars().all()}
    map_b = {x.evaluation_dataset_item_id: x for x in res_b.scalars().all()}

    order_res = await db.execute(
        select(EvaluationDatasetItem)
        .where(EvaluationDatasetItem.evaluation_dataset_id == dataset_id)
        .order_by(EvaluationDatasetItem.sort_order, EvaluationDatasetItem.created_at)
    )
    items_ordered = order_res.scalars().all()

    rows: list[EvaluationCompareRow] = []
    for item in items_ordered:
        ia = map_a.get(item.id)
        ib = map_b.get(item.id)
        if not ia or not ib:
            continue
        pa, pb = ia.passed, ib.passed
        sa, sb = float(ia.score), float(ib.score)
        rows.append(
            EvaluationCompareRow(
                evaluation_dataset_item_id=item.id,
                query=item.query,
                expected_answer=item.expected_answer,
                pass_a=pa,
                score_a=sa,
                pass_b=pb,
                score_b=sb,
                pass_changed=pa != pb,
                score_delta=round(sb - sa, 4),
            )
        )

    return EvaluationCompareResponse(
        run_a_id=run_a,
        run_b_id=run_b,
        evaluation_type_a=ra.evaluation_type,
        evaluation_type_b=rb.evaluation_type,
        rows=rows,
    )


@router.get("/{dataset_id}/runs", response_model=EvaluationRunListResponse)
async def list_evaluation_runs(
    dataset_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    ds: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    count_q = await db.execute(
        select(func.count()).select_from(EvaluationRun).where(
            EvaluationRun.evaluation_dataset_id == dataset_id
        )
    )
    total = count_q.scalar_one()

    result = await db.execute(
        select(EvaluationRun)
        .where(EvaluationRun.evaluation_dataset_id == dataset_id)
        .order_by(EvaluationRun.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    runs = result.scalars().all()
    items = [
        EvaluationRunListItem(
            id=r.id,
            evaluation_type=r.evaluation_type,
            status=r.status,
            item_count=r.item_count,
            pass_count=r.pass_count,
            avg_score=r.avg_score,
            created_at=r.created_at,
        )
        for r in runs
    ]
    return EvaluationRunListResponse(items=items, total=total)


@router.get("/{dataset_id}/runs/{run_id}", response_model=EvaluationRunResponse)
async def get_evaluation_run(
    dataset_id: str,
    run_id: str,
    ds: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    run = await db.get(EvaluationRun, run_id)
    if not run or run.evaluation_dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Evaluation run not found")

    result = await db.execute(
        select(EvaluationRunItem, EvaluationDatasetItem)
        .join(
            EvaluationDatasetItem,
            EvaluationDatasetItem.id == EvaluationRunItem.evaluation_dataset_item_id,
        )
        .where(EvaluationRunItem.evaluation_run_id == run_id)
        .order_by(EvaluationDatasetItem.sort_order, EvaluationDatasetItem.created_at)
    )
    pairs = result.all()
    results = [_run_item_to_result(ri, item, run.evaluation_type) for ri, item in pairs]
    return _run_to_response(run, results)


@router.delete("/{dataset_id}/runs/{run_id}", status_code=204)
async def delete_evaluation_run(
    dataset_id: str,
    run_id: str,
    ds: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    run = await db.get(EvaluationRun, run_id)
    if not run or run.evaluation_dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Evaluation run not found")
    await db.delete(run)


@router.post("/{dataset_id}/run", response_model=EvaluationRunResponse)
async def run_evaluation(
    dataset_id: str,
    body: EvaluationRunRequestBody = Body(default_factory=EvaluationRunRequestBody),
    token: str = Depends(require_auth),
    ds: EvaluationDataset = Depends(get_eval_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Run evaluation (search retrieval or QA), persist report, return full results."""
    raw_type = (body.evaluation_type or "").strip()
    eval_type = raw_type if raw_type else EVALUATION_TYPE_SEARCH_RETRIEVAL
    if eval_type not in ALLOWED_EVALUATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid evaluation_type. Allowed: {', '.join(sorted(ALLOWED_EVALUATION_TYPES))}",
        )

    kb = await db.get(KnowledgeBase, ds.knowledge_base_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    if eval_type == EVALUATION_TYPE_SEARCH_RETRIEVAL and not kb.embedding_model_id:
        raise HTTPException(
            status_code=400,
            detail="No embedding model configured for this knowledge base. Configure it in KB Settings.",
        )

    judge_model_id, judge_config = await resolve_judge_config(db, kb)
    config_snapshot = {
        "judge_model_id": judge_model_id,
        "top_k": 10,
        "search_type": "all",
    }

    try:
        if eval_type == EVALUATION_TYPE_SEARCH_RETRIEVAL:
            item_rows = await run_search_retrieval_evaluation(
                db, ds.knowledge_base_id, dataset_id, judge_config
            )
        else:
            item_rows = await run_qa_answer_evaluation(
                db, kb, dataset_id, judge_config, token
            )
    except HTTPException:
        raise
    except Exception as e:
        run = await _persist_run(
            db,
            dataset_id=dataset_id,
            knowledge_base_id=ds.knowledge_base_id,
            evaluation_type=eval_type,
            config_snapshot=config_snapshot,
            item_rows=[],
            status="failed",
            error_message=str(e),
        )
        return _run_to_response(run, [])

    run = await _persist_run(
        db,
        dataset_id=dataset_id,
        knowledge_base_id=ds.knowledge_base_id,
        evaluation_type=eval_type,
        config_snapshot=config_snapshot,
        item_rows=item_rows,
        status="completed",
        error_message=None,
    )
    schemas = _result_dicts_to_schemas(eval_type, item_rows)
    return _run_to_response(run, schemas)
