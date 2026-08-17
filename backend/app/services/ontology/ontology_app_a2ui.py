"""Synthesize / validate A2UI for Ontology Apps (status board template)."""

from __future__ import annotations

from typing import Any

ONTOLOGY_APP_A2UI_CATALOG_ID = "https://openkms.local/a2ui/catalogs/ontology-app/v1.json"
ONTOLOGY_APP_A2UI_SURFACE_ID = "ontology-app"
A2UI_VERSION = "v0.9"
A2UI_DOC_FORMAT = "a2ui_v0_9"


def pack_a2ui_document(messages: list[dict[str, Any]]) -> dict[str, Any]:
    return {"format": A2UI_DOC_FORMAT, "messages": messages}


def normalize_stored_a2ui_document(raw: Any) -> list[dict[str, Any]] | None:
    if not isinstance(raw, dict):
        return None
    if raw.get("format") != A2UI_DOC_FORMAT:
        return None
    messages = raw.get("messages")
    if not isinstance(messages, list):
        return None
    return [m for m in messages if isinstance(m, dict)]


def synthesize_status_board_a2ui_messages(
    bindings: dict[str, Any],
    *,
    title: str,
    subtitle: str | None = None,
) -> list[dict[str, Any]]:
    """Status-board surface: title + OntoKanbanBoard wired to user-supplied bindings."""
    object_type = str(bindings.get("objectType") or "").strip()
    if not object_type:
        raise ValueError("bindings.objectType is required")

    columns = bindings.get("columns") or []
    if isinstance(columns, list):
        cols = [str(c).strip() for c in columns if str(c).strip()]
    else:
        cols = [c.strip() for c in str(columns).split(",") if c.strip()]
    if not cols:
        raise ValueError("bindings.columns must include at least one value")
    columns_csv = ",".join(cols)

    column_property = str(bindings.get("columnProperty") or "").strip()
    if not column_property:
        raise ValueError("bindings.columnProperty is required")
    card_title = str(bindings.get("cardTitleProperty") or "").strip()
    if not card_title:
        raise ValueError("bindings.cardTitleProperty is required")

    board_props: dict[str, str] = {
        "objectType": object_type,
        "columnProperty": column_property,
        "columns": columns_csv,
        "cardTitleProperty": card_title,
    }
    for key in (
        "createAction",
        "updateAction",
        "setStatusAction",
        "deleteAction",
        "suggestFunction",
    ):
        val = bindings.get(key)
        if val:
            board_props[key] = str(val)

    components: list[dict[str, Any]] = [
        {"id": "root", "component": "Column", "children": ["title", "subtitle", "board"]},
        {"id": "title", "component": "Text", "text": title, "variant": "h1"},
        {
            "id": "subtitle",
            "component": "Text",
            "text": subtitle
            or "Live board from ontology objects. Mutations run through Actions.",
            "variant": "body",
        },
        {"id": "board", "component": "OntoKanbanBoard", **board_props},
    ]

    surface_id = ONTOLOGY_APP_A2UI_SURFACE_ID
    return [
        {
            "version": A2UI_VERSION,
            "createSurface": {
                "surfaceId": surface_id,
                "catalogId": ONTOLOGY_APP_A2UI_CATALOG_ID,
            },
        },
        {
            "version": A2UI_VERSION,
            "updateComponents": {
                "surfaceId": surface_id,
                "components": components,
            },
        },
    ]


# Back-compat alias
synthesize_kanban_a2ui_messages = synthesize_status_board_a2ui_messages


def validate_ontology_app_a2ui_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Light validation: require createSurface + root component."""
    if not messages:
        raise ValueError("a2ui_messages must not be empty")
    has_surface = False
    has_root = False
    for msg in messages:
        if "createSurface" in msg:
            cs = msg["createSurface"]
            if not isinstance(cs, dict):
                raise ValueError("createSurface must be an object")
            if cs.get("catalogId") != ONTOLOGY_APP_A2UI_CATALOG_ID:
                raise ValueError(f"catalogId must be {ONTOLOGY_APP_A2UI_CATALOG_ID}")
            has_surface = True
        uc = msg.get("updateComponents")
        if isinstance(uc, dict):
            comps = uc.get("components") or []
            if isinstance(comps, list):
                for c in comps:
                    if isinstance(c, dict) and c.get("id") == "root":
                        has_root = True
    if not has_surface:
        raise ValueError("missing createSurface")
    if not has_root:
        raise ValueError("missing component id root")
    return messages
