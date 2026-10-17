"""Data-layer permission keys + pattern-engine resolution tests (pure)."""
from app.services.permissions.permission_catalog import (
    PERM_DATA_EDIT,
    PERM_DATA_READ,
    PERM_DATA_WRITE,
    PERM_INSIGHTS_READ,
    PERM_INSIGHTS_WRITE,
    OPERATION_KEY_HINTS,
)
from app.services.permissions.permission_default_patterns import default_patterns_for_key
from app.services.permissions.permission_pattern_engine import (
    compile_rules_from_rows,
    resolve_required_permission_keys,
)


class _Row:
    """Duck-typed security_permissions row."""

    def __init__(self, key: str, backend_api_patterns: list[str]) -> None:
        self.key = key
        self.backend_api_patterns = backend_api_patterns


def test_data_keys_are_in_the_catalog():
    keys = {h.key for h in OPERATION_KEY_HINTS}
    assert PERM_DATA_READ in keys
    assert PERM_DATA_WRITE in keys


def test_data_read_patterns_cover_the_spa_and_read_apis():
    fe, be = default_patterns_for_key(PERM_DATA_READ)
    for path in ("/datasets", "/datasets/*", "/data-model"):
        assert path in fe
    assert "GET /api/datasets" in be
    assert "GET /api/datasets/*" in be
    # Findings are their own grant: reading data does not read saved analyses.
    assert "/data-insights" not in fe
    assert not [p for p in be if "explorer-stories" in p]


def test_data_write_patterns_cover_writes():
    fe, be = default_patterns_for_key(PERM_DATA_WRITE)
    assert "/datasets" in fe
    for pattern in (
        "POST /api/datasets/*",
        "PUT /api/datasets/*",
        "DELETE /api/datasets/*",
        "POST /api/dataset-joins/*",
    ):
        assert pattern in be


def _rules(*keys: str):
    return compile_rules_from_rows(
        [_Row(key, default_patterns_for_key(key)[1]) for key in keys]
    )


def test_ingest_routes_are_covered_after_leaving_the_datasets_prefix():
    """`/api/dataset-ingests` is its own resource: the old `/api/datasets/*` wildcard misses it."""
    _, read = default_patterns_for_key(PERM_DATA_READ)
    assert "GET /api/dataset-ingests/*" in read
    _, write = default_patterns_for_key(PERM_DATA_WRITE)
    assert "POST /api/dataset-ingests" in write
    assert "POST /api/dataset-ingests/*" in write

    read_rules = _rules(PERM_DATA_READ)
    resolved = resolve_required_permission_keys("GET", "/api/dataset-ingests/i1", read_rules)
    assert resolved is not None and PERM_DATA_READ in resolved
    write_rules = _rules(PERM_DATA_WRITE)
    resolved_write = resolve_required_permission_keys("POST", "/api/dataset-ingests", write_rules)
    assert resolved_write is not None and PERM_DATA_WRITE in resolved_write


def test_browsing_rows_is_a_read_even_though_it_is_a_post():
    """`POST /api/datasets/*` is a write pattern; the rows query must win over it as a read.

    The middleware compiles every key's patterns into one list and keeps the most specific match,
    so a read-only user may browse a table while row edits still need the write/edit keys.
    """
    _, read = default_patterns_for_key(PERM_DATA_READ)
    assert "POST /api/datasets/*/rows/query" in read

    _, write = default_patterns_for_key(PERM_DATA_WRITE)
    _, edit = default_patterns_for_key(PERM_DATA_EDIT)
    all_rules = compile_rules_from_rows(
        [
            _Row(PERM_DATA_READ, read),
            _Row(PERM_DATA_WRITE, write),
            _Row(PERM_DATA_EDIT, edit),
        ]
    )

    query_keys = resolve_required_permission_keys("POST", "/api/datasets/d1/rows/query", all_rules)
    assert query_keys == frozenset({PERM_DATA_READ})

    summary_keys = resolve_required_permission_keys("POST", "/api/datasets/d1/aggregate", all_rules)
    assert summary_keys == frozenset({PERM_DATA_READ})

    apply_keys = resolve_required_permission_keys("POST", "/api/datasets/d1/rows/apply", all_rules)
    assert apply_keys is not None and PERM_DATA_EDIT in apply_keys


def test_engine_resolves_data_read_for_reads():
    rules = _rules(PERM_DATA_READ)
    required = resolve_required_permission_keys("GET", "/api/datasets/abc/rows", rules)
    assert required is not None and PERM_DATA_READ in required
    # Findings are not data: this rule may not resolve an explorer route at all.
    assert resolve_required_permission_keys("GET", "/api/stories", rules) is None


def test_engine_resolves_data_write_for_writes():
    rules = _rules(PERM_DATA_WRITE)
    required = resolve_required_permission_keys("POST", "/api/dataset-joins", rules)
    assert required is not None and PERM_DATA_WRITE in required
    required2 = resolve_required_permission_keys("DELETE", "/api/datasets/abc", rules)
    assert required2 is not None and PERM_DATA_WRITE in required2


def test_ontology_keys_do_not_cover_data_routes():
    """Data-layer routes/APIs belong to data:*, not ontology:* (no conflation)."""
    fe, be = default_patterns_for_key("ontology:read")
    assert "/datasets" not in fe
    assert not any(p.endswith(" /api/datasets") or p.endswith(" /api/datasets/*") for p in be)
    fe_w, _ = default_patterns_for_key("ontology:write")
    assert "/datasets" not in fe_w


def test_console_datasets_does_not_cover_data_app():
    fe, be = default_patterns_for_key("console:datasets")
    assert "/datasets" not in fe
    assert "/api/datasets/*" not in be


def test_insights_keys_are_in_the_catalog():
    keys = {h.key for h in OPERATION_KEY_HINTS}
    assert PERM_INSIGHTS_READ in keys
    assert PERM_INSIGHTS_WRITE in keys


def test_insights_read_patterns_own_the_app_the_reads_and_the_refresh():
    fe, be = default_patterns_for_key(PERM_INSIGHTS_READ)
    assert "/data-insights" in fe and "/data-insights/*" in fe
    for pattern in (
        "GET /api/stories",
        "GET /api/stories/*",
        "HEAD /api/stories/*",
        # A refresh recomputes the finding from its source — a read, not an edit.
        "POST /api/stories/*/run",
    ):
        assert pattern in be


def test_insights_write_patterns_own_the_edits_but_not_the_run():
    _, be = default_patterns_for_key(PERM_INSIGHTS_WRITE)
    for pattern in (
        "POST /api/stories",
        "PUT /api/stories/*",
        "PATCH /api/stories/*",
        "DELETE /api/stories/*",
    ):
        assert pattern in be
    assert "POST /api/stories/*/run" not in be


def test_engine_separates_data_access_from_analysis_access():
    rules = _rules(PERM_DATA_READ, PERM_DATA_WRITE, PERM_INSIGHTS_READ, PERM_INSIGHTS_WRITE)
    for method, path, key in (
        ("GET", "/api/stories", PERM_INSIGHTS_READ),
        ("GET", "/api/stories/r1", PERM_INSIGHTS_READ),
        ("POST", "/api/stories/r1/run", PERM_INSIGHTS_READ),
        ("POST", "/api/stories", PERM_INSIGHTS_WRITE),
        ("PUT", "/api/stories/r1", PERM_INSIGHTS_WRITE),
        ("DELETE", "/api/stories/r1", PERM_INSIGHTS_WRITE),
    ):
        assert resolve_required_permission_keys(method, path, rules) == frozenset({key})
    # ... while the data layer keeps its own routes.
    assert resolve_required_permission_keys("GET", "/api/datasets", rules) == frozenset({PERM_DATA_READ})
