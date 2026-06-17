"""Content comments API — polymorphic comments with 0–5 rank on top-level posts."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.api.deps import get_jwt_sub
from app.database import get_db
from app.models.content_comment import ContentComment
from app.schemas.content_comment import (
    ContentCommentCreate,
    ContentCommentListResponse,
    ContentCommentOut,
    ContentCommentReplyCreate,
    ContentCommentUpdate,
)
from app.services.comment_scope import ensure_comment_resource_readable, validate_resource_type
from app.services.content_comment_service import build_comment_tree, comment_to_out

router = APIRouter(
    prefix="/comments",
    tags=["comments"],
    dependencies=[Depends(require_auth)],
)


def _creator_from_request(request: Request) -> tuple[str, str | None]:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(status_code=401, detail="Not authenticated")
    uname = p.get("preferred_username") or p.get("name")
    created_by_name = str(uname)[:256] if isinstance(uname, str) and uname.strip() else None
    return sub, created_by_name


async def _get_comment_or_404(db: AsyncSession, comment_id: str) -> ContentComment:
    row = await db.get(ContentComment, comment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Comment not found")
    return row


@router.get("", response_model=ContentCommentListResponse)
async def list_comments(
    request: Request,
    resource_type: str = Query(...),
    resource_id: str = Query(...),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> ContentCommentListResponse:
    rt = validate_resource_type(resource_type)
    rid = resource_id.strip()
    await ensure_comment_resource_readable(db, request, rt, rid)

    total = int(
        (
            await db.execute(
                select(func.count())
                .select_from(ContentComment)
                .where(
                    ContentComment.resource_type == rt,
                    ContentComment.resource_id == rid,
                    ContentComment.parent_comment_id.is_(None),
                )
            )
        ).scalar_one()
    )

    rank_stats = (
        await db.execute(
            select(func.avg(ContentComment.rank), func.count(ContentComment.rank))
            .where(
                ContentComment.resource_type == rt,
                ContentComment.resource_id == rid,
                ContentComment.parent_comment_id.is_(None),
                ContentComment.rank.is_not(None),
            )
        )
    ).one()
    avg_raw, rank_count_raw = rank_stats
    avg_rank = round(float(avg_raw), 2) if avg_raw is not None else None
    rank_count = int(rank_count_raw or 0)

    top_ids_result = await db.execute(
        select(ContentComment.id)
        .where(
            ContentComment.resource_type == rt,
            ContentComment.resource_id == rid,
            ContentComment.parent_comment_id.is_(None),
        )
        .order_by(ContentComment.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    top_ids = [row[0] for row in top_ids_result.all()]
    if not top_ids:
        return ContentCommentListResponse(items=[], total=total, avg_rank=None, rank_count=0)

    rows_result = await db.execute(
        select(ContentComment)
        .where(
            ContentComment.resource_type == rt,
            ContentComment.resource_id == rid,
            (
                ContentComment.id.in_(top_ids)
                | ContentComment.parent_comment_id.in_(top_ids)
            ),
        )
        .order_by(ContentComment.created_at.asc())
    )
    all_rows = list(rows_result.scalars().all())
    top_rows = [r for r in all_rows if r.id in top_ids]
    top_rows.sort(key=lambda r: top_ids.index(r.id))
    reply_rows = [r for r in all_rows if r.parent_comment_id in top_ids]
    ordered = top_rows + reply_rows

    items, _, _ = build_comment_tree(ordered)
    return ContentCommentListResponse(
        items=items,
        total=total,
        avg_rank=avg_rank,
        rank_count=rank_count,
    )


@router.post("", response_model=ContentCommentOut, status_code=201)
async def create_comment(
    body: ContentCommentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ContentCommentOut:
    rt = validate_resource_type(body.resource_type)
    rid = body.resource_id.strip()
    await ensure_comment_resource_readable(db, request, rt, rid)

    created_by, created_by_name = _creator_from_request(request)
    row = ContentComment(
        id=str(uuid.uuid4()),
        resource_type=rt,
        resource_id=rid,
        parent_comment_id=None,
        body=body.body.strip(),
        rank=body.rank,
        created_by=created_by,
        created_by_name=created_by_name,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return comment_to_out(row)


@router.post("/{comment_id}/replies", response_model=ContentCommentOut, status_code=201)
async def create_reply(
    comment_id: str,
    body: ContentCommentReplyCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ContentCommentOut:
    parent = await _get_comment_or_404(db, comment_id)
    if parent.parent_comment_id is not None:
        raise HTTPException(status_code=422, detail="Replies can only be added to top-level comments")

    await ensure_comment_resource_readable(db, request, parent.resource_type, parent.resource_id)

    created_by, created_by_name = _creator_from_request(request)
    row = ContentComment(
        id=str(uuid.uuid4()),
        resource_type=parent.resource_type,
        resource_id=parent.resource_id,
        parent_comment_id=parent.id,
        body=body.body.strip(),
        rank=None,
        created_by=created_by,
        created_by_name=created_by_name,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return comment_to_out(row)


@router.patch("/{comment_id}", response_model=ContentCommentOut)
async def update_comment(
    comment_id: str,
    body: ContentCommentUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ContentCommentOut:
    row = await _get_comment_or_404(db, comment_id)
    sub = get_jwt_sub(request)
    if row.created_by != sub:
        raise HTTPException(status_code=403, detail="Only the author can edit this comment")

    await ensure_comment_resource_readable(db, request, row.resource_type, row.resource_id)

    if body.body is not None:
        row.body = body.body.strip()
    if body.rank is not None:
        if row.parent_comment_id is not None:
            raise HTTPException(status_code=422, detail="Replies cannot have a rank")
        row.rank = body.rank
    row.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(row)
    return comment_to_out(row)


@router.delete("/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    row = await _get_comment_or_404(db, comment_id)
    sub = get_jwt_sub(request)
    if row.created_by != sub:
        raise HTTPException(status_code=403, detail="Only the author can delete this comment")

    await ensure_comment_resource_readable(db, request, row.resource_type, row.resource_id)
    await db.delete(row)
    await db.commit()
