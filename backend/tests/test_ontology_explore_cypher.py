"""Read-only Cypher gate for POST /api/ontology/explore (see ontology_explore.validate_ontology_explore_cypher)."""

import pytest

from app.api.ontology_explore import validate_ontology_explore_cypher


@pytest.mark.parametrize(
    "cypher,expect_ok",
    [
        ("MATCH (n) RETURN n LIMIT 1", True),
        ("  match (n) return n  ", True),
        ("", False),
        ("   ", False),
    ],
)
def test_validate_accepts_match_return(cypher, expect_ok):
    ok, err = validate_ontology_explore_cypher(cypher)
    assert ok is expect_ok
    if not expect_ok:
        assert err == "Cypher query is required"


@pytest.mark.parametrize(
    "keyword",
    ["CREATE", "MERGE", "DELETE", "SET", "REMOVE", "DETACH", "DROP", "create", "merge"],
)
def test_validate_blocks_write_keywords(keyword):
    ok, err = validate_ontology_explore_cypher(f"MATCH (n) {keyword} (m) RETURN n")
    assert ok is False
    assert "Write operations" in (err or "")


def test_validate_blocks_call():
    ok, err = validate_ontology_explore_cypher("CALL db.labels() YIELD label RETURN label")
    assert ok is False
    assert "CALL" in (err or "")


@pytest.mark.parametrize(
    "snippet,needle",
    [
        ("RETURN apoc.meta.data()", "apoc"),
        ("RETURN dbms.procedures()", "dbms"),
        ("MATCH (n) RETURN n /* apoc.path */", "apoc"),
    ],
)
def test_validate_blocks_apoc_dbms(snippet, needle):
    ok, err = validate_ontology_explore_cypher(snippet)
    assert ok is False
    assert needle.lower() in (err or "").lower()


def test_validate_requires_return():
    ok, err = validate_ontology_explore_cypher("MATCH (n) WHERE n.name = 'x'")
    assert ok is False
    assert "RETURN" in (err or "")
