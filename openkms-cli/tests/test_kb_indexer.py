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
