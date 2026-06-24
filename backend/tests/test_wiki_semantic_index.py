"""Wiki semantic index helpers (text shaping)."""

from app.models.wiki_models import WikiPage
from app.services.wiki.wiki_semantic_index import WIKI_PAGE_EMBED_TEXT_MAX_CHARS, wiki_page_text_for_embedding


def test_wiki_page_text_for_embedding_truncates() -> None:
    p = WikiPage(
        id="p1",
        wiki_space_id="s1",
        path="notes/big",
        title="Big",
        body="x" * (WIKI_PAGE_EMBED_TEXT_MAX_CHARS + 10_000),
    )
    out = wiki_page_text_for_embedding(p)
    assert len(out) == WIKI_PAGE_EMBED_TEXT_MAX_CHARS


def test_wiki_page_text_includes_title_and_path() -> None:
    p = WikiPage(
        id="p2",
        wiki_space_id="s1",
        path="a/b",
        title="Hello",
        body="World",
    )
    out = wiki_page_text_for_embedding(p)
    assert "Hello" in out and "a/b" in out and "World" in out
