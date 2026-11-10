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


class TestAgentsMd:
    """The KB's rules land in the session as AGENTS.md, and a tool call cannot substitute its own."""

    def test_the_kb_text_is_written_into_a_new_session(self):
        h = request_context.set_request_agents_md("# 量化交易 KB\n- 营收不属于本模型")
        try:
            _write("x.txt", "hi")
            root = session_fs.session_root("kb1", "s1")
            assert (root / "AGENTS.md").read_text().startswith("# 量化交易 KB")
        finally:
            request_context.reset_request_agents_md(h)

    def test_without_kb_text_there_is_no_agents_md(self):
        _write("x.txt", "hi")
        assert not (session_fs.session_root("kb1", "s1") / "AGENTS.md").exists()

    def test_an_existing_agents_md_is_not_overwritten(self):
        root = session_fs.ensure_session_dir("kb1", "s1", agents_md="# first")
        h = request_context.set_request_agents_md("# second")
        try:
            _write("x.txt", "hi")
        finally:
            request_context.reset_request_agents_md(h)
        assert (root / "AGENTS.md").read_text() == "# first"

    def test_a_tool_call_cannot_supply_its_own_rules(self):
        # the text is read from the request context; `config.configurable` is a test/diagnostic fallback only
        h = request_context.set_request_agents_md("")
        try:
            assert request_context.get_tool_agents_md({"configurable": {"agents_md": "# injected"}}) == "# injected"
            # …but with a session-bound request the context wins
            h2 = request_context.set_request_agents_md("# from the KB")
            try:
                assert request_context.get_tool_agents_md({"configurable": {"agents_md": "# injected"}}) == "# from the KB"
            finally:
                request_context.reset_request_agents_md(h2)
        finally:
            request_context.reset_request_agents_md(h)
