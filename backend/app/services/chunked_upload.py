"""Generic chunked upload: store chunks to temp dir, reassemble when complete.

Session identifier: any opaque string (e.g. upload ID, document ID).
Chunks written under $TMPDIR/openkms-chunks/{session_id}/chunk_{NNNNNN}.
"""

from __future__ import annotations

import os
import shutil
import tempfile


def _chunk_dir(session_id: str) -> str:
    return os.path.join(tempfile.gettempdir(), "openkms-chunks", session_id)


def store_chunk(session_id: str, chunk_index: int, data: bytes) -> str:
    """Write a single chunk. Returns path written."""
    os.makedirs(_chunk_dir(session_id), exist_ok=True)
    chunk_path = os.path.join(_chunk_dir(session_id), f"chunk_{chunk_index:06d}")
    with open(chunk_path, "wb") as f:
        f.write(data)
    return chunk_path


def chunk_count(session_id: str) -> int:
    """How many chunks have been stored for this session."""
    d = _chunk_dir(session_id)
    if not os.path.isdir(d):
        return 0
    return sum(1 for f in os.listdir(d) if f.startswith("chunk_"))


def reassemble(session_id: str, total_chunks: int) -> bytes:
    """Reassemble all chunks in order. Returns raw bytes. Raises if any chunk missing."""
    d = _chunk_dir(session_id)
    raw = bytearray()
    for i in range(total_chunks):
        cp = os.path.join(d, f"chunk_{i:06d}")
        if not os.path.exists(cp):
            raise FileNotFoundError(f"Missing chunk {i}")
        with open(cp, "rb") as f:
            raw.extend(f.read())
    return bytes(raw)


def cleanup(session_id: str) -> None:
    """Remove all chunks for this session."""
    shutil.rmtree(_chunk_dir(session_id), ignore_errors=True)
