"""Execution: the subprocess model the project agent uses, with an allow list for shell commands."""
import os
import sys
import time
from pathlib import Path

import pytest

from qa_agent import sandbox


@pytest.fixture(autouse=True)
def sessions_root(tmp_path, monkeypatch):
    from qa_agent.config import settings

    monkeypatch.setattr(settings, "sessions_root", str(tmp_path), raising=False)
    monkeypatch.setattr(settings, "openkms_backend_url", "http://backend:8102", raising=False)
    return tmp_path


class TestConfig:
    def test_off_unless_enabled(self):
        assert sandbox.sandbox_config(None) == {"enabled": False}
        assert sandbox.sandbox_config({"sandbox": {}}) == {"enabled": False}
        assert sandbox.sandbox_config({"sandbox": {"enabled": True}})["enabled"] is True

    def test_ceilings_are_bounded(self):
        assert "timeout_seconds" not in sandbox.sandbox_config({"sandbox": {"enabled": True, "timeout_seconds": 1}})

    def test_a_kb_may_add_commands_but_the_builtins_remain(self):
        allowed = sandbox.allowed_commands({"allow_commands": ["csvkit"]})
        assert "csvkit" in allowed
        assert "python" in allowed and "cat" in allowed


class TestCommandPolicy:
    def test_an_allowed_program_passes(self):
        sandbox.check_command("ls -la out", sandbox.ALLOWED_COMMANDS)

    def test_an_unknown_program_is_refused_by_position(self):
        with pytest.raises(sandbox.CommandNotAllowed, match="docker"):
            sandbox.check_command("docker ps", sandbox.ALLOWED_COMMANDS)

    def test_a_mention_mid_argument_is_not_a_command(self):
        # `grep docker notes.md` is ordinary work that mentions a denied binary
        sandbox.check_command("grep docker notes.md", sandbox.ALLOWED_COMMANDS)

    def test_each_segment_is_checked(self):
        with pytest.raises(sandbox.CommandNotAllowed):
            sandbox.check_command("ls && kubectl get pods", sandbox.ALLOWED_COMMANDS)

    def test_wrappers_are_looked_past(self):
        with pytest.raises(sandbox.CommandNotAllowed):
            sandbox.check_command("sudo docker ps", sandbox.ALLOWED_COMMANDS)
        sandbox.check_command("env A=1 ls", sandbox.ALLOWED_COMMANDS)

    def test_an_interpreter_cannot_smuggle_a_command(self):
        with pytest.raises(sandbox.CommandNotAllowed):
            sandbox.check_command('sh -c "docker ps"', sandbox.ALLOWED_COMMANDS)


class TestRunPython:
    def test_it_runs_in_the_session_folder_with_a_curated_environment(self):
        result = sandbox.run_python(
            "import os; print(os.getcwd()); print(os.environ.get('OPENKMS_API_KEY', '-'))",
            kb_id="kb1", session_id="s1", settings={"enabled": True}, access_token="user-jwt",
        )
        assert result.ok
        assert str(Path(result.stdout.splitlines()[0]).resolve()).endswith("/kb1/s1")
        assert result.stdout.splitlines()[1] == "user-jwt"

    def test_the_agents_own_environment_is_not_inherited(self, monkeypatch):
        monkeypatch.setenv("OPENKMS_LLM_MODEL_API_KEY", "secret")
        result = sandbox.run_python(
            "import os; print(os.environ.get('OPENKMS_LLM_MODEL_API_KEY', '-'))",
            kb_id="kb1", session_id="s1", settings={"enabled": True},
        )
        assert result.stdout.strip() == "-"

    def test_skills_of_the_kb_are_on_pythonpath_and_shared(self):
        from qa_agent import session_fs

        skills = session_fs.kb_skills_dir("kb1")
        (skills / "shared_skill.py").write_text("VALUE = 42\n")
        first = sandbox.run_python("import shared_skill; print(shared_skill.VALUE)", kb_id="kb1", session_id="s1",
                                   settings={"enabled": True})
        second = sandbox.run_python("import shared_skill; print(shared_skill.VALUE)", kb_id="kb1", session_id="s2",
                                    settings={"enabled": True})
        assert (first.stdout.strip(), second.stdout.strip()) == ("42", "42")

    def test_it_writes_an_artifact_into_the_session(self, sessions_root):
        result = sandbox.run_python(
            "import pathlib; pathlib.Path('out').mkdir(exist_ok=True); pathlib.Path('out/a.csv').write_text('a\\n1\\n')",
            kb_id="kb1", session_id="s1", settings={"enabled": True},
        )
        assert result.ok
        assert (Path(sessions_root) / "kb1" / "s1" / "out" / "a.csv").read_text() == "a\n1\n"

    def test_a_timeout_kills_the_process_group(self):
        started = time.monotonic()
        result = sandbox.run_python(
            "import time; time.sleep(30)", kb_id="kb1", session_id="s1",
            settings={"enabled": True, "timeout_seconds": 5},
        )
        assert result.timed_out is True
        assert time.monotonic() - started < 20

    def test_stdout_and_stderr_stay_apart(self):
        result = sandbox.run_python(
            "import sys; print('out'); print('err', file=sys.stderr)", kb_id="kb1", session_id="s1", settings={"enabled": True}
        )
        assert result.stdout.strip() == "out"
        assert result.stderr.strip() == "err"

    def test_empty_code_is_refused(self):
        with pytest.raises(sandbox.SandboxError, match="Nothing to run"):
            sandbox.run_python("  ", kb_id="kb1", session_id="s1", settings={"enabled": True})


class TestRunCommand:
    def test_an_allowed_command_runs(self):
        result = sandbox.run_command("echo hello", kb_id="kb1", session_id="s1", settings={"enabled": True})
        assert result.ok and result.stdout.strip() == "hello"

    def test_a_denied_command_never_starts(self):
        with pytest.raises(sandbox.CommandNotAllowed):
            sandbox.run_command("docker ps", kb_id="kb1", session_id="s1", settings={"enabled": True})

    def test_it_runs_in_the_session_folder(self):
        result = sandbox.run_command("pwd", kb_id="kb1", session_id="s1", settings={"enabled": True})
        assert str(Path(result.stdout.strip()).resolve()).endswith("/kb1/s1")
