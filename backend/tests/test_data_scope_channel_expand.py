"""Channel subtree expansion for group data scopes (document + article trees share the same walk)."""

from app.services.data_scope import _expand_article_channel_ids, _expand_channel_ids


class _Node:
    __slots__ = ("id", "parent_id")

    def __init__(self, id: str, parent_id: str | None = None) -> None:
        self.id = id
        self.parent_id = parent_id


def test_expand_document_channels_descendants():
    tree = [
        _Node("root"),
        _Node("c1", "root"),
        _Node("c2", "c1"),
        _Node("other"),
    ]
    assert _expand_channel_ids(tree, {"root"}) == {"root", "c1", "c2"}


def test_expand_document_channels_empty_roots():
    tree = [_Node("a"), _Node("b", "a")]
    assert _expand_channel_ids(tree, set()) == set()


def test_expand_document_channels_unknown_root():
    tree = [_Node("a")]
    assert _expand_channel_ids(tree, {"missing"}) == set()


def test_expand_article_channels_parallel_trees():
    tree = [
        _Node("news"),
        _Node("news-tech", "news"),
        _Node("blog"),
    ]
    assert _expand_article_channel_ids(tree, {"news"}) == {"news", "news-tech"}
    assert _expand_article_channel_ids(tree, {"blog"}) == {"blog"}
