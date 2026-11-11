"""Auth-session security helpers."""

from __future__ import annotations


def test_return_to_rejects_open_redirects():
    from app.api.auth import _safe_return_to

    assert _safe_return_to("/chamber?x=1") == "/chamber?x=1"
    assert _safe_return_to("//evil.example") == "/"
    assert _safe_return_to("https://evil.example") == "/"
    assert _safe_return_to("\\\\evil.example") == "/"
    assert _safe_return_to("") == "/"
