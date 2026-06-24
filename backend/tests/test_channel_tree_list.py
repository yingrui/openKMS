"""Tests for channel tree list pagination."""

from __future__ import annotations

from dataclasses import dataclass

from app.services.channels.channel_tree_list import paginate_channels_for_tree


@dataclass
class _Ch:
    id: str
    parent_id: str | None


def test_paginate_roots_includes_subtrees():
    channels = [
        _Ch("r1", None),
        _Ch("c1", "r1"),
        _Ch("c2", "c1"),
        _Ch("r2", None),
        _Ch("x1", "r2"),
    ]
    page, total = paginate_channels_for_tree(channels, limit=1, offset=0)
    assert total == 2
    assert {c.id for c in page} == {"r1", "c1", "c2"}


def test_paginate_second_root_page():
    channels = [
        _Ch("r1", None),
        _Ch("r2", None),
    ]
    page, total = paginate_channels_for_tree(channels, limit=1, offset=1)
    assert total == 2
    assert {c.id for c in page} == {"r2"}
