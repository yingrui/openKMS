"""Agent skill package layout helpers."""

from pathlib import Path

from app.services.agent_skills_registry import unwrap_single_skill_root, validate_skill_tree


def test_unwrap_single_skill_root_hoists_folder_wrapper(tmp_path: Path) -> None:
    inner = tmp_path / "wiki-init"
    inner.mkdir()
    (inner / "SKILL.md").write_text("# skill", encoding="utf-8")
    (inner / "notes.md").write_text("notes", encoding="utf-8")

    unwrap_single_skill_root(tmp_path)

    assert (tmp_path / "SKILL.md").is_file()
    assert (tmp_path / "notes.md").is_file()
    assert not inner.exists()


def test_unwrap_single_skill_root_keeps_flat_layout(tmp_path: Path) -> None:
    (tmp_path / "SKILL.md").write_text("# skill", encoding="utf-8")

    unwrap_single_skill_root(tmp_path)

    assert (tmp_path / "SKILL.md").is_file()


def test_validate_skill_tree_accepts_wrapped_folder(tmp_path: Path) -> None:
    inner = tmp_path / "wiki-init"
    inner.mkdir()
    (inner / "SKILL.md").write_text("# skill", encoding="utf-8")

    validate_skill_tree(tmp_path)

    assert (tmp_path / "SKILL.md").is_file()
