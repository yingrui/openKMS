"""Offline semantic indexing for wiki pages (one embedding per page, default embedding ApiModel)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from openai import AsyncOpenAI
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.api_model import ApiModel
from app.models.wiki_models import WikiPage, WikiSpace

logger = logging.getLogger(__name__)


def is_pgvector_server_missing(exc: BaseException) -> bool:
    """True when PostgreSQL has no pgvector shared library (common on bare Postgres installs)."""
    e: BaseException | None = exc
    while e is not None:
        msg = str(e).lower()
        if "$libdir/vector" in msg:
            return True
        if "extension" in msg and "vector" in msg and ("not available" in msg or "does not exist" in msg):
            return True
        e = e.__cause__ or e.__context__
    return False


# Rough cap so a single page stays within typical embedding model context limits.
WIKI_PAGE_EMBED_TEXT_MAX_CHARS = 24_000
WIKI_EMBED_BATCH_SIZE = 16
WIKI_TEXT_MATCH_DEFAULT_LIMIT = 200


def _escape_ilike_metacharacters(term: str) -> str:
    """Escape ``%``, ``_``, and ``\\`` for use in ``ILIKE ... ESCAPE '\\\\'`` (PostgreSQL)."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _ilike_substring_pattern(raw: str) -> str:
    return f"%{_escape_ilike_metacharacters(raw)}%"


async def wiki_pages_string_match_ids(
    db: AsyncSession,
    wiki_space_id: str,
    query: str,
    *,
    limit: int = WIKI_TEXT_MATCH_DEFAULT_LIMIT,
) -> list[str]:
    """Page ids where ``query`` appears in **title** or **path** (substring, case-insensitive)."""
    qt = query.strip()
    if len(qt) < 1:
        return []
    pat = _ilike_substring_pattern(qt)
    stmt = (
        select(WikiPage.id)
        .where(
            WikiPage.wiki_space_id == wiki_space_id,
            or_(WikiPage.title.ilike(pat, escape="\\"), WikiPage.path.ilike(pat, escape="\\")),
        )
        .order_by(WikiPage.path)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return list(dict.fromkeys(str(r[0]) for r in rows))


@dataclass(frozen=True)
class WikiSemanticIndexResult:
    indexed: int
    failed: int
    embedding_model_id: str
    embedding_model_label: str


async def resolve_wiki_space_embedding_model(db: AsyncSession, wiki_space: WikiSpace) -> ApiModel | None:
    """Space-specific embedding model when set and valid; otherwise global default embedding model."""
    if wiki_space.semantic_embedding_model_id:
        stmt = (
            select(ApiModel)
            .options(selectinload(ApiModel.provider_rel))
            .where(
                ApiModel.id == wiki_space.semantic_embedding_model_id,
                ApiModel.api_kind == "embeddings",
            )
        )
        row = (await db.execute(stmt)).scalar_one_or_none()
        if row and row.provider_rel and (row.provider_rel.base_url or "").strip():
            return row
    return await resolve_default_embedding_model(db)


async def wiki_space_has_any_embedding(db: AsyncSession, wiki_space_id: str) -> bool:
    q = (
        select(func.count())
        .select_from(WikiPage)
        .where(WikiPage.wiki_space_id == wiki_space_id, WikiPage.embedding.isnot(None))
    )
    return int((await db.execute(q)).scalar_one() or 0) > 0


async def resolve_default_embedding_model(db: AsyncSession) -> ApiModel | None:
    """First embeddings api_kind model: default flag wins, then oldest created."""
    stmt = (
        select(ApiModel)
        .options(selectinload(ApiModel.provider_rel))
        .where(ApiModel.api_kind == "embeddings")
        .order_by(ApiModel.is_default_in_category.desc().nullslast(), ApiModel.created_at.asc())
        .limit(1)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row and row.provider_rel and (row.provider_rel.base_url or "").strip():
        return row
    return None


def wiki_page_text_for_embedding(page: WikiPage) -> str:
    body = (page.body or "").strip()
    text = f"# {page.title}\n\npath: {page.path}\n\n{body}"
    if len(text) > WIKI_PAGE_EMBED_TEXT_MAX_CHARS:
        return text[: WIKI_PAGE_EMBED_TEXT_MAX_CHARS]
    return text


async def reindex_wiki_space_embeddings(db: AsyncSession, wiki_space_id: str) -> WikiSemanticIndexResult:
    """
    Embed all pages in the space using the space's configured embedding model when set,
    otherwise the global default embedding ApiModel. Overwrites existing embeddings for those pages.
    """
    ws = await db.get(WikiSpace, wiki_space_id)
    if not ws:
        raise ValueError("Wiki space not found.")
    model = await resolve_wiki_space_embedding_model(db, ws)
    if not model or not model.provider_rel:
        raise ValueError("No embedding model with a provider base URL is configured.")
    prov = model.provider_rel
    base_url = (prov.base_url or "").strip().rstrip("/")
    if not base_url:
        raise ValueError("Embedding provider has no base_url.")
    api_key = (prov.api_key or "").strip() or "no-key"
    model_name = (model.model_name or model.name or "").strip()
    if not model_name:
        raise ValueError("Embedding model has no model_name or name.")

    pages = (
        (
            await db.execute(
                select(WikiPage).where(WikiPage.wiki_space_id == wiki_space_id).order_by(WikiPage.path)
            )
        )
        .scalars()
        .all()
    )
    if not pages:
        return WikiSemanticIndexResult(
            indexed=0,
            failed=0,
            embedding_model_id=model.id,
            embedding_model_label=model_name,
        )

    client = AsyncOpenAI(base_url=base_url, api_key=api_key)
    now = datetime.now(timezone.utc)
    indexed = 0
    failed = 0

    for i in range(0, len(pages), WIKI_EMBED_BATCH_SIZE):
        batch = pages[i : i + WIKI_EMBED_BATCH_SIZE]
        inputs = [wiki_page_text_for_embedding(p) for p in batch]
        try:
            resp = await client.embeddings.create(model=model_name, input=inputs)
        except Exception:
            logger.exception("Wiki embedding batch failed (space=%s, batch_start=%s)", wiki_space_id, i)
            for p in batch:
                try:
                    one = await client.embeddings.create(model=model_name, input=wiki_page_text_for_embedding(p))
                    vec = one.data[0].embedding
                    p.embedding = vec
                    p.embedding_model_id = model.id
                    p.embedded_at = now
                    indexed += 1
                except Exception:
                    logger.exception("Wiki embedding failed for page %s", p.id)
                    failed += 1
            continue
        data = sorted(resp.data or [], key=lambda d: d.index)
        if len(data) != len(batch):
            logger.error(
                "Embedding batch size mismatch: expected %s got %s",
                len(batch),
                len(data),
            )
            failed += len(batch)
            continue
        for p, item in zip(batch, data, strict=True):
            try:
                p.embedding = item.embedding
                p.embedding_model_id = model.id
                p.embedded_at = now
                indexed += 1
            except Exception:
                logger.exception("Assign embedding failed for page %s", p.id)
                failed += 1

    return WikiSemanticIndexResult(
        indexed=indexed,
        failed=failed,
        embedding_model_id=model.id,
        embedding_model_label=model_name,
    )


async def semantic_match_pages(
    db: AsyncSession,
    wiki_space: WikiSpace,
    query: str,
    *,
    top_k: int | None = None,
    similarity_threshold: float | None = None,
) -> tuple[list[tuple[str, float]], bool]:
    """
    Return wiki ``(page_id, similarity)`` pairs ordered by embedding similarity to ``query``.
    ``similarity`` is ``1 - (embedding <=> query)`` (cosine distance from pgvector).
    Only rows with ``similarity >= similarity_threshold`` are included (threshold from ``wiki_space`` unless overridden).
    When the space has no stored embeddings, returns ``([], False)`` (caller still does string match only).
    The bool is True when semantic search was skipped (no embedding model, embed API error, or DB/pgvector error).
    """
    qt = query.strip()
    if len(qt) < 2:
        return [], False
    if not await wiki_space_has_any_embedding(db, wiki_space.id):
        return [], False
    th_raw = float(similarity_threshold if similarity_threshold is not None else wiki_space.semantic_similarity_threshold)
    th = max(0.0, min(1.0, th_raw))
    tk = top_k if top_k is not None else wiki_space.semantic_match_top_k
    tk = max(1, min(100, int(tk)))
    max_distance = 1.0 - th
    model = await resolve_wiki_space_embedding_model(db, wiki_space)
    if not model or not model.provider_rel:
        return [], True
    prov = model.provider_rel
    base_url = (prov.base_url or "").strip().rstrip("/")
    if not base_url:
        return [], True
    api_key = (prov.api_key or "").strip() or "no-key"
    model_name = (model.model_name or model.name or "").strip()
    if not model_name:
        return [], True
    client = AsyncOpenAI(base_url=base_url, api_key=api_key)
    try:
        resp = await client.embeddings.create(model=model_name, input=qt)
        query_vec = resp.data[0].embedding
    except Exception:
        logger.warning("Wiki semantic query embedding failed", exc_info=True)
        return [], True
    try:
        dist_expr = WikiPage.embedding.cosine_distance(query_vec)
        stmt = (
            select(WikiPage.id, dist_expr)
            .where(
                WikiPage.wiki_space_id == wiki_space.id,
                WikiPage.embedding.isnot(None),
                WikiPage.embedding_model_id == model.id,
                dist_expr <= max_distance,
            )
            .order_by(dist_expr)
            .limit(tk)
        )
        rows = (await db.execute(stmt)).all()
        out: list[tuple[str, float]] = []
        for r in rows:
            pid, d = r[0], r[1]
            sim = 1.0 - float(d)
            out.append((str(pid), sim))
        return out, False
    except Exception as e:
        if is_pgvector_server_missing(e):
            logger.info(
                "Wiki semantic search skipped: pgvector is not installed on this PostgreSQL "
                "server ($libdir/vector). Run `python scripts/ensure_pgvector.py` from "
                "`backend/` after installing pgvector, or use an image that includes it."
            )
        else:
            logger.warning("Wiki semantic vector query failed", exc_info=True)
        return [], True
