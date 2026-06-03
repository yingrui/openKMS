"""Glossary management API."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import String, cast, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.glossary import Glossary
from app.models.glossary_term import GlossaryTerm
from app.schemas.glossary import (
    GlossaryCreate,
    GlossaryExportPayload,
    GlossaryImportPayload,
    GlossaryListResponse,
    GlossaryResponse,
    GlossaryTermCreate,
    GlossaryTermListResponse,
    GlossaryTermResponse,
    GlossaryTermSuggestRequest,
    GlossaryTermSuggestResponse,
    GlossaryTermUpdate,
    GlossaryUpdate,
)
from app.services.data_resource_policy import glossary_visible
from app.services.data_scope import bootstrap_owner_acl
from app.services.glossary_scope import (
    require_glossary_manage,
    require_glossary_read,
    require_glossary_write,
)
from app.services.resource_acl_constants import RT_GLOSSARY

router = APIRouter(
    prefix="/glossaries",
    tags=["glossaries"],
    dependencies=[Depends(require_auth)],
)


async def _glossary_term_count(db: AsyncSession, glossary_id: str) -> int:
    return (await db.execute(
        select(func.count()).select_from(GlossaryTerm).where(GlossaryTerm.glossary_id == glossary_id)
    )).scalar_one()


def _glossary_to_response(glossary: Glossary, term_count: int) -> GlossaryResponse:
    return GlossaryResponse(
        id=glossary.id,
        name=glossary.name,
        description=glossary.description,
        term_count=term_count,
        created_at=glossary.created_at,
        updated_at=glossary.updated_at,
    )


def _term_to_response(term: GlossaryTerm) -> GlossaryTermResponse:
    return GlossaryTermResponse(
        id=term.id,
        glossary_id=term.glossary_id,
        primary_en=term.primary_en,
        primary_cn=term.primary_cn,
        definition=term.definition,
        synonyms_en=term.synonyms_en or [],
        synonyms_cn=term.synonyms_cn or [],
        created_at=term.created_at,
        updated_at=term.updated_at,
    )


async def get_glossary_scoped(
    glossary_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Glossary:
    glossary = await db.get(Glossary, glossary_id)
    if not glossary:
        raise HTTPException(status_code=404, detail="Glossary not found")
    return await require_glossary_read(db, request, glossary)


async def get_glossary_scoped_write(
    glossary_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Glossary:
    glossary = await get_glossary_scoped(glossary_id, request, db)
    return await require_glossary_write(db, request, glossary)


async def get_glossary_scoped_manage(
    glossary_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Glossary:
    glossary = await get_glossary_scoped(glossary_id, request, db)
    return await require_glossary_manage(db, request, glossary)


# --- Glossary CRUD ---

@router.get("", response_model=GlossaryListResponse)
async def list_glossaries(request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Glossary).order_by(Glossary.created_at.desc()))
    glossaries = list(result.scalars().all())
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str):
        glossaries = [g for g in glossaries if await glossary_visible(db, p, sub, g)]
    items = []
    for g in glossaries:
        count = await _glossary_term_count(db, g.id)
        items.append(_glossary_to_response(g, count))
    return GlossaryListResponse(items=items, total=len(items))


@router.post("", response_model=GlossaryResponse, status_code=201)
async def create_glossary(body: GlossaryCreate, request: Request, db: AsyncSession = Depends(get_db)):
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    uname = p.get("preferred_username") or p.get("name")
    glossary = Glossary(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        created_by=sub if isinstance(sub, str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(glossary)
    await db.flush()
    if isinstance(sub, str):
        await bootstrap_owner_acl(db, RT_GLOSSARY, glossary.id, sub)
    await db.commit()
    await db.refresh(glossary)
    count = await _glossary_term_count(db, glossary.id)
    return _glossary_to_response(glossary, count)


@router.get("/{glossary_id}", response_model=GlossaryResponse)
async def get_glossary(
    glossary: Glossary = Depends(get_glossary_scoped),
    db: AsyncSession = Depends(get_db),
):
    count = await _glossary_term_count(db, glossary.id)
    return _glossary_to_response(glossary, count)


@router.put("/{glossary_id}", response_model=GlossaryResponse)
async def update_glossary(
    body: GlossaryUpdate,
    glossary: Glossary = Depends(get_glossary_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(glossary, field, value)
    await db.flush()
    await db.refresh(glossary)
    count = await _glossary_term_count(db, glossary.id)
    return _glossary_to_response(glossary, count)


@router.delete("/{glossary_id}", status_code=204)
async def delete_glossary(
    glossary: Glossary = Depends(get_glossary_scoped_manage),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(GlossaryTerm).where(GlossaryTerm.glossary_id == glossary.id))
    await db.delete(glossary)


# --- Glossary Terms ---

@router.get("/{glossary_id}/terms", response_model=GlossaryTermListResponse)
async def list_glossary_terms(
    search: str | None = Query(None),
    glossary: Glossary = Depends(get_glossary_scoped),
    db: AsyncSession = Depends(get_db),
):
    query = select(GlossaryTerm).where(GlossaryTerm.glossary_id == glossary.id)

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                GlossaryTerm.primary_en.ilike(pattern),
                GlossaryTerm.primary_cn.ilike(pattern),
                GlossaryTerm.definition.ilike(pattern),
                cast(GlossaryTerm.synonyms_en, String).ilike(pattern),
                cast(GlossaryTerm.synonyms_cn, String).ilike(pattern),
            )
        )

    query = query.order_by(GlossaryTerm.created_at.desc())
    result = await db.execute(query)
    terms = result.scalars().all()

    items = [_term_to_response(t) for t in terms]
    return GlossaryTermListResponse(items=items, total=len(items))


@router.post("/{glossary_id}/terms/suggest", response_model=GlossaryTermSuggestResponse)
async def suggest_glossary_term(
    body: GlossaryTermSuggestRequest,
    glossary: Glossary = Depends(get_glossary_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    """Use AI to suggest translation and synonyms for a term. Requires at least primary_en or primary_cn."""
    if not (body.primary_en or body.primary_cn) or (
        not (body.primary_en or "").strip() and not (body.primary_cn or "").strip()
    ):
        raise HTTPException(
            status_code=400,
            detail="Provide at least one of primary_en or primary_cn",
        )

    from app.models.api_model import ApiModel
    from sqlalchemy.orm import selectinload

    model_result = await db.execute(
        select(ApiModel)
        .options(selectinload(ApiModel.provider_rel))
        .where(ApiModel.category == "llm", ApiModel.is_default_in_category == True)
        .limit(1)
    )
    model = model_result.scalar_one_or_none()
    if not model:
        raise HTTPException(
            status_code=400,
            detail="No default LLM model configured. Set a model as default in its category (Models page).",
        )

    model_config = {
        "base_url": model.provider_rel.base_url,
        "api_key": model.provider_rel.api_key,
        "model_name": model.model_name or model.name,
    }

    from app.services.glossary_term_suggestion import suggest_glossary_term as do_suggest

    result = await do_suggest(
        primary_en=body.primary_en,
        primary_cn=body.primary_cn,
        model_config=model_config,
    )
    return GlossaryTermSuggestResponse(**result)


@router.post("/{glossary_id}/terms", response_model=GlossaryTermResponse, status_code=201)
async def create_glossary_term(
    body: GlossaryTermCreate,
    glossary: Glossary = Depends(get_glossary_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    term = GlossaryTerm(
        id=str(uuid.uuid4()),
        glossary_id=glossary.id,
        primary_en=body.primary_en or None,
        primary_cn=body.primary_cn or None,
        definition=body.definition or None,
        synonyms_en=body.synonyms_en or [],
        synonyms_cn=body.synonyms_cn or [],
    )
    db.add(term)
    await db.flush()
    await db.refresh(term)
    return _term_to_response(term)


@router.get("/{glossary_id}/terms/{term_id}", response_model=GlossaryTermResponse)
async def get_glossary_term(
    term_id: str,
    glossary: Glossary = Depends(get_glossary_scoped),
    db: AsyncSession = Depends(get_db),
):
    term = await db.get(GlossaryTerm, term_id)
    if not term or term.glossary_id != glossary.id:
        raise HTTPException(status_code=404, detail="Term not found")
    return _term_to_response(term)


@router.put("/{glossary_id}/terms/{term_id}", response_model=GlossaryTermResponse)
async def update_glossary_term(
    term_id: str,
    body: GlossaryTermUpdate,
    glossary: Glossary = Depends(get_glossary_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    term = await db.get(GlossaryTerm, term_id)
    if not term or term.glossary_id != glossary.id:
        raise HTTPException(status_code=404, detail="Term not found")
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field in ("primary_en", "primary_cn") and isinstance(value, str):
            setattr(term, field, value.strip() or None)
        else:
            setattr(term, field, value)
    if not term.primary_en and not term.primary_cn:
        raise HTTPException(
            status_code=400,
            detail="At least one of primary_en or primary_cn must be non-empty",
        )
    await db.flush()
    await db.refresh(term)
    return _term_to_response(term)


@router.delete("/{glossary_id}/terms/{term_id}", status_code=204)
async def delete_glossary_term(
    term_id: str,
    glossary: Glossary = Depends(get_glossary_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    term = await db.get(GlossaryTerm, term_id)
    if not term or term.glossary_id != glossary.id:
        raise HTTPException(status_code=404, detail="Term not found")
    await db.delete(term)


# --- Export ---

@router.get("/{glossary_id}/export", response_model=GlossaryExportPayload)
async def export_glossary(
    glossary: Glossary = Depends(get_glossary_scoped),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GlossaryTerm).where(GlossaryTerm.glossary_id == glossary.id).order_by(GlossaryTerm.created_at)
    )
    terms = result.scalars().all()
    return GlossaryExportPayload(
        glossary_id=glossary.id,
        glossary_name=glossary.name,
        exported_at=datetime.now(timezone.utc),
        terms=[
            {
                "primary_en": t.primary_en,
                "primary_cn": t.primary_cn,
                "definition": t.definition,
                "synonyms_en": t.synonyms_en or [],
                "synonyms_cn": t.synonyms_cn or [],
            }
            for t in terms
        ],
    )


# --- Import ---

@router.post("/{glossary_id}/import", response_model=GlossaryTermListResponse)
async def import_glossary(
    body: GlossaryImportPayload,
    glossary: Glossary = Depends(get_glossary_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    if body.mode == "replace":
        await db.execute(delete(GlossaryTerm).where(GlossaryTerm.glossary_id == glossary.id))

    created = []
    for item in body.terms:
        term = GlossaryTerm(
            id=str(uuid.uuid4()),
            glossary_id=glossary.id,
            primary_en=item.primary_en or None,
            primary_cn=item.primary_cn or None,
            definition=item.definition or None,
            synonyms_en=item.synonyms_en or [],
            synonyms_cn=item.synonyms_cn or [],
        )
        db.add(term)
        await db.flush()
        await db.refresh(term)
        created.append(_term_to_response(term))

    return GlossaryTermListResponse(items=created, total=len(created))
