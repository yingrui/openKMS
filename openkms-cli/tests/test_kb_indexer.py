"""Tests for KB chunking helpers."""

from openkms_cli.kb_indexer import chunk_document


def test_markdown_header_splits_oversized_sections():
    body = "x" * 2000
    md = f"## Big section\n\n{body}"
    chunks = chunk_document(md, {"strategy": "markdown_header", "chunk_size": 512, "chunk_overlap": 50})
    assert len(chunks) > 1
    assert all(len(c["content"]) <= 512 for c in chunks)
    assert all(c["metadata"].get("strategy") == "markdown_header" for c in chunks)
    assert chunks[0]["metadata"].get("heading") == "Big section"
    assert chunks[0]["content"].startswith("## Big section")


def test_markdown_header_small_section_unchanged():
    md = "## Short\n\nHello world."
    chunks = chunk_document(md, {"strategy": "markdown_header", "chunk_size": 512, "chunk_overlap": 50})
    assert len(chunks) == 1
    assert "## Short" in chunks[0]["content"]
    assert "Hello world." in chunks[0]["content"]
    assert "split_part" not in chunks[0]["metadata"]


def test_paragraph_splits_oversized_paragraph():
    para = "word " * 400
    chunks = chunk_document(para.strip(), {"strategy": "paragraph", "chunk_size": 200, "chunk_overlap": 20})
    assert len(chunks) > 1
    assert all(len(c["content"]) <= 200 for c in chunks)


def test_fixed_size_not_double_split():
    text = "a" * 1000
    chunks = chunk_document(text, {"strategy": "fixed_size", "chunk_size": 300, "chunk_overlap": 30})
    assert len(chunks) > 1
    assert all(len(c["content"]) <= 300 for c in chunks)


def test_wiki_page_single_chunk_when_small():
    from openkms_cli.kb_indexer import chunk_wiki_page

    md = "## Overview\n\nShort page body."
    chunks = chunk_wiki_page(md)
    assert len(chunks) == 1
    assert chunks[0]["metadata"]["strategy"] == "wiki_page"
    assert "Overview" in chunks[0]["content"]


def test_wiki_page_splits_at_header_when_large():
    from openkms_cli.kb_indexer import chunk_wiki_page

    body = "x" * 8500
    md = f"## Part one\n\n{body}\n\n## Part two\n\nHello."
    chunks = chunk_wiki_page(md, max_size=8000)
    assert len(chunks) >= 2
    assert all(len(c["content"]) <= 8000 for c in chunks)
    assert all(c["metadata"]["strategy"] == "wiki_page" for c in chunks)


def test_wiki_page_splits_at_last_header_before_limit():
    from openkms_cli.kb_indexer import chunk_wiki_page

    intro = "y" * 100
    body = "z" * 9000
    md = f"{intro}\n\n## Section\n\n{body}"
    chunks = chunk_wiki_page(md, max_size=8000)
    assert len(chunks) >= 2
    assert all(len(c["content"]) <= 8000 for c in chunks)


def test_wiki_page_many_small_headers_stay_packed():
    """Oversized pages must not emit one chunk per ### section."""
    from openkms_cli.kb_indexer import chunk_wiki_page

    parts = [f"### Section {i}\n\n<!-- entries added by wiki-ingest -->\n\n{'x' * 120}" for i in range(80)]
    md = "\n\n".join(parts)
    assert len(md) > 8000
    chunks = chunk_wiki_page(md, max_size=8000)
    assert len(chunks) < len(parts)
    assert all(len(c["content"]) <= 8000 for c in chunks)
    assert chunks[0]["metadata"]["strategy"] == "wiki_page"


def test_wiki_page_splits_at_h4_header():
    from openkms_cli.kb_indexer import chunk_wiki_page

    prefix = "intro\n\n" + "x" * 7990
    md = f"{prefix}\n\n#### 终身寿险 (万能型)\n\n- [[wiki/pages/foo-bar]]"
    assert len(md) > 8000
    chunks = chunk_wiki_page(md, max_size=8000)
    assert len(chunks) >= 2
    assert any("#### 终身寿险" in c["content"] for c in chunks[1:])
    assert all("[[wiki/" not in c["content"][-25:] or "]]" in c["content"][-80:] for c in chunks)


def test_wiki_page_avoids_mid_line_cut_without_headers():
    from openkms_cli.kb_indexer import chunk_wiki_page

    line = "- [[wiki/pages/some-page-name]] — title (ingested 2026-06-07)\n"
    md = line * 400
    assert len(md) > 8000
    chunks = chunk_wiki_page(md, max_size=8000)
    for c in chunks:
        tail = c["content"][-40:]
        assert not (tail.count("[[") > tail.count("]]")), f"chunk ends mid-wikilink: ...{tail!r}"
