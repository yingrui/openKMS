"""Unit tests for ontology app A2UI synthesize / validate."""

import pytest

from app.services.ontology.ontology_app_a2ui import (
    ONTOLOGY_APP_A2UI_CATALOG_ID,
    bindings_board_ready,
    normalize_stored_a2ui_document,
    pack_a2ui_document,
    synthesize_status_board_a2ui_messages,
    synthesize_stub_a2ui_messages,
    validate_ontology_app_a2ui_messages,
)


def test_stub_a2ui_has_root():
    msgs = synthesize_stub_a2ui_messages(title="Hello")
    assert msgs[0]["createSurface"]["catalogId"] == ONTOLOGY_APP_A2UI_CATALOG_ID
    assert validate_ontology_app_a2ui_messages(msgs)


def test_bindings_board_ready():
    assert not bindings_board_ready({})
    assert bindings_board_ready(
        {
            "objectType": "Ticket",
            "columnProperty": "stage",
            "columns": ["open"],
            "cardTitleProperty": "summary",
        }
    )


def test_synthesize_status_board_includes_board_bindings():
    msgs = synthesize_status_board_a2ui_messages(
        {
            "objectType": "Ticket",
            "columnProperty": "stage",
            "columns": ["open", "closed"],
            "cardTitleProperty": "summary",
            "createAction": "createTicket",
            "setStatusAction": "setTicketStage",
        },
        title="My Board",
    )
    assert len(msgs) == 2
    comps = msgs[1]["updateComponents"]["components"]
    board = next(c for c in comps if c["id"] == "board")
    assert board["component"] == "OntoKanbanBoard"
    assert board["objectType"] == "Ticket"
    assert board["createAction"] == "createTicket"


def test_synthesize_requires_user_bindings():
    with pytest.raises(ValueError, match="objectType"):
        synthesize_status_board_a2ui_messages({}, title="T")


def test_validate_board_against_bindings():
    msgs = synthesize_status_board_a2ui_messages(
        {
            "objectType": "Ticket",
            "columnProperty": "stage",
            "columns": ["open"],
            "cardTitleProperty": "summary",
            "createAction": "createTicket",
        },
        title="T",
    )
    bad = [m if "updateComponents" not in m else {
        **m,
        "updateComponents": {
            **m["updateComponents"],
            "components": [
                c if c.get("id") != "board" else {**c, "createAction": "otherAction"}
                for c in m["updateComponents"]["components"]
            ],
        },
    } for m in msgs]
    with pytest.raises(ValueError, match="createAction"):
        validate_ontology_app_a2ui_messages(
            bad,
            bindings={
                "objectType": "Ticket",
                "columnProperty": "stage",
                "columns": ["open"],
                "cardTitleProperty": "summary",
                "createAction": "createTicket",
            },
        )


def test_pack_and_normalize_roundtrip():
    msgs = synthesize_stub_a2ui_messages(title="T")
    doc = pack_a2ui_document(msgs)
    assert normalize_stored_a2ui_document(doc) == msgs
