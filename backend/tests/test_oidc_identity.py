"""OIDC identity directory (login upsert, sub → display name)."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

from app.services import oidc_identity_service as svc
from app.services import resource_acl_service as acl_svc


def test_should_upsert_skips_api_key_and_local_cli(monkeypatch):
    monkeypatch.setattr(svc.settings, "auth_mode", "oidc")
    assert svc.should_upsert_oidc_identity({"sub": "u1", "preferred_username": "bob"}) is True
    assert svc.should_upsert_oidc_identity({"sub": "local-cli"}) is False
    assert svc.should_upsert_oidc_identity({"sub": "u1", "openkms_auth_via": "api_key"}) is False
    monkeypatch.setattr(svc.settings, "auth_mode", "local")
    assert svc.should_upsert_oidc_identity({"sub": "u1"}) is False


def test_upsert_oidc_identity_inserts_and_updates(monkeypatch):
    def _make_row(**kwargs):
        row = MagicMock()
        for key, val in kwargs.items():
            setattr(row, key, val)
        return row

    monkeypatch.setattr("app.services.oidc_identity_service.OidcIdentity", _make_row)
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    async def _run():
        await svc.upsert_oidc_identity_from_jwt(
            db,
            {
                "sub": "11dcdd51-b251-4a69-9288-05ab2952be38",
                "preferred_username": "bob",
                "email": "bob@example.com",
                "name": "Bob User",
            },
        )
        assert db.add.called
        row = db.add.call_args[0][0]
        assert row.sub.endswith("be38")
        assert row.preferred_username == "bob"

        existing = MagicMock()
        existing.preferred_username = "old"
        db.get = AsyncMock(return_value=existing)
        db.add.reset_mock()
        await svc.upsert_oidc_identity_from_jwt(
            db,
            {"sub": "11dcdd51-b251-4a69-9288-05ab2952be38", "preferred_username": "bob2"},
        )
        assert not db.add.called
        assert existing.preferred_username == "bob2"

    asyncio.run(_run())


def test_resolve_subject_display_uses_oidc_directory(monkeypatch):
    from app.config import settings

    oidc_sub = "11dcdd51-b251-4a69-9288-05ab2952be38"
    db = AsyncMock()

    async def fake_label(_db, sub):
        return "bob" if sub == oidc_sub else None

    monkeypatch.setattr(settings, "auth_mode", "oidc")
    monkeypatch.setattr(
        "app.services.oidc_identity_service.display_label_for_oidc_sub",
        fake_label,
    )

    async def _run():
        label = await acl_svc.resolve_subject_display(db, oidc_sub)
        assert label == "bob"

    asyncio.run(_run())


def test_lookup_oidc_sub_by_alias(monkeypatch):
    oidc_sub = "11dcdd51-b251-4a69-9288-05ab2952be38"
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = oidc_sub
    db.execute = AsyncMock(return_value=result)

    monkeypatch.setattr(svc.settings, "auth_mode", "oidc")

    async def _run():
        out = await svc.lookup_oidc_sub_by_alias(db, "bob")
        assert out == oidc_sub

    asyncio.run(_run())
