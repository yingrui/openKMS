"""Feature toggle defaults."""

from app.services.feature_toggles import DEFAULTS


def test_defaults_include_agents_enabled() -> None:
    assert DEFAULTS["agents"] is True
    assert DEFAULTS["evaluations"] is False
    assert DEFAULTS["connectors"] is True
