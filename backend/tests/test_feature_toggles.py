"""Feature toggle defaults and API schemas."""

from app.api.feature_toggles import FeatureTogglesResponse, FeatureTogglesUpdate
from app.services.feature_toggles import DEFAULTS


def test_defaults_include_all_console_toggles() -> None:
    assert DEFAULTS["agents"] is True
    assert DEFAULTS["evaluations"] is False
    assert DEFAULTS["connectors"] is True
    assert DEFAULTS["media"] is False


def test_feature_toggles_update_accepts_media() -> None:
    body = FeatureTogglesUpdate(media=True)
    assert body.model_dump(exclude_none=True) == {"media": True}


def test_feature_toggles_response_includes_media() -> None:
    response = FeatureTogglesResponse(
        evaluations=False,
        connectors=True,
        agents=True,
        media=True,
        hasNeo4jDataSource=False,
    )
    assert response.media is True
