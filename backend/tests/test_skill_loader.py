"""Tests for project skill path loading."""

from app.services.deep_agents.skills.loader import SKILLS_DIR_REL, list_skill_paths


def test_list_skill_paths_returns_parent_dir(monkeypatch, tmp_path):
    project_id = "proj-1"
    skills_root = tmp_path / "proj-1" / ".openkms" / "skills" / "openkms"
    skills_root.mkdir(parents=True)
    (skills_root / "SKILL.md").write_text("---\nname: openkms\ndescription: test\n---\n", encoding="utf-8")

    def fake_resolve(_pid: str, rel: str):
        assert rel == SKILLS_DIR_REL
        return tmp_path / "proj-1" / ".openkms" / "skills"

    monkeypatch.setattr(
        "app.services.deep_agents.skills.loader.resolve_project_path",
        fake_resolve,
    )

    assert list_skill_paths(project_id) == [SKILLS_DIR_REL]
