"""A parameter that names the object is filled from the object, not asked of the caller."""

from __future__ import annotations

from app.services.ontology.builtin_action_service import object_param_map


def test_the_mapping_is_read_from_the_action_parameters():
    assert object_param_map({"object_params": {"adjustment_id": "id"}}) == {"adjustment_id": "id"}


def test_no_mapping_means_no_auto_fill():
    assert object_param_map(None) == {}
    assert object_param_map({"fields": ["a"]}) == {}
    assert object_param_map({"object_params": ["adjustment_id"]}) == {}


def test_submission_criteria_are_conditions_in_the_filter_grammar():
    from app.services.ontology.builtin_action_service import submission_criteria

    assert submission_criteria({"submission_criteria": ["status:eq:proposed"]}) == [
        "status:eq:proposed"
    ]
    assert submission_criteria({"submission_criteria": "status:eq:proposed"}) == []
    assert submission_criteria({"submission_criteria": [" ", ""]}) == []
    assert submission_criteria(None) == []
