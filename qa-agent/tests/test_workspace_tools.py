"""File tools over one conversation's workspace: scoped, and refusing outside it."""
import pytest

from qa_agent import request_context, session_fs
from qa_agent.skills.workspace import (
    list_workspace_files_tool,
    read_workspace_file_tool,
    write_workspace_file_tool,
)


@pytest.fixture(autouse=True)
def sessions_root(tmp_path, monkeypatch):
    from qa_agent.config import settings

    monkeypatch.setattr(settings, "sessions_root", str(tmp_path), raising=False)
    monkeypatch.setattr(settings, "session_disk_mb", 0, raising=False)
    monkeypatch.setattr(settings, "session_upload_max_mb", 0, raising=False)
    h1 = request_context.set_request_knowledge_base_id("kb1")
    h2 = request_context.set_request_session_id("s1")
    yield
    request_context.reset_request_session_id(h2)
    request_context.reset_request_knowledge_base_id(h1)


def _write(path, content):
    # keyword args: the tools take `_config` first, so positional calls silently mis-bind
    return write_workspace_file_tool.func(_config={}, path=path, content=content)


def _read(path):
    return read_workspace_file_tool.func(_config={}, path=path)


def _list(path=""):
    return list_workspace_files_tool.func(_config={}, path=path)


class TestScoping:
    def test_a_bare_filename_lands_in_out(self):
        assert _write("chart.csv", "a,b\n1,2\n").startswith("Wrote out/chart.csv")
        assert _read("out/chart.csv").startswith("a,b")

    def test_the_session_comes_from_the_context_not_the_call(self):
        _write("x.txt", "hello")
        assert "x.txt" in _list("out")
        # a different conversation sees nothing of it
        h = request_context.set_request_session_id("s2")
        try:
            assert _list("out") == "The workspace is empty."
        finally:
            request_context.reset_request_session_id(h)

    def test_without_a_session_the_tools_refuse(self):
        h = request_context.set_request_session_id("")
        try:
            assert "No session in scope" in _write("x.txt", "hi")
            assert "No session in scope" in _read("out/x.txt")
        finally:
            request_context.reset_request_session_id(h)

    def test_escaping_the_session_is_refused(self):
        request_context.set_request_session_id("s2")
        session_fs.write_file("kb1", "s2", "out/secret.txt", "s2 only")
        h = request_context.set_request_session_id("s1")
        try:
            assert "not allowed" in _read("../s2/out/secret.txt")
        finally:
            request_context.reset_request_session_id(h)

    def test_skills_directory_is_read_only(self):
        assert "read-only" in _write(".openkms/skills/x/SKILL.md", "no")
