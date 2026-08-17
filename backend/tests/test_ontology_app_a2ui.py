"""Unit tests for ontology app A2UI synthesize / validate."""

import pytest

from app.services.ontology.ontology_app_a2ui import (
    ONTOLOGY_APP_A2UI_CATALOG_ID,
    normalize_stored_a2ui_document,
    pack_a2ui_document,
    synthesize_status_board_a2ui_messages,
    validate_ontology_app_a2ui_messages,
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
    assert msgs[0]["createSurface"]["catalogId"] == ONTOLOGY_APP_A2UI_CATALOG_ID
    comps = msgs[1]["updateComponents"]["components"]
    board = next(c for c in comps if c["id"] == "board")
    assert board["component"] == "OntoKanbanBoard"
    assert board["objectType"] == "Ticket"
    assert board["columns"] == "open,closed"
    assert board["createAction"] == "createTicket"
    assert board["setStatusAction"] == "setTicketStage"


def test_synthesize_requires_user_bindings():
    with pytest.raises(ValueError, match="objectType"):
        synthesize_status_board_a2ui_messages({}, title="T")
    with pytest.raises(ValueError, match="columns"):
        synthesize_status_board_a2ui_messages(
            {"objectType": "Ticket", "columnProperty": "stage", "cardTitleProperty": "summary"},
            title="T",
        )


def test_pack_and_normalize_roundtrip():
    msgs = synthesize_status_board_a2ui_messages(
        {
            "objectType": "Ticket",
            "columnProperty": "stage",
            "columns": ["open"],
            "cardTitleProperty": "summary",
        },
        title="T",
    )
    doc = pack_a2ui_document(msgs)
    assert normalize_stored_a2ui_document(doc) == msgs
    assert normalize_stored_a2ui_document({"format": "other"}) is None


def test_validate_requires_root():
    msgs = synthesize_status_board_a2ui_messages(
        {
            "objectType": "Ticket",
            "columnProperty": "stage",
            "columns": ["open"],
            "cardTitleProperty": "summary",
        },
        title="T",
    )
    assert validate_ontology_app_a2ui_messages(msgs) == msgs
    with pytest.raises(ValueError):
        validate_ontology_app_a2ui_messages([{"version": "v0.9", "createSurface": {"surfaceId": "x"}}])
