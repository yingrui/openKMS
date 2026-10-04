"""KB Q&A and FAQ-assist threads share one router factory; surfaces must stay isolated."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.kb_agent_conversations import _get_kb_conversation, faq_router, router


def _db_returning(conv):
    db = AsyncMock()
    db.get = AsyncMock(return_value=conv)
    return db


def _conv(surface: str, kb_id: str = "kb1", user_sub: str = "u1"):
    return SimpleNamespace(surface=surface, user_sub=user_sub, context={"knowledge_base_id": kb_id})


def test_get_kb_conversation_matches_surface():
    conv = _conv("kb_faq")
    got = asyncio.run(_get_kb_conversation(_db_returning(conv), "c1", "u1", "kb1", "kb_faq"))
    assert got is conv


@pytest.mark.parametrize(
    "conv,surface",
    [
        (_conv("knowledge_base"), "kb_faq"),
        (_conv("kb_faq"), "knowledge_base"),
        (_conv("kb_faq", kb_id="other"), "kb_faq"),
        (_conv("kb_faq", user_sub="someone-else"), "kb_faq"),
        (None, "kb_faq"),
    ],
)
def test_get_kb_conversation_rejects_other_surface_kb_or_user(conv, surface):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(_get_kb_conversation(_db_returning(conv), "c1", "u1", "kb1", surface))
    assert exc.value.status_code == 404


def test_routers_use_distinct_path_segments():
    kb_paths = {r.path for r in router.routes}
    faq_paths = {r.path for r in faq_router.routes}
    assert all("/agent-conversations" in p for p in kb_paths)
    assert all("/faq-assist-conversations" in p for p in faq_paths)
    assert len(kb_paths) == len(faq_paths)
