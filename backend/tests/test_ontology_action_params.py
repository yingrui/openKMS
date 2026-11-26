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


def test_an_object_reference_names_a_type_and_how_it_is_identified():
    from app.services.ontology.builtin_action_service import object_ref_params

    assert object_ref_params(
        {"object_refs": {"product_code": {"type": "Product", "property": "code"}}}
    ) == {"product_code": {"type": "Product", "property": "code", "many": False}}
    # A bare type name is the common case: the reference is the object's key.
    assert object_ref_params({"object_refs": {"scenario": "AllocationScenario"}}) == {
        "scenario": {"type": "AllocationScenario", "property": None, "many": False}
    }


def test_a_reference_can_be_a_list_of_objects():
    from app.services.ontology.builtin_action_service import object_ref_params

    assert object_ref_params(
        {"object_refs": {"distributors": {"type": "Distributor", "property": "code", "many": True}}}
    ) == {"distributors": {"type": "Distributor", "property": "code", "many": True}}
    assert object_ref_params({"object_refs": {"x": {"property": "code"}}}) == {}
    assert object_ref_params({"fields": ["x"]}) == {}


def test_submission_permissions_are_required_keys():
    from app.services.ontology.builtin_action_service import submission_permissions

    assert submission_permissions({"submission_permissions": ["ontology:write"]}) == ["ontology:write"]
    assert submission_permissions({"submission_permissions": "ontology:write"}) == []
    assert submission_permissions({}) == []


def test_creating_an_object_is_not_a_per_object_action():
    from app.services.ontology.builtin_action_service import runs_per_object

    assert runs_per_object("object_modify", None) is True
    assert runs_per_object("object_delete", None) is True
    # Creating one assumption is one assumption, not one per ticked row.
    assert runs_per_object("object_create", None) is False
    # A function says so itself, by naming the object among its parameters.
    assert runs_per_object("function", {"object_params": {"adjustment_id": "id"}}) is True
    assert runs_per_object("function", {"fields": ["cycle"]}) is False


def test_an_inline_edit_names_the_property_and_its_parameter():
    from app.services.ontology.builtin_action_service import inline_edit_spec

    assert inline_edit_spec({"inline_edit": {"prop": "is_selected"}}) == {
        "prop": "is_selected",
        "param": "is_selected",
    }
    assert inline_edit_spec({"inline_edit": {"prop": "status", "param": "new_status"}}) == {
        "prop": "status",
        "param": "new_status",
    }
    assert inline_edit_spec({"inline_edit": {}}) is None
    assert inline_edit_spec(None) is None
