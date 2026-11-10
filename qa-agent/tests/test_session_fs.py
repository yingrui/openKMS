"""The per-session workspace: one directory per conversation, and nothing outside it."""
import time
from pathlib import Path

import pytest

from qa_agent import session_fs


@pytest.fixture(autouse=True)
def sessions_root(tmp_path, monkeypatch):
    from qa_agent.config import settings

    monkeypatch.setattr(settings, "sessions_root", str(tmp_path), raising=False)
    monkeypatch.setattr(settings, "session_disk_mb", 0, raising=False)
    monkeypatch.setattr(settings, "session_upload_max_mb", 0, raising=False)
    return tmp_path


class TestLayout:
    def test_one_directory_per_conversation_nested_under_the_kb(self, sessions_root):
        root = session_fs.ensure_session_dir("kb1", "s1")
        assert root == (sessions_root / "kb1" / "s1").resolve()
        assert (root / "uploads").is_dir()
        assert (root / "out").is_dir()
        assert (root / ".openkms" / "skills").is_dir()

    def test_two_sessions_do_not_share_a_directory(self):
        assert session_fs.session_root("kb1", "s1") != session_fs.session_root("kb1", "s2")

    def test_two_kbs_do_not_share_a_directory(self):
        assert session_fs.session_root("kb1", "s1") != session_fs.session_root("kb2", "s1")

    def test_agents_md_is_written_once(self):
        session_fs.ensure_session_dir("kb1", "s1", agents_md="# rules")
        session_fs.ensure_session_dir("kb1", "s1", agents_md="# changed")
        assert (session_fs.session_root("kb1", "s1") / "AGENTS.md").read_text() == "# rules"


class TestEscapes:
    @pytest.mark.parametrize("bad", ["../../etc", "a/../../b", "../s2/x"])
    def test_relative_traversal_is_refused(self, bad):
        with pytest.raises(session_fs.SessionPathError):
            session_fs.resolve_session_path("kb1", "s1", bad)

    def test_a_leading_slash_is_virtual_not_the_host_root(self):
        # The agent's file tools say `/out/chart.csv`; that must mean the session's out/, never the host's /out.
        path = session_fs.resolve_session_path("kb1", "s1", "/out/chart.csv")
        assert path == session_fs.session_root("kb1", "s1") / "out" / "chart.csv"
        assert session_fs.resolve_session_path("kb1", "s1", "/etc/passwd").name == "passwd"
        assert str(session_fs.resolve_session_path("kb1", "s1", "/etc/passwd")).startswith(
            str(session_fs.session_root("kb1", "s1"))
        )

    @pytest.mark.parametrize("bad", ["..", "../s2", "a/b", "kb/../x", ""])
    def test_ids_are_validated_as_path_segments(self, bad):
        with pytest.raises(session_fs.SessionPathError):
            session_fs.session_root(bad, "s1")

    def test_a_sibling_session_cannot_be_reached(self):
        session_fs.ensure_session_dir("kb1", "s1")
        session_fs.ensure_session_dir("kb1", "s2")
        session_fs.write_file("kb1", "s2", "out/secret.txt", "s2 data")
        with pytest.raises(session_fs.SessionPathError):
            session_fs.read_file("kb1", "s1", "../s2/out/secret.txt")


class TestReadOnlySkills:
    def test_writing_under_openkms_is_refused(self):
        with pytest.raises(session_fs.SessionPathError, match="read-only"):
            session_fs.write_file("kb1", "s1", ".openkms/skills/x/SKILL.md", "no")

    def test_reading_a_skill_is_allowed(self):
        root = session_fs.ensure_session_dir("kb1", "s1")
        path = root / ".openkms" / "skills" / "s" / "SKILL.md"
        path.parent.mkdir(parents=True)
        path.write_text("# skill")
        assert session_fs.read_file("kb1", "s1", ".openkms/skills/s/SKILL.md")["content"] == "# skill"


class TestContent:
    def test_round_trip(self):
        session_fs.write_file("kb1", "s1", "out/chart.md", "hello")
        assert session_fs.read_file("kb1", "s1", "out/chart.md")["content"] == "hello"

    def test_a_row_is_listed_with_its_size(self):
        session_fs.write_file("kb1", "s1", "out/a.csv", "a,b\n1,2\n")
        entries = {e["name"]: e for e in session_fs.list_dir("kb1", "s1", "out")}
        assert entries["a.csv"]["size"] == 8
        assert entries["a.csv"]["is_dir"] is False

    def test_binary_and_oversized_are_stubs_not_content(self):
        root = session_fs.ensure_session_dir("kb1", "s1")
        (root / "out" / "big.png").write_bytes(b"\x89PNG\r\n" + b"0" * 32)
        payload = session_fs.read_file("kb1", "s1", "out/big.png")
        assert payload["content"] is None
        assert payload["is_binary"] is True
        assert payload["size"] > 0


class TestQuota:
    def test_a_write_over_the_session_quota_is_refused(self, sessions_root, monkeypatch):
        from qa_agent.config import settings

        monkeypatch.setattr(settings, "session_disk_mb", 1, raising=False)
        session_fs.write_file("kb1", "s1", "out/a.txt", "x" * 600_000)
        with pytest.raises(session_fs.SessionQuotaExceeded):
            session_fs.write_file("kb1", "s1", "out/b.txt", "x" * 600_000)

    def test_usage_counts_every_file(self):
        session_fs.write_file("kb1", "s1", "out/a.txt", "12345")
        session_fs.write_file("kb1", "s1", "uploads/b.txt", "123")
        assert session_fs.session_usage_bytes("kb1", "s1") == 8


class TestReclaim:
    def test_an_idle_session_is_removed_and_a_fresh_one_is_not(self):
        session_fs.write_file("kb1", "old", "out/a.txt", "x")
        session_fs.write_file("kb1", "fresh", "out/a.txt", "x")
        old_dir = session_fs.session_root("kb1", "old")
        past = time.time() - 3 * 3600
        for path in old_dir.rglob("*"):
            import os

            os.utime(path, (past, past))
        import os

        os.utime(old_dir, (past, past))

        removed = session_fs.reclaim_expired(60)
        assert [Path(p).name for p in removed] == ["old"]
        assert not old_dir.exists()
        assert session_fs.session_root("kb1", "fresh").exists()

    def test_ttl_zero_disables_reclaiming(self):
        session_fs.write_file("kb1", "s1", "out/a.txt", "x")
        assert session_fs.reclaim_expired(0) == []

    def test_remove_session_deletes_the_whole_directory(self):
        session_fs.write_file("kb1", "s1", "out/a.txt", "x")
        assert session_fs.remove_session("kb1", "s1") is True
        assert not session_fs.session_root("kb1", "s1").exists()
        assert session_fs.remove_session("kb1", "s1") is False
