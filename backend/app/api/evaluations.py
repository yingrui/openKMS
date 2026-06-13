"""Evaluation API for KB search retrieval and QA evaluation."""
import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.evaluation import Evaluation, EvaluationItem
from app.models.evaluation_run import EvaluationRun, EvaluationRunItem
from app.models.knowledge_base import KnowledgeBase
from app.models.wiki_models import WikiSpace
from app.schemas.evaluation import (
    EvaluationCompareResponse,
    EvaluationCompareRow,
    EvaluationCreate,
    EvaluationItemCreate,
    EvaluationItemListResponse,
    EvaluationItemResponse,
    EvaluationItemUpdate,
    EvaluationListResponse,
    EvaluationResponse,
    EvaluationRunListItem,
    EvaluationRunListResponse,
    EvaluationRunRequestBody,
    EvaluationRunResponse,
    EvaluationRunResult,
    EvaluationUpdate,
    SearchResultSnippet,
)
from app.services.data_resource_policy import knowledge_base_visible, wiki_space_visible
from app.services.data_scope import bootstrap_owner_acl
from app.services.evaluation_scope import (
    load_evaluation_scoped,
    require_evaluation_manage,
    require_evaluation_write,
)
from app.services.resource_acl_constants import PERM_READ, RT_EVALUATION
from app.services.evaluation.execute import (
    ALLOWED_EVALUATION_TYPES,
    EVALUATION_TYPE_QA_ANSWER,
    EVALUATION_TYPE_SEARCH_RETRIEVAL,
    EVALUATION_TYPE_WIKI_CONTENT_COVERAGE,
    EVALUATION_TYPES_WITH_SEARCH_SNIPPETS,
    resolve_judge_config,
    run_qa_answer_evaluation,
    run_search_retrieval_evaluation,
)
from app.services.evaluation.wiki_execute import run_wiki_content_coverage_evaluation
from app.services.evaluation_read import (
    evaluation_to_response,
    item_count,
    list_evaluations_page,
)

router = APIRouter(
    prefix="/evaluations",
    tags=["evaluations"],
    dependencies=[Depends(require_auth)],
)


async def get_evaluation_scoped(
    evaluation_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Evaluation:
    return await load_evaluation_scoped(db, request, evaluation_id, PERM_READ)


async def get_evaluation_scoped_write(
    evaluation_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Evaluation:
    ev = await get_evaluation_scoped(evaluation_id, request, db)
    return await require_evaluation_write(db, request, ev)


async def get_evaluation_scoped_manage(
    evaluation_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Evaluation:
    ev = await get_evaluation_scoped(evaluation_id, request, db)
    return await require_evaluation_manage(db, request, ev)


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
        show_search = evaluation_type in EVALUATION_TYPES_WITH_SEARCH_SNIPPETS
        out.append(
            EvaluationRunResult(
                item_id=r["evaluation_item_id"],
                query=r["query"],
                expected_answer=r["expected_answer"],
                search_results=srs if show_search else [],
                generated_answer=detail.get("answer") if evaluation_type == EVALUATION_TYPE_QA_ANSWER else None,
                qa_sources=qas if evaluation_type == EVALUATION_TYPE_QA_ANSWER else [],
                pass_=bool(r.get("passed")),
                score=float(r.get("score", 0)),
                reasoning=str(r.get("reasoning", "")),
            )
        )
    return out


def _run_item_to_result(
    ri: EvaluationRunItem, item: EvaluationItem, evaluation_type: str
) -> EvaluationRunResult:
    detail = ri.detail or {}
    srs = [_snippet_model_from_dict(s) for s in (detail.get("search_results") or [])]
    qas = [_snippet_model_from_dict(s) for s in (detail.get("sources") or [])]
    show_search = evaluation_type in EVALUATION_TYPES_WITH_SEARCH_SNIPPETS
    return EvaluationRunResult(
        item_id=item.id,
        query=item.query,
        expected_answer=item.expected_answer,
        search_results=srs if show_search else [],
        generated_answer=detail.get("answer") if evaluation_type == EVALUATION_TYPE_QA_ANSWER else None,
        qa_sources=qas if evaluation_type == EVALUATION_TYPE_QA_ANSWER else [],
        pass_=ri.passed,
        score=float(ri.score),
        reasoning=ri.reasoning or "",
    )


async def _persist_run(
    db: AsyncSession,
    *,
    evaluation_id: str,
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
        evaluation_id=evaluation_id,
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
                evaluation_item_id=r["evaluation_item_id"],
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


@router.get("", response_model=EvaluationListResponse)
async def list_evaluations(
    request: Request,
    knowledge_base_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    return await list_evaluations_page(
        db,
        request,
        knowledge_base_id=knowledge_base_id,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=EvaluationResponse, status_code=201)
async def create_evaluation(
    body: EvaluationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    kb = await db.get(KnowledgeBase, body.knowledge_base_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and not await knowledge_base_visible(db, p, sub, kb):
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    wiki_name = None
    if body.wiki_space_id:
        ws = await db.get(WikiSpace, body.wiki_space_id)
        if not ws:
            raise HTTPException(status_code=404, detail="Wiki space not found")
        if isinstance(sub, str) and not await wiki_space_visible(db, p, sub, ws):
            raise HTTPException(status_code=404, detail="Wiki space not found")
        wiki_name = ws.name
    uname = p.get("preferred_username") or p.get("name")
    ev = Evaluation(
        id=str(uuid.uuid4()),
        name=body.name,
        knowledge_base_id=body.knowledge_base_id,
        wiki_space_id=body.wiki_space_id,
        description=body.description,
        created_by=sub if isinstance(sub, str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(ev)
    await db.flush()
    if isinstance(sub, str):
        await bootstrap_owner_acl(db, RT_EVALUATION, ev.id, sub)
    await db.commit()
    await db.refresh(ev)
    return evaluation_to_response(ev, kb.name, wiki_name, 0)


@router.get("/{evaluation_id}", response_model=EvaluationResponse)
async def get_evaluation(
    evaluation_id: str,
    ev: Evaluation = Depends(get_evaluation_scoped),
    db: AsyncSession = Depends(get_db),
):
    kb = await db.get(KnowledgeBase, ev.knowledge_base_id)
    count = await item_count(db, ev.id)
    wiki = await db.get(WikiSpace, ev.wiki_space_id) if ev.wiki_space_id else None
    return evaluation_to_response(ev, kb.name if kb else None, wiki.name if wiki else None, count)


@router.put("/{evaluation_id}", response_model=EvaluationResponse)
async def update_evaluation(
    evaluation_id: str,
    body: EvaluationUpdate,
    request: Request,
    ev: Evaluation = Depends(get_evaluation_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_unset=True)
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    for field, value in data.items():
        if field == "wiki_space_id":
            if value in (None, ""):
                ev.wiki_space_id = None
            else:
                ws = await db.get(WikiSpace, value)
                if not ws:
                    raise HTTPException(status_code=404, detail="Wiki space not found")
                if isinstance(sub, str) and not await wiki_space_visible(db, p, sub, ws):
                    raise HTTPException(status_code=404, detail="Wiki space not found")
                ev.wiki_space_id = value
        elif field == "knowledge_base_id":
            kb = await db.get(KnowledgeBase, value)
            if not kb:
                raise HTTPException(status_code=404, detail="Knowledge base not found")
            if isinstance(sub, str) and not await knowledge_base_visible(db, p, sub, kb):
                raise HTTPException(status_code=404, detail="Knowledge base not found")
            ev.knowledge_base_id = value
        else:
            setattr(ev, field, value)
    await db.flush()
    await db.refresh(ev)
    kb = await db.get(KnowledgeBase, ev.knowledge_base_id)
    count = await item_count(db, ev.id)
    wiki = await db.get(WikiSpace, ev.wiki_space_id) if ev.wiki_space_id else None
    return evaluation_to_response(ev, kb.name if kb else None, wiki.name if wiki else None, count)


@router.delete("/{evaluation_id}", status_code=204)
async def delete_evaluation(
    evaluation_id: str,
    ev: Evaluation = Depends(get_evaluation_scoped_manage),
    db: AsyncSession = Depends(get_db),
):
    await db.delete(ev)


# --- Items ---


@router.get("/{evaluation_id}/items", response_model=EvaluationItemListResponse)
async def list_evaluation_items(
    evaluation_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=200),
    ev: Evaluation = Depends(get_evaluation_scoped),
    db: AsyncSession = Depends(get_db),
):
    count_q = await db.execute(
        select(func.count()).select_from(EvaluationItem).where(EvaluationItem.evaluation_id == evaluation_id)
    )
    total = count_q.scalar_one()
    result = await db.execute(
        select(EvaluationItem)
        .where(EvaluationItem.evaluation_id == evaluation_id)
        .order_by(EvaluationItem.sort_order, EvaluationItem.created_at)
        .offset(offset)
        .limit(limit)
    )
    item_rows = result.scalars().all()
    return EvaluationItemListResponse(
        items=[EvaluationItemResponse.model_validate(i) for i in item_rows],
        total=total,
    )


@router.post("/{evaluation_id}/items", response_model=EvaluationItemResponse, status_code=201)
async def create_evaluation_item(
    evaluation_id: str,
    body: EvaluationItemCreate,
    ev: Evaluation = Depends(get_evaluation_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    item = EvaluationItem(
        id=str(uuid.uuid4()),
        evaluation_id=evaluation_id,
        query=body.query,
        expected_answer=body.expected_answer,
        topic=body.topic,
        sort_order=body.sort_order,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return EvaluationItemResponse.model_validate(item)


@router.put("/{evaluation_id}/items/{item_id}", response_model=EvaluationItemResponse)
async def update_evaluation_item(
    evaluation_id: str,
    item_id: str,
    body: EvaluationItemUpdate,
    ev: Evaluation = Depends(get_evaluation_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(EvaluationItem, item_id)
    if not item or item.evaluation_id != evaluation_id:
        raise HTTPException(status_code=404, detail="Evaluation item not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return EvaluationItemResponse.model_validate(item)


@router.post("/{evaluation_id}/items/import")
async def import_evaluation_items(
    evaluation_id: str,
    file: UploadFile = File(...),
    ev: Evaluation = Depends(get_evaluation_scoped_write),
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

        item = EvaluationItem(
            id=str(uuid.uuid4()),
            evaluation_id=evaluation_id,
            query=query,
            expected_answer=expected,
            topic=topic_val,
            sort_order=idx,
        )
        db.add(item)
        created += 1

    await db.flush()
    return {"imported": created}


@router.delete("/{evaluation_id}/items/{item_id}", status_code=204)
async def delete_evaluation_item(
    evaluation_id: str,
    item_id: str,
    ev: Evaluation = Depends(get_evaluation_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(EvaluationItem, item_id)
    if not item or item.evaluation_id != evaluation_id:
        raise HTTPException(status_code=404, detail="Evaluation item not found")
    await db.delete(item)


# --- Run evaluation & persisted reports ---


@router.get("/{evaluation_id}/runs/compare", response_model=EvaluationCompareResponse)
async def compare_evaluation_runs(
    evaluation_id: str,
    run_a: str = Query(..., description="First evaluation run id"),
    run_b: str = Query(..., description="Second evaluation run id"),
    _: Evaluation = Depends(get_evaluation_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Compare two runs item-by-item (pass/score deltas)."""
    ra = await db.get(EvaluationRun, run_a)
    rb = await db.get(EvaluationRun, run_b)
    if not ra or ra.evaluation_id != evaluation_id:
        raise HTTPException(status_code=404, detail="Run A not found for this evaluation")
    if not rb or rb.evaluation_id != evaluation_id:
        raise HTTPException(status_code=404, detail="Run B not found for this evaluation")

    res_a = await db.execute(
        select(EvaluationRunItem).where(EvaluationRunItem.evaluation_run_id == run_a)
    )
    res_b = await db.execute(
        select(EvaluationRunItem).where(EvaluationRunItem.evaluation_run_id == run_b)
    )
    map_a = {x.evaluation_item_id: x for x in res_a.scalars().all()}
    map_b = {x.evaluation_item_id: x for x in res_b.scalars().all()}

    order_res = await db.execute(
        select(EvaluationItem)
        .where(EvaluationItem.evaluation_id == evaluation_id)
        .order_by(EvaluationItem.sort_order, EvaluationItem.created_at)
    )
    items_ordered = order_res.scalars().all()

    cmp_rows: list[EvaluationCompareRow] = []
    for it in items_ordered:
        ia = map_a.get(it.id)
        ib = map_b.get(it.id)
        if not ia or not ib:
            continue
        pa, pb = ia.passed, ib.passed
        sa, sb = float(ia.score), float(ib.score)
        cmp_rows.append(
            EvaluationCompareRow(
                evaluation_item_id=it.id,
                query=it.query,
                expected_answer=it.expected_answer,
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
        rows=cmp_rows,
    )


@router.get("/{evaluation_id}/runs", response_model=EvaluationRunListResponse)
async def list_evaluation_runs(
    evaluation_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    ev: Evaluation = Depends(get_evaluation_scoped),
    db: AsyncSession = Depends(get_db),
):
    count_q = await db.execute(
        select(func.count()).select_from(EvaluationRun).where(EvaluationRun.evaluation_id == evaluation_id)
    )
    total = count_q.scalar_one()

    result = await db.execute(
        select(EvaluationRun)
        .where(EvaluationRun.evaluation_id == evaluation_id)
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


@router.get("/{evaluation_id}/runs/{run_id}", response_model=EvaluationRunResponse)
async def get_evaluation_run(
    evaluation_id: str,
    run_id: str,
    ev: Evaluation = Depends(get_evaluation_scoped),
    db: AsyncSession = Depends(get_db),
):
    run = await db.get(EvaluationRun, run_id)
    if not run or run.evaluation_id != evaluation_id:
        raise HTTPException(status_code=404, detail="Evaluation run not found")

    result = await db.execute(
        select(EvaluationRunItem, EvaluationItem)
        .join(
            EvaluationItem,
            EvaluationItem.id == EvaluationRunItem.evaluation_item_id,
        )
        .where(EvaluationRunItem.evaluation_run_id == run_id)
        .order_by(EvaluationItem.sort_order, EvaluationItem.created_at)
    )
    pairs = result.all()
    results = [_run_item_to_result(ri, item, run.evaluation_type) for ri, item in pairs]
    return _run_to_response(run, results)


@router.delete("/{evaluation_id}/runs/{run_id}", status_code=204)
async def delete_evaluation_run(
    evaluation_id: str,
    run_id: str,
    ev: Evaluation = Depends(get_evaluation_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    run = await db.get(EvaluationRun, run_id)
    if not run or run.evaluation_id != evaluation_id:
        raise HTTPException(status_code=404, detail="Evaluation run not found")
    await db.delete(run)


@router.post("/{evaluation_id}/run", response_model=EvaluationRunResponse)
async def run_evaluation(
    evaluation_id: str,
    body: EvaluationRunRequestBody = Body(default_factory=EvaluationRunRequestBody),
    token: str = Depends(require_auth),
    ev: Evaluation = Depends(get_evaluation_scoped_write),
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

    kb = await db.get(KnowledgeBase, ev.knowledge_base_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    if eval_type == EVALUATION_TYPE_SEARCH_RETRIEVAL and not kb.embedding_model_id:
        raise HTTPException(
            status_code=400,
            detail="No embedding model configured for this knowledge base. Configure it in KB Settings.",
        )

    if eval_type == EVALUATION_TYPE_WIKI_CONTENT_COVERAGE:
        if not ev.wiki_space_id:
            raise HTTPException(
                status_code=400,
                detail="This evaluation type requires a linked wiki space. Set it under evaluation settings.",
            )

    judge_model_id, judge_config = await resolve_judge_config(db, kb)

    wiki = await db.get(WikiSpace, ev.wiki_space_id) if ev.wiki_space_id else None
    if eval_type == EVALUATION_TYPE_WIKI_CONTENT_COVERAGE:
        config_snapshot = {
            "judge_model_id": judge_model_id,
            "wiki_space_id": ev.wiki_space_id,
            "semantic_match_top_k": wiki.semantic_match_top_k if wiki else None,
            "semantic_similarity_threshold": wiki.semantic_similarity_threshold if wiki else None,
        }
    else:
        config_snapshot = {
            "judge_model_id": judge_model_id,
            "top_k": 10,
            "search_type": "all",
        }

    try:
        if eval_type == EVALUATION_TYPE_SEARCH_RETRIEVAL:
            item_rows = await run_search_retrieval_evaluation(
                db, ev.knowledge_base_id, evaluation_id, judge_config
            )
        elif eval_type == EVALUATION_TYPE_QA_ANSWER:
            item_rows = await run_qa_answer_evaluation(
                db, kb, evaluation_id, judge_config, token
            )
        elif eval_type == EVALUATION_TYPE_WIKI_CONTENT_COVERAGE:
            item_rows = await run_wiki_content_coverage_evaluation(
                db, ev.wiki_space_id, evaluation_id, judge_config
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Unhandled evaluation type: {eval_type}",
            )
    except HTTPException:
        raise
    except Exception as e:
        run = await _persist_run(
            db,
            evaluation_id=evaluation_id,
            knowledge_base_id=ev.knowledge_base_id,
            evaluation_type=eval_type,
            config_snapshot=config_snapshot,
            item_rows=[],
            status="failed",
            error_message=str(e),
        )
        return _run_to_response(run, [])

    run = await _persist_run(
        db,
        evaluation_id=evaluation_id,
        knowledge_base_id=ev.knowledge_base_id,
        evaluation_type=eval_type,
        config_snapshot=config_snapshot,
        item_rows=item_rows,
        status="completed",
        error_message=None,
    )
    schemas = _result_dicts_to_schemas(eval_type, item_rows)
    return _run_to_response(run, schemas)


from app.api.eval_agent_conversations import router as eval_agent_conversations_router

router.include_router(eval_agent_conversations_router)
