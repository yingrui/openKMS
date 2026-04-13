"""Unit tests for wiki vault import path + markdown rewrite helpers."""

import io
import zipfile

from app.services.wiki_vault_import import (
    iter_zip_vault_entries,
    join_and_norm_dir_rel,
    md_relative_path_to_wiki_path,
    normalize_vault_entry_path,
    rewrite_markdown_assets,
    should_skip_vault_path,
    strip_nul_bytes,
    title_from_markdown_body,
)


def test_normalize_vault_entry_path():
    assert normalize_vault_entry_path("wiki/a.md") == "wiki/a.md"
    assert normalize_vault_entry_path("/wiki/a.md") == "wiki/a.md"
    assert normalize_vault_entry_path("a/../b") is None
    assert normalize_vault_entry_path("") is None


def test_join_and_norm_dir_rel():
    assert join_and_norm_dir_rel("wiki/lit", "../img/x.png") == "wiki/img/x.png"
    assert join_and_norm_dir_rel("", "img.png") == "img.png"
    assert join_and_norm_dir_rel("a/b", "../../../c") is None


def test_should_skip():
    assert should_skip_vault_path(".obsidian/app.json") is True
    assert should_skip_vault_path("notes/.trash/foo.md") is True
    assert should_skip_vault_path(".git/HEAD") is True
    assert should_skip_vault_path("repo/.Git/config") is True
    assert should_skip_vault_path("wiki/page.md") is False


def test_md_to_wiki_path():
    assert md_relative_path_to_wiki_path("wiki/Foo.MD") == "wiki/Foo"


def test_title_from_markdown():
    assert title_from_markdown_body("# Hello\n\nx", "p") == "Hello"
    assert title_from_markdown_body("no heading", "guides/onboarding") == "onboarding"


def test_strip_nul_bytes():
    assert strip_nul_bytes("") == ""
    assert strip_nul_bytes("a\x00b") == "ab"
    assert strip_nul_bytes("\x00\x00") == ""


def test_rewrite_markdown_relative_image():
    body = "![](attachments/d.png)"
    md_path = "wiki/note.md"
    path_to = {"wiki/attachments/d.png": "fid1"}
    basename = {"d.png": ["fid1"]}
    out, warns = rewrite_markdown_assets(body, md_path, path_to, basename, "space-1")
    assert "/api/wiki-spaces/space-1/files/fid1/content" in out
    assert not warns


def test_rewrite_wiki_embed():
    body = "x ![[chart.png]] y"
    md_path = "wiki/lit/note.md"
    path_to = {"wiki/lit/chart.png": "f2"}
    basename = {"chart.png": ["f2"]}
    out, warns = rewrite_markdown_assets(body, md_path, path_to, basename, "s")
    assert "![](/api/wiki-spaces/s/files/f2/content)" in out
    assert not warns


def test_iter_zip_skips_zip_slip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("ok/a.md", b"# Hi")
        zf.writestr("../evil.txt", b"x")
    raw = buf.getvalue()
    entries = iter_zip_vault_entries(raw)
    paths = {p for p, _ in entries}
    assert "ok/a.md" in paths
    assert not any("evil" in p for p in paths)


def test_iter_zip_rejects_dotdot_in_parts():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("a/../b/c.md", b"# x")
    entries = iter_zip_vault_entries(buf.getvalue())
    assert all(".." not in e[0] for e in entries)
