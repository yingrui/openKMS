"""Unit tests for ontology app A2UI synthesize / validate."""

import pytest

from app.services.ontology.ontology_app_a2ui import (
    ONTOLOGY_APP_A2UI_CATALOG_ID,
    normalize_resources,
    normalize_stored_a2ui_document,
    pack_a2ui_document,
    reject_legacy_board_bindings,
    resources_nonempty,
    synthesize_stub_a2ui_messages,
    validate_ontology_app_a2ui_messages,
)


def test_stub_a2ui_has_root():
    msgs = synthesize_stub_a2ui_messages(title="Hello")
    assert msgs[0]["createSurface"]["catalogId"] == ONTOLOGY_APP_A2UI_CATALOG_ID
    assert validate_ontology_app_a2ui_messages(msgs)


def test_normalize_resources():
    assert normalize_resources(
        {"objectTypes": ["WorkItem", "WorkItem"], "actions": ["createWorkItem"], "objectType": "x"}
    ) == {"objectTypes": ["WorkItem"], "actions": ["createWorkItem"]}
    assert resources_nonempty({"objectTypes": ["A"]})
    assert not resources_nonempty({})


def test_reject_legacy_board_bindings():
    with pytest.raises(ValueError, match="Legacy board"):
        reject_legacy_board_bindings(
            {
                "objectType": "Ticket",
                "columnProperty": "stage",
                "columns": ["open"],
                "cardTitleProperty": "summary",
            }
        )


def test_validate_rejects_kanban_board():
    msgs = synthesize_stub_a2ui_messages(title="T")
    bad = [
        m
        if "updateComponents" not in m
        else {
            **m,
            "updateComponents": {
                **m["updateComponents"],
                "components": [
                    *m["updateComponents"]["components"],
                    {"id": "board", "component": "OntoKanbanBoard", "objectType": "X"},
                ],
            },
        }
        for m in msgs
    ]
    with pytest.raises(ValueError, match="removed"):
        validate_ontology_app_a2ui_messages(bad)


def test_validate_action_must_be_in_resources():
    msgs = [
        {
            "version": "v0.9",
            "createSurface": {
                "surfaceId": "ontology-app",
                "catalogId": ONTOLOGY_APP_A2UI_CATALOG_ID,
            },
        },
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": "ontology-app",
                "components": [
                    {"id": "root", "component": "Column", "children": ["form"]},
                    {
                        "id": "form",
                        "component": "OntoActionForm",
                        "actionApiName": "createWorkItem",
                        "label": "Add",
                    },
                ],
            },
        },
    ]
    with pytest.raises(ValueError, match="createWorkItem"):
        validate_ontology_app_a2ui_messages(
            msgs,
            bindings={"objectTypes": ["WorkItem"], "actions": ["otherAction"]},
        )
    assert validate_ontology_app_a2ui_messages(
        msgs,
        bindings={"objectTypes": ["WorkItem"], "actions": ["createWorkItem"]},
    )


def test_pack_and_normalize_roundtrip():
    msgs = synthesize_stub_a2ui_messages(title="T")
    doc = pack_a2ui_document(msgs)
    assert normalize_stored_a2ui_document(doc) == msgs
