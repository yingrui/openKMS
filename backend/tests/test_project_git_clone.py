"""Git clone argument construction for project workspaces."""

from app.services.deep_agents.git_service import clone_git_args


def test_clone_args_default_branch():
    assert clone_git_args("https://example.com/repo.git", "/tmp/p") == [
        "git",
        "clone",
        "https://example.com/repo.git",
        "/tmp/p",
    ]


def test_clone_args_with_branch():
    assert clone_git_args("https://example.com/repo.git", "/tmp/p", "main") == [
        "git",
        "clone",
        "--branch",
        "main",
        "--single-branch",
        "https://example.com/repo.git",
        "/tmp/p",
    ]
