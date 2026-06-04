"""Tests for signed public document fetch tokens."""

import time

from app.services.document_fetch_token import (
    build_document_fetch_token,
    build_public_document_fetch_url,
    redact_fetch_url_for_log,
    verify_document_fetch_token,
)


def test_build_and_verify_token_roundtrip():
    doc_id = "doc-1"
    file_hash = "a" * 64
    exp, sig = build_document_fetch_token(doc_id, file_hash, "pdf", ttl_seconds=600)
    assert verify_document_fetch_token(doc_id, file_hash, "pdf", exp=exp, sig=sig)


def test_verify_rejects_wrong_hash():
    exp, sig = build_document_fetch_token("doc-1", "a" * 64, "pdf", ttl_seconds=600)
    assert not verify_document_fetch_token("doc-1", "b" * 64, "pdf", exp=exp, sig=sig)


def test_verify_rejects_expired():
    past = int(time.time()) - 10
    _, sig = build_document_fetch_token("doc-1", "a" * 64, "pdf", exp_unix=past)
    assert not verify_document_fetch_token("doc-1", "a" * 64, "pdf", exp=past, sig=sig)


def test_build_public_url_contains_path_and_redaction():
    url, exp = build_public_document_fetch_url("doc-xyz", "c" * 64, "pdf", ttl_seconds=120)
    assert "/api/public/documents/doc-xyz/original.pdf" in url
    assert "exp=" in url and "sig=" in url
    assert exp > int(time.time())
    redacted = redact_fetch_url_for_log(url)
    assert "sig=<redacted>" in redacted
    assert "sig=" not in redacted.split("sig=")[1] or "<redacted>" in redacted
