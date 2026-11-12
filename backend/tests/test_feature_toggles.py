"""Feature toggle defaults, API schemas, and guards."""

import pytest
from fastapi import HTTPException

from app.api.feature_toggles import FeatureTogglesResponse, FeatureTogglesUpdate
from app.services.platform.feature_toggles import DEFAULTS


def test_defaults_include_all_console_toggles() -> None:
    assert DEFAULTS["agents"] is True
    assert DEFAULTS["evaluations"] is False
    assert DEFAULTS["connectors"] is True
    assert DEFAULTS["media"] is False
    assert DEFAULTS["knowledge_map"] is True


def test_feature_toggles_update_accepts_media() -> None:
    body = FeatureTogglesUpdate(media=True)
    assert body.model_dump(exclude_none=True) == {"media": True}


def test_feature_toggles_update_accepts_knowledge_map() -> None:
    body = FeatureTogglesUpdate(knowledge_map=False)
    assert body.model_dump(exclude_none=True) == {"knowledge_map": False}


def test_feature_toggles_response_includes_media() -> None:
    response = FeatureTogglesResponse(
        evaluations=False,
        connectors=True,
        agents=True,
        media=True,
        knowledge_map=False,
        hasNeo4jDataSource=False,
    )
    assert response.media is True
    assert response.knowledge_map is False


@pytest.mark.asyncio
async def test_knowledge_map_guard_returns_404_when_disabled(monkeypatch):
    from app.services.platform import feature_toggles

    async def disabled(_db, _key):
        return False

    monkeypatch.setattr(feature_toggles, "is_feature_enabled", disabled)
    with pytest.raises(HTTPException) as exc:
        await feature_toggles.require_knowledge_map_feature(db=None)
    assert exc.value.status_code == 404
