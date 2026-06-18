"""Unit tests for owned-resource comment feed helpers."""

import asyncio

from app.services.acl_identity import user_grant_matches
from app.services.comment_owned_feed import preview_comment_body


def test_preview_comment_body_short_unchanged():
    assert preview_comment_body("hello") == "hello"


def test_preview_comment_body_truncates_long_text():
    body = "a" * 300
    out = preview_comment_body(body)
    assert len(out) == 240
    assert out.endswith("…")


def test_preview_comment_body_strips_whitespace():
    assert preview_comment_body("  hi  ") == "hi"


def test_owner_acl_grant_matches_username_vs_uuid_sub():
    """Home feed ownership must use ACL identity matching, not grantee_id == sub."""

    async def _run() -> None:
        matched = await user_grant_matches(
            None,
            "yingrui",
            "11dcdd51-b251-4a69-9288-05ab2952be38",
            {"sub": "11dcdd51-b251-4a69-9288-05ab2952be38", "preferred_username": "yingrui"},
        )
        assert matched is True

    asyncio.run(_run())
