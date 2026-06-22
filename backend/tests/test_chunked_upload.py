"""Tests for chunked_upload service."""
import os
import tempfile
from uuid import uuid4

import pytest

from app.services.chunked_upload import chunk_count, cleanup, reassemble, store_chunk


@pytest.fixture
def session_id():
    sid = f"test-{uuid4().hex[:8]}"
    yield sid
    cleanup(sid)


def test_store_chunk_writes_file(session_id):
    data = b"hello chunk"
    path = store_chunk(session_id, 0, data)
    assert os.path.exists(path)
    with open(path, "rb") as f:
        assert f.read() == data


def test_chunk_count_zero_for_new_session(session_id):
    assert chunk_count(session_id) == 0


def test_chunk_count_matches_stored(session_id):
    store_chunk(session_id, 0, b"a")
    store_chunk(session_id, 1, b"b")
    store_chunk(session_id, 2, b"c")
    assert chunk_count(session_id) == 3


def test_reassemble_combines_in_order(session_id):
    chunks = [b"aaa", b"bbb", b"ccc"]
    for i, c in enumerate(chunks):
        store_chunk(session_id, i, c)
    assert reassemble(session_id, len(chunks)) == b"aaabbbccc"


def test_reassemble_raises_on_missing_chunk(session_id):
    store_chunk(session_id, 0, b"first")
    store_chunk(session_id, 2, b"third")
    with pytest.raises(FileNotFoundError, match="Missing chunk 1"):
        reassemble(session_id, 3)


def test_cleanup_removes_all(session_id):
    store_chunk(session_id, 0, b"a")
    store_chunk(session_id, 1, b"b")
    cleanup(session_id)
    assert chunk_count(session_id) == 0
    d = os.path.join(tempfile.gettempdir(), "openkms-chunks", session_id)
    assert not os.path.exists(d)


def test_store_chunk_overwrites(session_id):
    store_chunk(session_id, 0, b"old")
    store_chunk(session_id, 0, b"new")
    assert reassemble(session_id, 1) == b"new"
