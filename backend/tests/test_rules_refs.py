"""Rule → metric references: a projection with two consumers (coverage, delete guard)."""
from app.services.ontology.rules.refs import referenced_metrics


def test_identity_contributes_target_and_members():
    refs = referenced_metrics(
        {
            "subject": {"kind": "metric", "ref": "m-gap"},
            "relation": {
                "target": {"metric": "m-gap"},
                "members": [{"metric": "m-demand"}, {"metric": "m-alloc", "weight": -1}],
            },
        }
    )
    # One row per metric; `m-gap` appears as subject and as target, and is recorded once.
    assert refs == [("m-gap", "subject"), ("m-demand", "member"), ("m-alloc", "member")]


def test_flat_and_conditions_and_ratios_are_walked():
    refs = referenced_metrics(
        {
            "condition": {
                "all": [
                    {"left": {"ratio": [{"metric": "a"}, {"metric": "b"}]}, "op": ">", "right": {"value": 1}},
                    {"left": {"metric": "c"}, "op": ">", "right": {"value": 0}},
                ]
            }
        }
    )
    assert refs == [("a", "condition"), ("b", "condition"), ("c", "condition")]


def test_dataset_subjects_do_not_contribute_metric_refs():
    refs = referenced_metrics(
        {
            "subject": {"kind": "dataset", "ref": "ds-1"},
            "condition": {
                "left": {"dataset_agg": {"dataset_id": "ds-1", "fn": "count"}},
                "op": "!=",
                "right": {"value": 1620},
            },
        }
    )
    assert refs == []


def test_duplicates_collapse_with_the_first_role():
    refs = referenced_metrics(
        {
            "subject": {"kind": "metric", "ref": "m"},
            "condition": {"left": {"metric": "m"}, "op": ">", "right": {"value": 0}},
        }
    )
    assert refs == [("m", "subject")]
