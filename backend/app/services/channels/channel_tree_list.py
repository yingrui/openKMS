"""Paginate channel rows for tree list endpoints (root-level pages include full subtrees)."""

from __future__ import annotations

from typing import Protocol


class _ChannelRow(Protocol):
    id: str
    parent_id: str | None


def paginate_channels_for_tree[T: _ChannelRow](
    channels: list[T],
    *,
    limit: int,
    offset: int,
) -> tuple[list[T], int]:
    """Return a channel slice and total root count.

    Pagination applies to **top-level** channels (``parent_id is None``). Each page
    includes every descendant of the selected roots so the response remains a valid forest.
    """
    roots = [c for c in channels if c.parent_id is None]
    total = len(roots)
    page_roots = roots[offset : offset + limit]
    if not page_roots:
        return [], total

    children_by_parent: dict[str | None, list[T]] = {}
    for c in channels:
        children_by_parent.setdefault(c.parent_id, []).append(c)

    keep_ids: set[str] = set()

    def add_subtree(channel_id: str) -> None:
        if channel_id in keep_ids:
            return
        keep_ids.add(channel_id)
        for child in children_by_parent.get(channel_id, []):
            add_subtree(child.id)

    for root in page_roots:
        add_subtree(root.id)

    return [c for c in channels if c.id in keep_ids], total
