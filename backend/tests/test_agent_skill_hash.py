"""Tests for agent skill content hash."""

from pathlib import Path

from app.services.agent_skill_hash import compute_content_hash


def test_content_hash_stable_by_path_order(tmp_path: Path):
    (tmp_path / "b.txt").write_text("b", encoding="utf-8")
    (tmp_path / "a.txt").write_text("a", encoding="utf-8")
    (tmp_path / "SKILL.md").write_text("# skill", encoding="utf-8")
    h1 = compute_content_hash(tmp_path)
    h2 = compute_content_hash(tmp_path)
    assert h1 == h2
    assert len(h1) == 64


def test_content_hash_changes_when_file_changes(tmp_path: Path):
    (tmp_path / "SKILL.md").write_text("v1", encoding="utf-8")
    h1 = compute_content_hash(tmp_path)
    (tmp_path / "SKILL.md").write_text("v2", encoding="utf-8")
    h2 = compute_content_hash(tmp_path)
    assert h1 != h2
