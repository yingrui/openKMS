"""Synthesize / validate A2UI for Ontology Apps."""

from __future__ import annotations

from typing import Any

ONTOLOGY_APP_A2UI_CATALOG_ID = "https://openkms.local/a2ui/catalogs/ontology-app/v1.json"
ONTOLOGY_APP_A2UI_SURFACE_ID = "ontology-app"
A2UI_VERSION = "v0.9"
A2UI_DOC_FORMAT = "a2ui_v0_9"

BOARD_PROP_KEYS = (
    "objectType",
    "columnProperty",
    "columns",
    "cardTitleProperty",
    "createAction",
    "updateAction",
    "setStatusAction",
    "deleteAction",
    "suggestFunction",
)


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


def bindings_board_ready(bindings: dict[str, Any] | None) -> bool:
    b = bindings or {}
    if not str(b.get("objectType") or "").strip():
        return False
    if not str(b.get("columnProperty") or "").strip():
        return False
    if not str(b.get("cardTitleProperty") or "").strip():
        return False
    columns = b.get("columns") or []
    if isinstance(columns, list):
        cols = [str(c).strip() for c in columns if str(c).strip()]
    else:
        cols = [c.strip() for c in str(columns).split(",") if c.strip()]
    return bool(cols)


def synthesize_stub_a2ui_messages(*, title: str) -> list[dict[str, Any]]:
    """Empty draft canvas — author describes the app to the designer."""
    components: list[dict[str, Any]] = [
        {"id": "root", "component": "Column", "children": ["title", "hint"]},
        {"id": "title", "component": "Text", "text": title, "variant": "h1"},
        {
            "id": "hint",
            "component": "Text",
            "text": (
                "Describe the app to the designer. Link existing Object Types, "
                "Actions, and Functions — Builder does not create them."
            ),
            "variant": "body",
        },
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


def synthesize_status_board_a2ui_messages(
    bindings: dict[str, Any],
    *,
    title: str,
    subtitle: str | None = None,
) -> list[dict[str, Any]]:
    """Board surface: title + OntoKanbanBoard wired to author-supplied bindings."""
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


synthesize_kanban_a2ui_messages = synthesize_status_board_a2ui_messages


def validate_ontology_app_a2ui_messages(
    messages: list[dict[str, Any]],
    *,
    bindings: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Require createSurface + root; optionally ensure board props match BINDINGS."""
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
                    if not isinstance(c, dict):
                        continue
                    if c.get("id") == "root":
                        has_root = True
                    if bindings and c.get("component") == "OntoKanbanBoard":
                        _validate_board_against_bindings(c, bindings)
                    if bindings and c.get("component") == "OntoActionButton":
                        api = str(c.get("actionApiName") or "")
                        allowed = {
                            str(bindings.get(k) or "")
                            for k in ("createAction", "updateAction", "setStatusAction", "deleteAction")
                            if bindings.get(k)
                        }
                        if api and api not in allowed:
                            raise ValueError(f"OntoActionButton actionApiName not in BINDINGS: {api}")
                    if bindings and c.get("component") == "OntoFunctionButton":
                        api = str(c.get("functionApiName") or "")
                        sug = str(bindings.get("suggestFunction") or "")
                        if api and sug and api != sug:
                            raise ValueError(f"OntoFunctionButton functionApiName not in BINDINGS: {api}")
    if not has_surface:
        raise ValueError("missing createSurface")
    if not has_root:
        raise ValueError("missing component id root")
    return messages


def _validate_board_against_bindings(comp: dict[str, Any], bindings: dict[str, Any]) -> None:
    ot = str(bindings.get("objectType") or "").strip()
    if ot and str(comp.get("objectType") or "") not in ("", ot):
        raise ValueError(f"OntoKanbanBoard objectType must match BINDINGS ({ot})")
    for key in ("createAction", "updateAction", "setStatusAction", "deleteAction", "suggestFunction"):
        bound = bindings.get(key)
        if not bound:
            continue
        prop = comp.get(key)
        if prop and str(prop) != str(bound):
            raise ValueError(f"OntoKanbanBoard {key} must match BINDINGS ({bound})")
