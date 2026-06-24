"""Category filter for security permission list API."""

from app.api.admin import security_permissions as mod
from app.services.permissions.permission_catalog import (
    PERM_ALL,
    PERM_ARTICLES_READ,
    PERM_CONSOLE_ACCESS,
    PERM_PROJECTS_READ,
    OPERATION_KEY_HINTS,
)


def test_hint_keys_for_category_agents():
    keys = mod._hint_keys_for_category("agents")
    assert PERM_PROJECTS_READ in keys
    assert PERM_CONSOLE_ACCESS not in keys


def test_hint_keys_for_category_content():
    keys = mod._hint_keys_for_category("content")
    assert PERM_ARTICLES_READ in keys
    assert PERM_PROJECTS_READ not in keys


def test_hint_keys_for_category_core():
    keys = mod._hint_keys_for_category("core")
    assert keys == [PERM_ALL]


def test_every_hint_category_has_keys():
    categories = {h.category for h in OPERATION_KEY_HINTS}
    for cat in categories:
        assert mod._hint_keys_for_category(cat)
