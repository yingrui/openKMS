"""Evaluation dataset API for KB QA performance evaluation."""
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
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
        sort_order=item.sort_order,
        created_at=item.created_at,
    )


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
    request: Request,
    token: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    ds = await db.get(EvaluationDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")
    kb = await db.get(KnowledgeBase, ds.knowledge_base_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if not kb.agent_url:
        raise HTTPException(
            status_code=400,
            detail="No agent URL configured for this knowledge base. Configure it in KB Settings.",
        )

    result = await db.execute(
        select(EvaluationDatasetItem)
        .where(EvaluationDatasetItem.evaluation_dataset_id == dataset_id)
        .order_by(EvaluationDatasetItem.sort_order, EvaluationDatasetItem.created_at)
    )
    items = result.scalars().all()

    base_url = str(request.base_url).rstrip("/")
    api_url = f"{base_url}/api/knowledge-bases/{ds.knowledge_base_id}/ask"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    results: list[EvaluationRunResult] = []
    async with httpx.AsyncClient(timeout=120.0) as client:
        for item in items:
            try:
                resp = await client.post(
                    api_url,
                    json={"question": item.query, "conversation_history": []},
                    headers=headers,
                )
                if not resp.is_error:
                    data = resp.json()
                    generated = data.get("answer", "")
                    sources = data.get("sources", [])
                    if isinstance(sources, list):
                        sources = [s if isinstance(s, dict) else {"id": str(s)} for s in sources]
                    else:
                        sources = []
                else:
                    generated = f"[Error: {resp.status_code}]"
                    sources = []
            except Exception as e:
                generated = f"[Error: {str(e)}]"
                sources = []

            results.append(
                EvaluationRunResult(
                    item_id=item.id,
                    query=item.query,
                    expected_answer=item.expected_answer,
                    generated_answer=generated,
                    sources=sources,
                )
            )

    return EvaluationRunResponse(results=results)
