"""Personal API key hashing and token shape."""

from __future__ import annotations

import os

import pytest

from app.api.auth import _hash_api_key_secret, _is_personal_api_key_token_format, _verify_api_key_secret


def test_api_key_secret_hash_roundtrip():
    secret = "segment-used-only-for-tests"
    h = _hash_api_key_secret(secret)
    assert _verify_api_key_secret(secret, h)
    assert not _verify_api_key_secret("other", h)


def test_personal_api_key_token_format():
    uid = "12345678-1234-5678-1234-567812345678"
    assert _is_personal_api_key_token_format(f"okms.{uid}.somesecret")
    assert not _is_personal_api_key_token_format("not-a-key")
    assert not _is_personal_api_key_token_format("okms.short.bad")


@pytest.mark.skipif(os.environ.get("OPENKMS_AUTH_MODE", "oidc") != "local", reason="requires local auth + DB")
def test_register_create_and_use_api_key(client):
    """End-to-end: JWT login path creates a key; Bearer okms.* reaches /api/auth/me."""
    import uuid

    u = uuid.uuid4().hex[:12]
    email = f"keytest-{u}@example.com"
    username = f"keyuser{u}"
    reg = client.post(
        "/api/auth/register",
        json={"email": email, "username": username, "password": "testpass123"},
    )
    assert reg.status_code == 200, reg.text
    jwt_token = reg.json()["access_token"]

    ck = client.post(
        "/api/auth/api-keys",
        headers={"Authorization": f"Bearer {jwt_token}"},
        json={"name": "pytest"},
    )
    assert ck.status_code == 200, ck.text
    body = ck.json()
    assert body["name"] == "pytest"
    assert body["token"].startswith("okms.")
    api_key = body["token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {api_key}"})
    assert me.status_code == 200, me.text
    assert me.json()["username"] == username

    lst = client.get("/api/auth/api-keys", headers={"Authorization": f"Bearer {jwt_token}"})
    assert lst.status_code == 200
    ids = {x["id"] for x in lst.json()}
    assert body["id"] in ids

    rv = client.delete(
        f"/api/auth/api-keys/{body['id']}",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    assert rv.status_code == 204

    me2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {api_key}"})
    assert me2.status_code == 401
