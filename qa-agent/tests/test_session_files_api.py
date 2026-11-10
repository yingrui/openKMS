"""The session's files, reachable: what a conversation produced and what it was given."""
import pytest
from fastapi.testclient import TestClient

from qa_agent import session_fs


@pytest.fixture
def client(tmp_path, monkeypatch):
    from qa_agent.config import settings
    from qa_agent.main import app

    monkeypatch.setattr(settings, "sessions_root", str(tmp_path), raising=False)
    monkeypatch.setattr(settings, "session_disk_mb", 0, raising=False)
    monkeypatch.setattr(settings, "session_upload_max_mb", 0, raising=False)
    return TestClient(app)


class TestList:
    def test_a_session_with_no_directory_is_empty_not_an_error(self, client):
        r = client.get("/knowledge-bases/kb1/sessions/s1/files")
        assert r.status_code == 200
        assert r.json()["files"] == []

    def test_files_in_subdirectories_are_listed(self, client):
        session_fs.write_file("kb1", "s1", "out/a.csv", "a,b\n1,2\n")
        session_fs.write_file("kb1", "s1", "uploads/in.txt", "x")
        files = client.get("/knowledge-bases/kb1/sessions/s1/files").json()["files"]
        assert sorted(f["path"] for f in files) == ["out/a.csv", "uploads/in.txt"]
        assert all(f["size"] is not None for f in files)

    def test_another_session_sees_nothing(self, client):
        session_fs.write_file("kb1", "s1", "out/a.csv", "x")
        assert client.get("/knowledge-bases/kb1/sessions/s2/files").json()["files"] == []

    def test_a_bad_session_id_is_refused(self, client):
        assert client.get("/knowledge-bases/kb1/sessions/../files").status_code in (400, 404)


class TestDownload:
    def test_the_bytes_come_back_with_the_name(self, client):
        session_fs.write_file("kb1", "s1", "out/a.csv", "industry,count\n半导体,1203\n")
        r = client.get("/knowledge-bases/kb1/sessions/s1/files/download", params={"path": "out/a.csv"})
        assert r.status_code == 200
        assert r.text == "industry,count\n半导体,1203\n"
        assert "a.csv" in r.headers.get("content-disposition", "")

    def test_traversal_is_refused(self, client):
        session_fs.write_file("kb1", "s2", "out/secret.txt", "s2 only")
        r = client.get("/knowledge-bases/kb1/sessions/s1/files/download", params={"path": "../s2/out/secret.txt"})
        assert r.status_code == 400

    def test_a_missing_file_is_404(self, client):
        assert (
            client.get("/knowledge-bases/kb1/sessions/s1/files/download", params={"path": "out/nope.csv"}).status_code
            == 404
        )
