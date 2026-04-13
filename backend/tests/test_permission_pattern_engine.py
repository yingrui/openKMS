"""Tests for permission_pattern_engine."""

from app.models.security_permission import SecurityPermission
from app.services.permission_pattern_engine import (
    compile_rules_from_rows,
    frontend_path_matches_pattern,
    parse_backend_pattern,
    path_matches_segments,
    path_to_segments,
    resolve_required_permission_key,
    resolve_required_permission_keys,
)


def test_parse_backend_pattern_with_method():
    assert parse_backend_pattern("GET /api/documents") == ("GET", ["api", "documents"])
    assert parse_backend_pattern("post /api/foo/bar") == ("POST", ["api", "foo", "bar"])


def test_parse_backend_pattern_any_method():
    assert parse_backend_pattern("/api/x") == (None, ["api", "x"])


def test_path_matches_trailing_star():
    assert path_matches_segments(("api", "documents", "*"), ["api", "documents", "a", "b"])
    assert path_matches_segments(("api", "documents", "*"), ["api", "documents"])
    assert not path_matches_segments(("api", "documents", "*"), ["api", "other"])


def test_path_matches_param_segment():
    assert path_matches_segments(("api", "documents", "{id}", "markdown"), ["api", "documents", "uuid", "markdown"])
    assert not path_matches_segments(("api", "documents", "{id}"), ["api", "documents"])


def _row(key: str, label: str, be: list[str]) -> SecurityPermission:
    return SecurityPermission(
        id=key + "-id",
        key=key,
        label=label,
        description=None,
        frontend_route_patterns=[],
        backend_api_patterns=be,
        sort_order=0,
    )


def test_resolve_specificity_prefers_longer_literal():
    rows = [
        _row("all", "All", ["/*"]),
        _row("documents:read", "Docs read", ["GET /api/documents/*"]),
    ]
    rules = compile_rules_from_rows(rows)
    key = resolve_required_permission_key("GET", "/api/documents/abc", rules)
    assert key == "documents:read"


def test_resolve_method_matters():
    rows = [
        _row("r", "R", ["GET /api/x/*"]),
        _row("w", "W", ["POST /api/x/*"]),
    ]
    rules = compile_rules_from_rows(rows)
    assert resolve_required_permission_key("GET", "/api/x/1", rules) == "r"
    assert resolve_required_permission_key("POST", "/api/x/1", rules) == "w"


def test_resolve_keys_tie_returns_all_keys_at_best_tier():
    rows = [
        _row("console", "C", ["POST /api/object-types"]),
        _row("ontology", "O", ["POST /api/object-types"]),
    ]
    rules = compile_rules_from_rows(rows)
    keys = resolve_required_permission_keys("POST", "/api/object-types", rules)
    assert keys == frozenset({"console", "ontology"})


def test_frontend_glob():
    assert frontend_path_matches_pattern("/documents/channels/1", "/documents/*")
    assert frontend_path_matches_pattern("/documents", "/documents")
    assert not frontend_path_matches_pattern("/articles", "/documents/*")
    assert frontend_path_matches_pattern("/", "/")


def test_path_to_segments():
    assert path_to_segments("/api/foo") == ["api", "foo"]
