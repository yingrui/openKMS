"""Helpers for listing and nesting content comments."""

from __future__ import annotations

from app.models.content_comment import ContentComment
from app.schemas.content_comment import ContentCommentOut


def comment_to_out(row: ContentComment, replies: list[ContentCommentOut] | None = None) -> ContentCommentOut:
    return ContentCommentOut(
        id=row.id,
        resource_type=row.resource_type,
        resource_id=row.resource_id,
        parent_comment_id=row.parent_comment_id,
        body=row.body,
        rank=row.rank,
        created_by=row.created_by,
        created_by_name=row.created_by_name,
        created_at=row.created_at,
        updated_at=row.updated_at,
        replies=replies or [],
    )


def build_comment_tree(rows: list[ContentComment]) -> tuple[list[ContentCommentOut], float | None, int]:
    """Nest flat rows into top-level comments with replies; compute rank summary."""
    tops: list[ContentComment] = []
    replies_by_parent: dict[str, list[ContentComment]] = {}
    rank_sum = 0
    rank_count = 0

    for row in rows:
        if row.parent_comment_id is None:
            tops.append(row)
            if row.rank is not None:
                rank_sum += row.rank
                rank_count += 1
        else:
            replies_by_parent.setdefault(row.parent_comment_id, []).append(row)

    items: list[ContentCommentOut] = []
    for top in tops:
        child_rows = replies_by_parent.get(top.id, [])
        child_rows.sort(key=lambda r: r.created_at)
        replies = [comment_to_out(r) for r in child_rows]
        items.append(comment_to_out(top, replies=replies))

    avg_rank = round(rank_sum / rank_count, 2) if rank_count else None
    return items, avg_rank, rank_count
