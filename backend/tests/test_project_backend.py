"""Tests for project workspace path normalization."""

from pathlib import Path

from app.services.deep_agents.project_backend import normalize_workspace_path


def test_host_absolute_under_cwd_maps_to_virtual():
    cwd = Path("/data/projects/abc-123").resolve()
    key = "/data/projects/abc-123/.gitignore"
    assert normalize_workspace_path(cwd, key) == "/.gitignore"


def test_virtual_path_unchanged():
    cwd = Path("/data/projects/abc-123").resolve()
    assert normalize_workspace_path(cwd, "/AGENTS.md") == "/AGENTS.md"
    assert normalize_workspace_path(cwd, ".gitignore") == ".gitignore"


def test_macos_style_absolute_under_cwd():
    cwd = Path(
        "/Users/dev/workspace/openKMS/backend/data/projects/75407b39-3bef-4a42-acec-0cdcf4336dc4"
    ).resolve()
    key = (
        "/Users/dev/workspace/openKMS/backend/data/projects/"
        "75407b39-3bef-4a42-acec-0cdcf4336dc4/.gitignore"
    )
    assert normalize_workspace_path(cwd, key) == "/.gitignore"
