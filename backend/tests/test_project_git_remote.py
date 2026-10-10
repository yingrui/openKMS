"""Workspace git origin URL and remote set-url."""

from app.services.deep_agents.git_service import git_origin_url, git_remote_add, git_status


def test_git_status_includes_origin(tmp_path, monkeypatch):
    root = tmp_path / "proj"
    root.mkdir()
    monkeypatch.setattr("app.services.deep_agents.git_service.project_root", lambda _id: root)
    assert git_status("p1") == {
        "entries": [],
        "branch": None,
        "remote_url": None,
        "ahead": None,
        "behind": None,
    }

    from subprocess import run

    run(["git", "init"], cwd=root, check=True, capture_output=True)
    run(["git", "remote", "add", "origin", "https://github.com/org/repo.git"], cwd=root, check=True, capture_output=True)
    data = git_status("p1")
    assert data["remote_url"] == "https://github.com/org/repo.git"


def test_git_remote_add_then_set_url(tmp_path, monkeypatch):
    root = tmp_path / "proj"
    root.mkdir()
    monkeypatch.setattr("app.services.deep_agents.git_service.project_root", lambda _id: root)
    from subprocess import run

    run(["git", "init"], cwd=root, check=True, capture_output=True)
    git_remote_add("p1", "https://github.com/org/old.git")
    assert git_origin_url("p1") == "https://github.com/org/old.git"
    git_remote_add("p1", "https://gitlab.example.com/org/new.git")
    assert git_origin_url("p1") == "https://gitlab.example.com/org/new.git"
