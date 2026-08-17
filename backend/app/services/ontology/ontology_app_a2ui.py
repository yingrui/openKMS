"""Synthesize / validate A2UI for Ontology Apps (platform primitives, not product UIs)."""

from __future__ import annotations

from typing import Any

ONTOLOGY_APP_A2UI_CATALOG_ID = "https://openkms.local/a2ui/catalogs/ontology-app/v1.json"
ONTOLOGY_APP_A2UI_SURFACE_ID = "ontology-app"
A2UI_VERSION = "v0.9"
A2UI_DOC_FORMAT = "a2ui_v0_9"

REMOVED_COMPONENTS = frozenset({"OntoKanbanBoard"})

ONTOLOGY_COMPONENTS_WITH_OBJECT_TYPE = frozenset({"OntoObjectList"})
ONTOLOGY_COMPONENTS_WITH_ACTION = frozenset({"OntoActionButton", "OntoActionForm"})
ONTOLOGY_COMPONENTS_WITH_FUNCTION = frozenset({"OntoFunctionButton"})


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


def normalize_resources(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Keep only objectTypes / actions / functions string lists."""
    b = raw or {}
    out: dict[str, Any] = {}
    for key in ("objectTypes", "actions", "functions"):
        val = b.get(key)
        if not isinstance(val, list):
            continue
        items = [str(x).strip() for x in val if str(x).strip()]
        if items:
            out[key] = list(dict.fromkeys(items))
    return out


def resources_nonempty(resources: dict[str, Any] | None) -> bool:
    r = resources or {}
    return bool(r.get("objectTypes") or r.get("actions") or r.get("functions"))


def reject_legacy_board_bindings(raw: dict[str, Any] | None) -> None:
    """Hard-fail old kanban-shaped bindings (no projection)."""
    if not raw:
        return
    legacy = (
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
    hit = [k for k in legacy if k in raw and raw.get(k) not in (None, "", [])]
    if hit and not resources_nonempty(raw):
        raise ValueError(
            "Legacy board bindings are no longer supported "
            f"({', '.join(hit)}). Use objectTypes, actions, and functions, then rebuild the A2UI layout."
        )


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
                "Actions, and Functions — Builder does not create them. "
                "Compose OntoObjectList, OntoActionForm, and layout components in Source."
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


def iter_a2ui_components(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for msg in messages:
        uc = msg.get("updateComponents")
        if not isinstance(uc, dict):
            continue
        comps = uc.get("components") or []
        if isinstance(comps, list):
            for c in comps:
                if isinstance(c, dict):
                    out.append(c)
    return out


def collect_a2ui_resource_refs(messages: list[dict[str, Any]]) -> dict[str, set[str]]:
    ots: set[str] = set()
    actions: set[str] = set()
    functions: set[str] = set()
    for c in iter_a2ui_components(messages):
        name = str(c.get("component") or "")
        if name in REMOVED_COMPONENTS:
            continue
        if name in ONTOLOGY_COMPONENTS_WITH_OBJECT_TYPE or name == "OntoObjectLink":
            ot = str(c.get("objectType") or "").strip()
            if ot:
                ots.add(ot)
        if name in ONTOLOGY_COMPONENTS_WITH_ACTION:
            api = str(c.get("actionApiName") or "").strip()
            if api:
                actions.add(api)
        if name in ONTOLOGY_COMPONENTS_WITH_FUNCTION:
            api = str(c.get("functionApiName") or "").strip()
            if api:
                functions.add(api)
    return {"objectTypes": ots, "actions": actions, "functions": functions}


def a2ui_uses_removed_components(messages: list[dict[str, Any]] | None) -> bool:
    for c in iter_a2ui_components(messages or []):
        if str(c.get("component") or "") in REMOVED_COMPONENTS:
            return True
    return False


def validate_ontology_app_a2ui_messages(
    messages: list[dict[str, Any]],
    *,
    bindings: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Require createSurface + root; reject removed components; refs ⊆ resources."""
    if not messages:
        raise ValueError("a2ui_messages must not be empty")
    resources = normalize_resources(bindings)
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

    for c in iter_a2ui_components(messages):
        if c.get("id") == "root":
            has_root = True
        name = str(c.get("component") or "")
        if name in REMOVED_COMPONENTS:
            raise ValueError(
                f"Component {name} was removed. Rebuild the layout with "
                "OntoObjectList, OntoActionForm, and other platform primitives."
            )

    if not has_surface:
        raise ValueError("missing createSurface")
    if not has_root:
        raise ValueError("missing component id root")

    if resources:
        allowed_ot = set(resources.get("objectTypes") or [])
        allowed_act = set(resources.get("actions") or [])
        allowed_fn = set(resources.get("functions") or [])
        refs = collect_a2ui_resource_refs(messages)
        for ot in refs["objectTypes"]:
            if allowed_ot and ot not in allowed_ot:
                raise ValueError(f"objectType {ot!r} is not in resources.objectTypes")
        for api in refs["actions"]:
            if allowed_act and api not in allowed_act:
                raise ValueError(f"actionApiName {api!r} is not in resources.actions")
        for api in refs["functions"]:
            if allowed_fn and api not in allowed_fn:
                raise ValueError(f"functionApiName {api!r} is not in resources.functions")

    return messages
