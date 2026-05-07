"""Global search API helpers and smoke checks."""

from __future__ import annotations

from app.services.global_search import allowed_types_from_permissions, parse_types_param
from app.services.permission_catalog import (
    PERM_ALL,
    PERM_ARTICLES_READ,
    PERM_DOCUMENTS_READ,
    PERM_KB_READ,
    PERM_WIKIS_READ,
)
from app.services.permission_pattern_engine import compile_rules_from_rows, resolve_required_permission_keys
from app.models.security_permission import SecurityPermission


def test_parse_types_all():
    assert parse_types_param(None) == {"documents", "articles", "wiki_spaces", "knowledge_bases"}
    assert parse_types_param("ALL") == {"documents", "articles", "wiki_spaces", "knowledge_bases"}


def test_parse_types_comma():
    assert parse_types_param("documents, articles") == {"documents", "articles"}
    assert parse_types_param("wiki_spaces") == {"wiki_spaces"}


def test_parse_types_invalid_tokens_ignored():
    assert parse_types_param("documents, bogus") == {"documents"}


def test_allowed_types_all_perm():
    assert allowed_types_from_permissions(frozenset({PERM_ALL})) == {
        "documents",
        "articles",
        "wiki_spaces",
        "knowledge_bases",
    }


def test_allowed_types_granular():
    assert allowed_types_from_permissions(frozenset({PERM_DOCUMENTS_READ, PERM_WIKIS_READ})) == {
        "documents",
        "wiki_spaces",
    }


def test_allowed_types_empty():
    assert allowed_types_from_permissions(frozenset()) == set()


def test_resolve_api_search_path_union():
    """GET /api/search is tied to four read keys at the same specificity (strict mode: any one grants access)."""

    def row(key: str, fe: list[str], be: list[str]) -> SecurityPermission:
        return SecurityPermission(
            id=key + "-id",
            key=key,
            label=key,
            description=None,
            frontend_route_patterns=fe,
            backend_api_patterns=be,
            sort_order=0,
        )

    rows = [
        row(PERM_DOCUMENTS_READ, [], ["GET /api/search"]),
        row(PERM_ARTICLES_READ, [], ["GET /api/search"]),
        row(PERM_WIKIS_READ, [], ["GET /api/search"]),
        row(PERM_KB_READ, [], ["GET /api/search"]),
    ]
    rules = compile_rules_from_rows(rows)
    keys = resolve_required_permission_keys("GET", "/api/search", rules)
    assert keys == frozenset(
        {PERM_DOCUMENTS_READ, PERM_ARTICLES_READ, PERM_WIKIS_READ, PERM_KB_READ}
    )


def test_api_search_requires_auth(client):
    r = client.get("/api/search")
    assert r.status_code == 401
