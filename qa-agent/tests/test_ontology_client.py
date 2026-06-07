from qa_agent.ontology_client import _to_neo4j_label, _to_neo4j_rel_type


def test_neo4j_label_preserves_pascal_case():
    assert _to_neo4j_label("InsuranceProduct") == "InsuranceProduct"
    assert _to_neo4j_label("Disease") == "Disease"


def test_neo4j_rel_type_preserves_case_not_uppercase():
    assert _to_neo4j_rel_type("covers") == "covers"
    assert _to_neo4j_rel_type("governed_by") == "governed_by"
    assert _to_neo4j_rel_type("GOVERNED_BY") == "GOVERNED_BY"


def test_neo4j_sanitize_special_chars():
    assert _to_neo4j_label("foo-bar") == "foo_bar"
    assert _to_neo4j_rel_type("foo-bar") == "foo_bar"
