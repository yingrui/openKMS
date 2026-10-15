"""Data-layer permission keys + pattern-engine resolution tests (pure)."""
from app.services.permissions.permission_catalog import (
    PERM_DATA_READ,
    PERM_DATA_WRITE,
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
    for path in ("/datasets", "/datasets/*", "/data-model", "/data-explorer"):
        assert path in fe
    assert "GET /api/datasets" in be
    assert "GET /api/datasets/*" in be
    assert "GET /api/explorer-reports" in be


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


def _rules(key: str):
    _, be = default_patterns_for_key(key)
    return compile_rules_from_rows([_Row(key, be)])


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


def test_engine_resolves_data_read_for_reads():
    rules = _rules(PERM_DATA_READ)
    required = resolve_required_permission_keys("GET", "/api/datasets/abc/rows", rules)
    assert required is not None and PERM_DATA_READ in required
    required2 = resolve_required_permission_keys("GET", "/api/explorer-reports", rules)
    assert required2 is not None and PERM_DATA_READ in required2


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
