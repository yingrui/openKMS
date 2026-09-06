"""Synthesize / validate A2UI for Ontology Apps (platform primitives, not product UIs)."""

from __future__ import annotations

from typing import Any

APP_BUILDER_A2UI_CATALOG_ID = "https://openkms.local/a2ui/catalogs/ontology-app/v1.json"
APP_BUILDER_A2UI_SURFACE_ID = "ontology-app"
A2UI_VERSION = "v0.9"
A2UI_DOC_FORMAT = "a2ui_v0_9"

REMOVED_COMPONENTS = frozenset(
    {
        "OntoKanbanBoard",
        "OntoActionForm",
        "OntoActionButton",
        "OntoFunctionButton",
        "OntoObjectLink",
    }
)

ONTOLOGY_COMPONENTS_WITH_OBJECT_TYPE = frozenset({"OntoObjectList"})


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
    """Empty draft canvas — author composes layout in Source / via skill."""
    components: list[dict[str, Any]] = [
        {"id": "root", "component": "Column", "children": ["title", "hint"]},
        {"id": "title", "component": "Text", "text": title, "variant": "h1"},
        {
            "id": "hint",
            "component": "Text",
            "text": (
                "Set Resources and Loaders in Settings, then compose OntoObjectList "
                "(data loader) + List row templates, Modal, TextField, and Button in Source."
            ),
            "variant": "body",
        },
    ]
    surface_id = APP_BUILDER_A2UI_SURFACE_ID
    return [
        {
            "version": A2UI_VERSION,
            "createSurface": {
                "surfaceId": surface_id,
                "catalogId": APP_BUILDER_A2UI_CATALOG_ID,
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


def _literal_api_name(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _event_name_and_context(action: Any) -> tuple[str | None, dict[str, Any] | None]:
    if not isinstance(action, dict):
        return None, None
    event = action.get("event")
    if not isinstance(event, dict):
        return None, None
    name = str(event.get("name") or "").strip() or None
    ctx = event.get("context")
    if not isinstance(ctx, dict):
        return name, None
    return name, ctx


def collect_a2ui_resource_refs(messages: list[dict[str, Any]]) -> dict[str, set[str]]:
    ots: set[str] = set()
    actions: set[str] = set()
    functions: set[str] = set()
    for c in iter_a2ui_components(messages):
        name = str(c.get("component") or "")
        if name in REMOVED_COMPONENTS:
            continue
        if name in ONTOLOGY_COMPONENTS_WITH_OBJECT_TYPE:
            ot = str(c.get("objectType") or "").strip()
            if ot:
                ots.add(ot)
        event_name, ctx = _event_name_and_context(c.get("action"))
        if not ctx:
            continue
        if event_name == "executeAction":
            api = _literal_api_name(ctx.get("actionApiName"))
            if api:
                actions.add(api)
        elif event_name == "executeFunction":
            api = _literal_api_name(ctx.get("functionApiName"))
            if api:
                functions.add(api)
    return {"objectTypes": ots, "actions": actions, "functions": functions}


def a2ui_uses_removed_components(messages: list[dict[str, Any]] | None) -> bool:
    for c in iter_a2ui_components(messages or []):
        if str(c.get("component") or "") in REMOVED_COMPONENTS:
            return True
    return False


def _iter_path_bindings(value: Any) -> list[str]:
    """Collect { path: "..." } bindings from nested component props."""
    paths: list[str] = []
    if isinstance(value, dict):
        if "path" in value and isinstance(value.get("path"), str):
            paths.append(value["path"])
        for child in value.values():
            paths.extend(_iter_path_bindings(child))
    elif isinstance(value, list):
        for item in value:
            paths.extend(_iter_path_bindings(item))
    return paths


def _component_children_ids(comp: dict[str, Any]) -> list[str]:
    children = comp.get("children")
    if isinstance(children, list):
        return [str(x) for x in children if str(x).strip()]
    child = comp.get("child")
    if isinstance(child, str) and child.strip():
        return [child.strip()]
    return []


def _validate_list_row_template_paths(messages: list[dict[str, Any]]) -> None:
    """List row templates scope DataContext to each item — paths must be relative (title), not /title."""
    by_id: dict[str, dict[str, Any]] = {}
    row_template_ids: set[str] = set()
    for c in iter_a2ui_components(messages):
        cid = str(c.get("id") or "")
        if cid:
            by_id[cid] = c
        if str(c.get("component") or "") != "List":
            continue
        children = c.get("children")
        if not isinstance(children, dict):
            continue
        template_id = str(children.get("componentId") or "").strip()
        if template_id:
            row_template_ids.add(template_id)

    def walk(comp_id: str, seen: set[str]) -> None:
        if comp_id in seen or comp_id not in by_id:
            return
        seen.add(comp_id)
        comp = by_id[comp_id]
        for path in _iter_path_bindings(comp):
            if path.startswith("/") and path.count("/") == 1 and path not in ("/",):
                raise ValueError(
                    f"List row template {comp_id!r} uses absolute path {path!r}. "
                    "Inside List items use relative field names (title, id, status), not /title."
                )
        for child_id in _component_children_ids(comp):
            walk(child_id, seen)

    for template_id in row_template_ids:
        walk(template_id, set())


def validate_app_a2ui_messages(
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
            if cs.get("catalogId") != APP_BUILDER_A2UI_CATALOG_ID:
                raise ValueError(f"catalogId must be {APP_BUILDER_A2UI_CATALOG_ID}")
            has_surface = True

    for c in iter_a2ui_components(messages):
        if c.get("id") == "root":
            has_root = True
        name = str(c.get("component") or "")
        if name in REMOVED_COMPONENTS:
            raise ValueError(
                f"Component {name} was removed. Rebuild the layout with "
                "OntoObjectList (loads DataModel), List templates, Modal, TextField, Button, and other platform primitives."
            )
        if name == "OntoObjectList" and not str(c.get("dataPath") or "").strip():
            raise ValueError(
                f"OntoObjectList {c.get('id')!r} requires dataPath. "
                "Use OntoObjectList as a DataModel loader with dataPath, plus a List row template."
            )

    if not has_surface:
        raise ValueError("missing createSurface")
    if not has_root:
        raise ValueError("missing component id root")

    _validate_list_row_template_paths(messages)

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


def component_id() -> str:
    from uuid import uuid4

    return str(uuid4())


def synthesize_stub_components(*, title: str) -> list[dict[str, Any]]:
    """Single default stub artifact — author composes layout in Source."""
    return [
        {
            "id": component_id(),
            "name": title or "Main",
            "position": 0,
            "is_default": True,
            "messages": synthesize_stub_a2ui_messages(title=title or "App"),
        }
    ]


def normalize_component(raw: dict[str, Any], *, position: int) -> dict[str, Any]:
    """Coerce one component dict to the canonical shape; validates its messages."""
    cid = str(raw.get("id") or component_id()).strip() or component_id()
    name = str(raw.get("name") or "").strip() or "Untitled"
    messages = raw.get("messages")
    if not isinstance(messages, list):
        raise ValueError(f"component {cid!r} requires a messages list")
    return {
        "id": cid,
        "name": name,
        "position": int(raw.get("position", position)),
        "is_default": bool(raw.get("is_default", False)),
        "messages": messages,
    }


def validate_app_components(
    components: list[dict[str, Any]],
    *,
    bindings: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Validate a whole artifact set: non-empty, unique ids, valid messages, one default."""
    if not components:
        raise ValueError("at least one component is required")
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, c in enumerate(components):
        if not isinstance(c, dict):
            raise ValueError("component must be an object")
        normalized = normalize_component(c, position=i)
        cid = normalized["id"]
        if cid in seen:
            raise ValueError(f"duplicate component id {cid!r}")
        seen.add(cid)
        validate_app_a2ui_messages(normalized["messages"], bindings=bindings)
        out.append(normalized)

    out.sort(key=lambda c: (c["position"], c["name"]))
    for i, c in enumerate(out):
        c["position"] = i

    defaults = [c for c in out if c["is_default"]]
    if len(defaults) != 1:
        for c in out:
            c["is_default"] = False
        out[0]["is_default"] = True
    return out


def serialize_component(comp: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": comp["id"],
        "name": comp["name"],
        "position": comp["position"],
        "is_default": comp["is_default"],
        "messages": comp["messages"],
    }
