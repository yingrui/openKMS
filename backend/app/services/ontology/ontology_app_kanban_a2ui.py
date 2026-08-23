"""Canonical WorkItem kanban A2UI — loader + List templates + create/edit Modals."""

from __future__ import annotations

from typing import Any

from app.services.ontology.ontology_app_a2ui import (
    A2UI_VERSION,
    ONTOLOGY_APP_A2UI_CATALOG_ID,
    ONTOLOGY_APP_A2UI_SURFACE_ID,
)

EDIT_MODAL_OPEN_MARKER = "__onto_edit_open__"

KANBAN_WORK_ITEM_RESOURCES: dict[str, list[str]] = {
    "objectTypes": ["WorkItem"],
    "actions": ["createWorkItem", "updateWorkItem"],
    "functions": ["suggestWorkItemPriority"],
}

_KANBAN_COLUMNS: tuple[dict[str, str], ...] = (
    {"col_id": "colToDo", "title": "To Do", "filter_value": "To Do", "list_key": "todo"},
    {"col_id": "colInProgress", "title": "In Progress", "filter_value": "In Progress", "list_key": "inProgress"},
    {"col_id": "colDone", "title": "Done", "filter_value": "done", "list_key": "done"},
)


def _row_template_components() -> list[dict[str, Any]]:
    return [
        {
            "id": "workItemRow",
            "component": "Row",
            "children": ["rowTitle", "rowEditBtn"],
            "align": "center",
            "justify": "spaceBetween",
        },
        {"id": "rowTitle", "component": "Text", "text": {"path": "title"}},
        {
            "id": "rowEditBtn",
            "component": "Button",
            "child": "rowEditIcon",
            "variant": "borderless",
            "action": {
                "event": {
                    "name": "loadObjectForEdit",
                    "context": {
                        "inputPath": "/editWorkItem",
                        "objectId": {"path": "id"},
                        "title": {"path": "title"},
                        "status": {"path": "status"},
                        "estimate": {"path": "estimate"},
                        "priority": {"path": "priority"},
                    },
                }
            },
        },
        {"id": "rowEditIcon", "component": "Text", "text": "✎"},
    ]


def _modal_form_fields(prefix: str, data_path: str) -> list[dict[str, Any]]:
    return [
        {
            "id": f"{prefix}FieldTitle",
            "component": "TextField",
            "label": "title",
            "value": {"path": f"{data_path}/title"},
        },
        {
            "id": f"{prefix}FieldStatus",
            "component": "TextField",
            "label": "status",
            "value": {"path": f"{data_path}/status"},
        },
        {
            "id": f"{prefix}FieldEstimate",
            "component": "TextField",
            "label": "estimate",
            "value": {"path": f"{data_path}/estimate"},
        },
        {
            "id": f"{prefix}FieldPriority",
            "component": "TextField",
            "label": "priority",
            "value": {"path": f"{data_path}/priority"},
        },
    ]


def _kanban_column_components(col: dict[str, str], *, object_type: str) -> list[dict[str, Any]]:
    col_id = col["col_id"]
    list_key = col["list_key"]
    data_path = f"/lists/{list_key}"
    loader_id = f"{list_key}Loader"
    list_id = f"{list_key}List"
    title_id = f"{list_key}Title"
    return [
        {
            "id": col_id,
            "component": "Column",
            "children": [title_id, loader_id, list_id],
        },
        {"id": title_id, "component": "Text", "text": col["title"], "variant": "h3"},
        {
            "id": loader_id,
            "component": "OntoObjectList",
            "objectType": object_type,
            "dataPath": data_path,
            "titleProperty": "title",
            "rowFields": "title,status,estimate,priority",
            "filterProperty": "status",
            "filterValue": col["filter_value"],
        },
        {
            "id": list_id,
            "component": "List",
            "children": {"componentId": "workItemRow", "path": data_path},
        },
    ]


def synthesize_kanban_a2ui_messages(
    *,
    title: str = "Kanban",
    object_type: str = "WorkItem",
    create_action: str = "createWorkItem",
    update_action: str = "updateWorkItem",
) -> list[dict[str, Any]]:
    """Three-column status board: OntoObjectList loaders + List row template + shared Modals."""
    surface_id = ONTOLOGY_APP_A2UI_SURFACE_ID
    components: list[dict[str, Any]] = [
        {
            "id": "root",
            "component": "Column",
            "children": ["title", "createModal", "editModal", "boardRow"],
        },
        {"id": "title", "component": "Text", "text": title, "variant": "h1"},
        {"id": "createModal", "component": "Modal", "trigger": "createBtn", "content": "createForm"},
        {"id": "createBtn", "component": "Button", "child": "createBtnText", "variant": "primary"},
        {"id": "createBtnText", "component": "Text", "text": "+ New WorkItem"},
        {
            "id": "createForm",
            "component": "Column",
            "children": [
                "createHeading",
                "createFieldTitle",
                "createFieldStatus",
                "createFieldEstimate",
                "createFieldPriority",
                "createSubmitBtn",
            ],
        },
        {"id": "createHeading", "component": "Text", "text": "New WorkItem", "variant": "h3"},
        *_modal_form_fields("create", "/createWorkItem"),
        {
            "id": "createSubmitBtn",
            "component": "Button",
            "child": "createSubmitBtnText",
            "variant": "primary",
            "action": {
                "event": {
                    "name": "executeAction",
                    "context": {
                        "actionApiName": create_action,
                        "inputPath": "/createWorkItem",
                    },
                }
            },
        },
        {"id": "createSubmitBtnText", "component": "Text", "text": "Create"},
        {"id": "editModal", "component": "Modal", "trigger": "editModalOpenBtn", "content": "editForm"},
        {
            "id": "editModalOpenBtn",
            "component": "Button",
            "child": "editModalOpenBtnText",
            "variant": "borderless",
        },
        {"id": "editModalOpenBtnText", "component": "Text", "text": EDIT_MODAL_OPEN_MARKER},
        {
            "id": "editForm",
            "component": "Column",
            "children": [
                "editHeading",
                "editFieldTitle",
                "editFieldStatus",
                "editFieldEstimate",
                "editFieldPriority",
                "editSaveBtn",
            ],
        },
        {"id": "editHeading", "component": "Text", "text": "Edit WorkItem", "variant": "h3"},
        *_modal_form_fields("edit", "/editWorkItem"),
        {
            "id": "editSaveBtn",
            "component": "Button",
            "child": "editSaveBtnText",
            "variant": "primary",
            "action": {
                "event": {
                    "name": "executeAction",
                    "context": {
                        "actionApiName": update_action,
                        "inputPath": "/editWorkItem",
                        "objectId": {"path": "/editWorkItem/objectId"},
                    },
                }
            },
        },
        {"id": "editSaveBtnText", "component": "Text", "text": "Save"},
        *_row_template_components(),
        {
            "id": "boardRow",
            "component": "Row",
            "children": [c["col_id"] for c in _KANBAN_COLUMNS],
            "align": "stretch",
        },
    ]
    for col in _KANBAN_COLUMNS:
        components.extend(_kanban_column_components(col, object_type=object_type))

    data_model_messages: list[dict[str, Any]] = [
        {
            "version": A2UI_VERSION,
            "updateDataModel": {
                "surfaceId": surface_id,
                "path": "/createWorkItem",
                "value": {"status": "To Do"},
            },
        },
    ]
    for col in _KANBAN_COLUMNS:
        data_model_messages.append(
            {
                "version": A2UI_VERSION,
                "updateDataModel": {
                    "surfaceId": surface_id,
                    "path": f"/lists/{col['list_key']}",
                    "value": [],
                },
            }
        )

    return [
        {
            "version": A2UI_VERSION,
            "createSurface": {
                "surfaceId": surface_id,
                "catalogId": ONTOLOGY_APP_A2UI_CATALOG_ID,
            },
        },
        *data_model_messages,
        {
            "version": A2UI_VERSION,
            "updateComponents": {
                "surfaceId": surface_id,
                "components": components,
            },
        },
    ]
