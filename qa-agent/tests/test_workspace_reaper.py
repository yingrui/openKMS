"""The sweeper: reclaims idle session workspaces, and refuses to guess."""
import os
import time
from pathlib import Path

import pytest

from qa_agent import session_fs, workspace_reaper


@pytest.fixture(autouse=True)
def sessions_root(tmp_path, monkeypatch):
    from qa_agent.config import settings

    monkeypatch.setattr(settings, "sessions_root", str(tmp_path), raising=False)
    monkeypatch.setattr(settings, "session_ttl_minutes", 60, raising=False)
    monkeypatch.setattr(settings, "session_disk_mb", 0, raising=False)
    monkeypatch.setattr(settings, "session_upload_max_mb", 0, raising=False)
    return tmp_path


def _age(path: Path, seconds: int) -> None:
    stamp = time.time() - seconds
    for child in path.rglob("*"):
        os.utime(child, (stamp, stamp))
    os.utime(path, (stamp, stamp))


def test_an_idle_session_is_reclaimed_and_a_live_one_is_kept():
    session_fs.write_file("kb1", "idle", "out/a.txt", "x")
    session_fs.write_file("kb1", "live", "out/a.txt", "x")
    _age(session_fs.session_root("kb1", "idle"), 7200)

    assert [Path(p).name for p in workspace_reaper.sweep_once()] == ["idle"]
    assert session_fs.session_root("kb1", "live").exists()


def test_ttl_zero_disables_the_sweeper(monkeypatch):
    from qa_agent.config import settings

    monkeypatch.setattr(settings, "session_ttl_minutes", 0, raising=False)
    session_fs.write_file("kb1", "idle", "out/a.txt", "x")
    _age(session_fs.session_root("kb1", "idle"), 7200)
    assert workspace_reaper.sweep_once() == []


def test_an_empty_root_is_not_an_error():
    # nothing has been created yet: a sweeper must not create anything, nor fail
    assert workspace_reaper.sweep_once() == []
