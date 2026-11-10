"""The sandbox's guarantees are a docker command line, so most of them can be read without running anything."""
import os

import pytest

from qa_agent import sandbox


class TestConfig:
    def test_off_unless_enabled(self):
        assert sandbox.sandbox_config(None) == {"enabled": False}
        assert sandbox.sandbox_config({"sandbox": {}}) == {"enabled": False}
        assert sandbox.sandbox_config({"sandbox": {"enabled": True}})["enabled"] is True

    def test_ceilings_are_clamped_to_something_sane(self):
        conf = sandbox.sandbox_config(
            {"sandbox": {"enabled": True, "timeout_seconds": 99_999, "memory_mb": 1, "cpus": 99}}
        )
        assert "timeout_seconds" not in conf   # out of range → ignored, defaults apply
        assert "memory_mb" not in conf
        assert "cpus" not in conf

    def test_a_named_image_and_network_mode_are_taken(self):
        conf = sandbox.sandbox_config(
            {"sandbox": {"enabled": True, "image": "python:3.12-slim-bookworm", "network": "bridge"}}
        )
        assert conf["image"] == "python:3.12-slim-bookworm"
        assert conf["network"] == "bridge"


class TestCommand:
    def argv(self, **settings):
        conf = {"enabled": True, **settings}
        return sandbox._created_argv("/sessions/kb/s1", conf, "okms-sbx-test")

    def test_the_session_directory_is_the_only_mount(self):
        argv = self.argv()
        mounts = [argv[i + 1] for i, a in enumerate(argv) if a == "-v"]
        assert mounts == ["/sessions/kb/s1:/workspace:rw"]

    def test_no_credentials_are_passed(self):
        argv = self.argv()
        envs = [argv[i + 1] for i, a in enumerate(argv) if a == "-e"]
        assert envs == ["HOME=/tmp", "PYTHONUNBUFFERED=1"]
        assert not any("OPENKMS" in e for e in envs)

    def test_the_network_is_off_by_default(self):
        argv = self.argv()
        assert argv[argv.index("--network") + 1] == "none"

    def test_the_filesystem_is_read_only_except_the_mount(self):
        argv = self.argv()
        assert "--read-only" in argv
        assert "--tmpfs" in argv

    def test_capabilities_are_dropped_and_privileges_pinned(self):
        argv = self.argv()
        assert argv[argv.index("--cap-drop") + 1] == "ALL"
        assert "no-new-privileges" in argv[argv.index("--security-opt") + 1]
        assert argv[argv.index("--pids-limit") + 1] == "128"

    def test_it_runs_as_the_host_user_so_artifacts_are_readable(self):
        argv = self.argv()
        assert argv[argv.index("--user") + 1] == f"{os.getuid()}:{os.getgid()}"

    def test_the_container_is_detached_and_idles_between_runs(self):
        argv = self.argv()
        assert "--detach" in argv
        assert argv[-2:] == ["sleep", "infinity"]

    def test_an_execution_runs_inside_the_existing_container_with_its_own_timeout(self):
        argv = sandbox._exec_argv("okms-sbx-test", "print(1)", 45)
        assert argv[:3] == ["docker", "exec", "-w"]
        assert "okms-sbx-test" in argv
        assert "timeout" in argv and "45s" in argv

    def test_quotas_come_from_the_configuration(self):
        argv = self.argv(memory_mb=256, cpus=2)
        assert "256m" in argv
        assert argv[argv.index("--cpus") + 1] == "2"


class TestOutput:
    def test_long_output_is_truncated_not_swallowed(self):
        text = sandbox._truncate("x" * (sandbox.MAX_OUTPUT_BYTES + 100))
        assert text.endswith("…[truncated]")
        assert len(text.encode()) <= sandbox.MAX_OUTPUT_BYTES + 32

    def test_short_output_is_untouched(self):
        assert sandbox._truncate("hello") == "hello"


class TestFailurePaths:
    def test_empty_code_is_refused(self, tmp_path, monkeypatch):
        from qa_agent.config import settings

        monkeypatch.setattr(settings, "sessions_root", str(tmp_path), raising=False)
        with pytest.raises(sandbox.SandboxError, match="Nothing to run"):
            sandbox.run_python("   ", kb_id="kb", session_id="s", settings={"enabled": True})

    def test_a_timeout_reports_itself_and_leaves_the_container_alone(self, tmp_path, monkeypatch):
        import subprocess

        from qa_agent.config import settings

        monkeypatch.setattr(settings, "sessions_root", str(tmp_path), raising=False)
        calls: list[list[str]] = []

        def fake_run(argv, **kwargs):
            calls.append(list(argv))
            if argv[:2] == ["docker", "inspect"]:
                return type("R", (), {"returncode": 0, "stdout": "true\n", "stderr": ""})()
            raise subprocess.TimeoutExpired(argv, kwargs.get("timeout"))

        monkeypatch.setattr(sandbox.subprocess, "run", fake_run)
        result = sandbox.run_python("while True: pass", kb_id="kb", session_id="s", settings={"enabled": True, "timeout_seconds": 5})
        assert result.timed_out is True
        # The container is *not* removed: the next attempt reuses it, which is the point of one container per session.
        assert not any(c[:2] == ["docker", "rm"] for c in calls)

    def test_missing_docker_is_a_configuration_error(self, tmp_path, monkeypatch):
        from qa_agent.config import settings

        monkeypatch.setattr(settings, "sessions_root", str(tmp_path), raising=False)

        def boom(*a, **k):
            raise FileNotFoundError("docker")

        monkeypatch.setattr(sandbox.subprocess, "run", boom)
        with pytest.raises(sandbox.SandboxError, match="not available"):
            sandbox.run_python("print(1)", kb_id="kb", session_id="s", settings={"enabled": True})


#: Integration: needs docker and a python image. Skipped by default so the suite stays fast and offline; run with
#: `OPENKMS_QA_AGENT_SANDBOX_TEST=1 uv run pytest tests/test_sandbox.py -k live`.
@pytest.mark.skipif(
    os.environ.get("OPENKMS_QA_AGENT_SANDBOX_TEST") != "1" or not sandbox.docker_available(),
    reason="set OPENKMS_QA_AGENT_SANDBOX_TEST=1 with docker available",
)
class TestLiveContainer:
    def test_it_computes_writes_an_artifact_and_cannot_see_the_host(self, tmp_path, monkeypatch):
        from pathlib import Path

        from qa_agent.config import settings

        monkeypatch.setattr(settings, "sessions_root", str(tmp_path), raising=False)
        conf = {"enabled": True, "timeout_seconds": 30}

        ran = sandbox.run_python("print(sum(range(10)))", kb_id="kb", session_id="s", settings=conf)
        assert ran.ok and "45" in ran.stdout

        wrote = sandbox.run_python(
            "import pathlib; pathlib.Path('out').mkdir(exist_ok=True); "
            "pathlib.Path('out/x.csv').write_text('a\\n1\\n'); print('ok')",
            kb_id="kb", session_id="s", settings=conf,
        )
        assert wrote.ok
        assert (Path(tmp_path) / "kb" / "s" / "out" / "x.csv").read_text() == "a\n1\n"

        host_file = str(Path.cwd() / "pyproject.toml")
        peek = sandbox.run_python(f"print(open({host_file!r}).read()[:20])", kb_id="kb", session_id="s", settings=conf)
        assert not peek.ok, "the container must not read a host path"

        net = sandbox.run_python(
            "import urllib.request; urllib.request.urlopen('https://example.com', timeout=3)",
            kb_id="kb", session_id="s", settings=conf,
        )
        assert not net.ok, "the network is off"


class TestWhatPerSessionMeans:
    """A container per session buys startup and disk, not interpreter state — the distinction has to be written down."""

    def test_the_name_is_deterministic_so_a_session_finds_its_container(self):
        assert sandbox.container_name("kb", "s") == sandbox.container_name("kb", "s")
        assert sandbox.container_name("kb", "s") != sandbox.container_name("kb", "other")
        assert sandbox.container_name("kb", "s").startswith("okms-sbx-")

    def test_each_execution_is_a_fresh_interpreter(self):
        # `docker exec python -c` is a new process; the docstring says so, and this pins the command shape it refers to.
        argv = sandbox._exec_argv("okms-sbx-x", "print(1)", 30)
        assert argv[-3:] == ["-u", "-c", "print(1)"]
