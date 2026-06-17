"""Unit tests for content comment helpers and validation."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.content_comment import ContentComment
from app.schemas.content_comment import ContentCommentCreate, ContentCommentUpdate
from app.services.comment_resource_types import COMMENT_RESOURCE_TYPES
from app.services.content_comment_service import build_comment_tree


def _row(
    id: str,
    *,
    parent: str | None = None,
    rank: int | None = None,
    body: str = "text",
) -> ContentComment:
    now = datetime.now(timezone.utc)
    return ContentComment(
        id=id,
        resource_type="article",
        resource_id="art-1",
        parent_comment_id=parent,
        body=body,
        rank=rank,
        created_by="user-a",
        created_by_name="Alice",
        created_at=now,
        updated_at=now,
    )


def test_comment_resource_types_includes_five_kinds():
    assert COMMENT_RESOURCE_TYPES == frozenset(
        {"article", "document", "knowledge_base", "wiki_space", "project"}
    )


def test_build_comment_tree_nests_replies_and_avg_rank():
    rows = [
        _row("c1", rank=4),
        _row("c2", rank=2),
        _row("r1", parent="c1", body="reply one"),
        _row("r2", parent="c1", body="reply two"),
    ]
    items, avg_rank, rank_count = build_comment_tree(rows)
    assert len(items) == 2
    assert len(items[0].replies) == 2
    assert items[0].replies[0].body == "reply one"
    assert items[0].rank == 4
    assert items[0].replies[0].rank is None
    assert avg_rank == 3.0
    assert rank_count == 2


def test_content_comment_create_requires_rank_range():
    ContentCommentCreate(resource_type="article", resource_id="x", body="hi", rank=0)
    ContentCommentCreate(resource_type="article", resource_id="x", body="hi", rank=5)
    with pytest.raises(ValidationError):
        ContentCommentCreate(resource_type="article", resource_id="x", body="hi", rank=6)
    with pytest.raises(ValidationError):
        ContentCommentCreate(resource_type="article", resource_id="x", body="", rank=3)


def test_content_comment_update_rejects_blank_body():
    with pytest.raises(ValidationError):
        ContentCommentUpdate(body="   ")
