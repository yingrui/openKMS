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


def test_a_knowledge_base_skills_directory_is_never_reclaimed():
    """Skills belong to the KB, not to a conversation: idle ones must survive the sweep.

    They live beside the sessions (`{root}/{kb}/skills/`), so a sweeper that walks every directory under the KB directory
    deleted them a day after the last use — a KB's scripts vanished, and both the README and `kb_skills_dir` said they would
    not. The sweep now matches session ids only.
    """
    skills = session_fs.kb_skills_dir("kb1")
    (skills / "scripts").mkdir(parents=True, exist_ok=True)
    (skills / "scripts" / "query.py").write_text("print(1)")
    session_fs.write_file("kb1", "idle", "out/a.txt", "x")
    _age(skills, 7200)
    _age(session_fs.session_root("kb1", "idle"), 7200)

    assert [Path(p).name for p in workspace_reaper.sweep_once()] == ["idle"]
    assert (skills / "scripts" / "query.py").exists()


def test_the_shared_font_cache_is_not_a_knowledge_base():
    """`.mplconfig` sits at the sessions root; the sweep must not treat it as a KB with stale sessions inside."""
    sessions = Path(session_fs.session_root("kb1", "x")).parents[1]
    cache = sessions / ".mplconfig" / "fontlist"
    cache.mkdir(parents=True, exist_ok=True)
    (cache / "cache.json").write_text("{}")
    _age(sessions / ".mplconfig", 7200)

    assert workspace_reaper.sweep_once() == []
    assert (cache / "cache.json").exists()
