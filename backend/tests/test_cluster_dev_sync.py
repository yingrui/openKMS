"""Unit tests for on-demand project → Pod tar packing / path rules."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.services.kubernetes.cluster_dev_sync import (
    MAX_PACKED_BYTES,
    pack_local_tree,
    should_exclude,
    validate_container_path,
)


def test_validate_container_path_ok():
    assert validate_container_path("/app/src") == "/app/src"
    assert validate_container_path("/app") == "/app"


@pytest.mark.parametrize(
    "bad",
    ["", "app/src", "/", "/app/../etc", "/app/foo/../bar"],
)
def test_validate_container_path_rejects(bad: str):
    with pytest.raises(ValueError):
        validate_container_path(bad)


def test_should_exclude_build_dirs():
    assert should_exclude(Path("node_modules/pkg/index.js"))
    assert should_exclude(Path("src/__pycache__/x.pyc"))
    assert should_exclude(Path(".git/config"))
    assert should_exclude(Path(".DS_Store"))
    assert not should_exclude(Path("src/main.py"))


def test_pack_local_tree_counts_and_excludes(tmp_path: Path):
    src = tmp_path / "src"
    src.mkdir()
    (src / "a.py").write_text("print(1)\n", encoding="utf-8")
    (src / "node_modules").mkdir()
    (src / "node_modules" / "x.js").write_text("x", encoding="utf-8")
    nested = src / "pkg"
    nested.mkdir()
    (nested / "b.py").write_text("b\n", encoding="utf-8")

    data, count = pack_local_tree(src)
    assert count == 2
    assert len(data) > 0
    assert isinstance(data, (bytes, bytearray))


def test_pack_local_tree_size_cap(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    src = tmp_path / "src"
    src.mkdir()
    (src / "big.bin").write_bytes(b"x" * 1000)
    monkeypatch.setattr(
        "app.services.kubernetes.cluster_dev_sync.MAX_PACKED_BYTES",
        100,
    )
    with pytest.raises(ValueError, match="exceed"):
        pack_local_tree(src, max_bytes=100)


def test_pack_missing_dir(tmp_path: Path):
    with pytest.raises(ValueError, match="does not exist"):
        pack_local_tree(tmp_path / "missing")


def test_max_packed_bytes_constant():
    assert MAX_PACKED_BYTES == 32 * 1024 * 1024
