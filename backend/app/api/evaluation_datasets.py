"""Evaluation dataset API for KB search retrieval evaluation."""
import csv
import io
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.auth import require_auth
from app.database import get_db
from app.models.api_model import ApiModel
from app.models.evaluation_dataset import EvaluationDataset, EvaluationDatasetItem
from app.models.knowledge_base import KnowledgeBase
from app.schemas.evaluation_dataset import (
    EvaluationDatasetCreate,
    EvaluationDatasetItemCreate,
    EvaluationDatasetItemResponse,
    EvaluationDatasetItemUpdate,
    EvaluationDatasetListResponse,
    EvaluationDatasetResponse,
    EvaluationDatasetUpdate,
    EvaluationRunResponse,
    EvaluationRunResult,
    SearchResultSnippet,
)

router = APIRouter(
    prefix="/evaluation-datasets",
    tags=["evaluation-datasets"],
    dependencies=[Depends(require_auth)],
)


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


# --- CRUD ---

@router.get("", response_model=EvaluationDatasetListResponse)
async def list_evaluation_datasets(
    knowledge_base_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(EvaluationDataset).order_by(EvaluationDataset.created_at.desc())
    if knowledge_base_id:
        q = q.where(EvaluationDataset.knowledge_base_id == knowledge_base_id)
    result = await db.execute(q)
    datasets = result.scalars().all()
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
    db: AsyncSession = Depends(get_db),
):
    ds = await db.get(EvaluationDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")
    kb = await db.get(KnowledgeBase, ds.knowledge_base_id)
    count = await _item_count(db, ds.id)
    return _dataset_to_response(ds, kb.name if kb else None, count)


@router.put("/{dataset_id}", response_model=EvaluationDatasetResponse)
async def update_evaluation_dataset(
    dataset_id: str,
    body: EvaluationDatasetUpdate,
    db: AsyncSession = Depends(get_db),
):
    ds = await db.get(EvaluationDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")
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
    db: AsyncSession = Depends(get_db),
):
    ds = await db.get(EvaluationDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")
    await db.delete(ds)


# --- Items ---

@router.get("/{dataset_id}/items", response_model=list[EvaluationDatasetItemResponse])
async def list_evaluation_dataset_items(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
):
    ds = await db.get(EvaluationDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")
    result = await db.execute(
        select(EvaluationDatasetItem)
        .where(EvaluationDatasetItem.evaluation_dataset_id == dataset_id)
        .order_by(EvaluationDatasetItem.sort_order, EvaluationDatasetItem.created_at)
    )
    items = result.scalars().all()
    return [
        EvaluationDatasetItemResponse(
            id=i.id,
            evaluation_dataset_id=i.evaluation_dataset_id,
            query=i.query,
            expected_answer=i.expected_answer,
            topic=i.topic,
            sort_order=i.sort_order,
            created_at=i.created_at,
        )
        for i in items
    ]


@router.post("/{dataset_id}/items", response_model=EvaluationDatasetItemResponse, status_code=201)
async def create_evaluation_dataset_item(
    dataset_id: str,
    body: EvaluationDatasetItemCreate,
    db: AsyncSession = Depends(get_db),
):
    ds = await db.get(EvaluationDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")
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
    db: AsyncSession = Depends(get_db),
):
    """Import evaluation items from a CSV file. Expected columns: topic (optional), query, answer or expected_answer."""
    ds = await db.get(EvaluationDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")
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
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(EvaluationDatasetItem, item_id)
    if not item or item.evaluation_dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Evaluation dataset item not found")
    await db.delete(item)


# --- Run Evaluation ---

@router.post("/{dataset_id}/run", response_model=EvaluationRunResponse)
async def run_evaluation(
    dataset_id: str,
    _token: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Run search-based evaluation: search per query, then LLM judge for each item."""
    ds = await db.get(EvaluationDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")
    kb = await db.get(KnowledgeBase, ds.knowledge_base_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if not kb.embedding_model_id:
        raise HTTPException(
            status_code=400,
            detail="No embedding model configured for this knowledge base. Configure it in KB Settings.",
        )

    # Resolve judge model: kb.judge_model_id or fallback to first llm model
    judge_model_id = kb.judge_model_id
    if not judge_model_id:
        fallback = await db.execute(
            select(ApiModel)
            .options(selectinload(ApiModel.provider_rel))
            .where(ApiModel.category == "llm")
            .order_by(ApiModel.is_default_in_category.desc().nullslast())
            .limit(1)
        )
        judge_model = fallback.scalar_one_or_none()
        if not judge_model:
            raise HTTPException(
                status_code=400,
                detail="No judge model configured. Set judge_model_id on the KB or add an LLM model.",
            )
        judge_model_id = judge_model.id

    judge_model_result = await db.execute(
        select(ApiModel)
        .options(selectinload(ApiModel.provider_rel))
        .where(ApiModel.id == judge_model_id)
    )
    judge_model = judge_model_result.scalar_one_or_none()
    if not judge_model:
        raise HTTPException(status_code=400, detail="Judge model not found")

    judge_config = {
        "base_url": judge_model.provider_rel.base_url,
        "api_key": judge_model.provider_rel.api_key or "no-key",
        "model_name": judge_model.model_name or judge_model.name,
    }

    from app.services.kb_search import search_knowledge_base
    from app.services.search_judge import judge_search_results

    result = await db.execute(
        select(EvaluationDatasetItem)
        .where(EvaluationDatasetItem.evaluation_dataset_id == dataset_id)
        .order_by(EvaluationDatasetItem.sort_order, EvaluationDatasetItem.created_at)
    )
    items = result.scalars().all()

    results: list[EvaluationRunResult] = []
    for item in items:
        try:
            search_resp = await search_knowledge_base(
                ds.knowledge_base_id,
                item.query,
                top_k=10,
                search_type="all",
                db=db,
            )
        except HTTPException:
            raise
        except Exception as e:
            results.append(
                EvaluationRunResult(
                    item_id=item.id,
                    query=item.query,
                    expected_answer=item.expected_answer,
                    search_results=[],
                    pass_=False,
                    score=0.0,
                    reasoning=str(e),
                )
            )
            continue

        search_list = [
            {"content": r.content, "score": r.score, "source_type": r.source_type}
            for r in search_resp.results
        ]

        verdict = await judge_search_results(
            item.query,
            item.expected_answer,
            search_list,
            judge_config,
        )

        snippets = [
            SearchResultSnippet(content=r["content"][:500], score=r["score"], source_type=r["source_type"])
            for r in search_list[:5]
        ]

        results.append(
            EvaluationRunResult(
                item_id=item.id,
                query=item.query,
                expected_answer=item.expected_answer,
                search_results=snippets,
                pass_=verdict["pass"],
                score=verdict["score"],
                reasoning=verdict["reasoning"],
            )
        )

    return EvaluationRunResponse(results=results)
