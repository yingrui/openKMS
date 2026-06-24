"""S3 keys for content-addressed documents: documents/{file_hash}/..."""

from __future__ import annotations

import re

from app.services.storage import object_exists

_DOCUMENT_PREFIX = "documents"
_FILE_HASH_RE = re.compile(r"^[a-f0-9]{64}$")
_LEGACY_DOCUMENT_HASH_PREFIX_RE = re.compile(r"^[a-f0-9]{64}/$")


def validate_file_hash(file_hash: str) -> str:
    h = (file_hash or "").strip().lower()
    if not _FILE_HASH_RE.fullmatch(h):
        raise ValueError("Invalid file_hash")
    return h


def is_legacy_document_hash_prefix(prefix: str) -> bool:
    return bool(_LEGACY_DOCUMENT_HASH_PREFIX_RE.fullmatch(prefix))


def document_prefix(file_hash: str) -> str:
    return f"{_DOCUMENT_PREFIX}/{validate_file_hash(file_hash)}"


def document_object_key(file_hash: str, relative_path: str) -> str:
    rel = relative_path.lstrip("/")
    if not rel or ".." in rel:
        raise ValueError("Invalid path")
    return f"{document_prefix(file_hash)}/{rel}"


def legacy_document_prefix(file_hash: str) -> str:
    return validate_file_hash(file_hash)


def legacy_document_object_key(file_hash: str, relative_path: str) -> str:
    rel = relative_path.lstrip("/")
    if not rel or ".." in rel:
        raise ValueError("Invalid path")
    return f"{validate_file_hash(file_hash)}/{rel}"


def normalize_logical_document_path(file_hash: str, path: str) -> str:
    """Return path relative to the document bundle (strip logical hash prefix if present)."""
    p = path.lstrip("/")
    if ".." in p:
        raise ValueError("Invalid path")
    hash_prefix = validate_file_hash(file_hash) + "/"
    if p.lower().startswith(hash_prefix.lower()):
        return p[len(hash_prefix) :]
    doc_prefix = f"{_DOCUMENT_PREFIX}/{validate_file_hash(file_hash)}/"
    if p.lower().startswith(doc_prefix.lower()):
        return p[len(doc_prefix) :]
    return p


def resolve_document_object_key(file_hash: str, path: str) -> str | None:
    """Prefer documents/{hash}/…; fall back to legacy {hash}/…"""
    try:
        rel = normalize_logical_document_path(file_hash, path)
    except ValueError:
        return None
    if not rel:
        return None
    new_key = document_object_key(file_hash, rel)
    if object_exists(new_key):
        return new_key
    old_key = legacy_document_object_key(file_hash, rel)
    if object_exists(old_key):
        return old_key
    return None


def get_document_object(file_hash: str, path: str) -> bytes:
    from app.services.storage import get_object

    key = resolve_document_object_key(file_hash, path)
    if not key:
        raise FileNotFoundError(path)
    return get_object(key)
