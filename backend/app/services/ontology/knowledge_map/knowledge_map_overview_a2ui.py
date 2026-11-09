"""Synthesize and validate A2UI v0.9 messages for Knowledge Map Overview."""

from __future__ import annotations

from typing import Any

# Must match frontend ``kmOverviewCatalog.id``
KM_OVERVIEW_A2UI_CATALOG_ID = "https://openkms.local/a2ui/catalogs/knowledge-map-overview/v1.json"
KM_OVERVIEW_A2UI_SURFACE_ID = "km-overview"
A2UI_VERSION = "v0.9"


def synthesize_overview_a2ui_messages(
    tree: list[dict[str, Any]],
    links: list[dict[str, Any]],
    labels: dict[str, str],
    *,
    title: str = "Knowledge Map",
    subtitle: str = "Browse terms and jump to linked channels and wiki spaces.",
) -> list[dict[str, Any]]:
    """Build a complete A2UI v0.9 message list for Browse (no agent required)."""
    components: list[dict[str, Any]] = []
    root_children: list[str] = ["title", "subtitle"]

    components.append({"id": "title", "component": "Text", "text": title, "variant": "h1"})
    components.append({"id": "subtitle", "component": "Text", "text": subtitle, "variant": "body"})

    if not tree:
        components.append(
            {
                "id": "empty",
                "component": "Text",
                "text": "Add terms on the Edit map tab, then return here for an overview.",
                "variant": "body",
            }
        )
        root_children.append("empty")
    else:
        links_by_node: dict[str, list[dict[str, Any]]] = {}
        for lk in links:
            links_by_node.setdefault(lk["knowledge_map_node_id"], []).append(lk)

        for root in tree:
            sec_id = f"sec-{root['id'][:16]}"
            card_id = f"card-{root['id'][:16]}"
            root_children.append(card_id)
            _append_node_section(components, root, links_by_node, labels, sec_id, depth=0)
            components.append({"id": card_id, "component": "Card", "child": sec_id})

    components.insert(0, {"id": "root", "component": "Column", "children": root_children})

    return [
        {
            "version": A2UI_VERSION,
            "createSurface": {
                "surfaceId": KM_OVERVIEW_A2UI_SURFACE_ID,
                "catalogId": KM_OVERVIEW_A2UI_CATALOG_ID,
            },
        },
        {
            "version": A2UI_VERSION,
            "updateComponents": {
                "surfaceId": KM_OVERVIEW_A2UI_SURFACE_ID,
                "components": components,
            },
        },
        {
            "version": A2UI_VERSION,
            "updateDataModel": {
                "surfaceId": KM_OVERVIEW_A2UI_SURFACE_ID,
                "path": "/",
                "value": {"title": title, "subtitle": subtitle},
            },
        },
    ]


def _append_node_section(
    components: list[dict[str, Any]],
    node: dict[str, Any],
    links_by_node: dict[str, list[dict[str, Any]]],
    labels: dict[str, str],
    sec_id: str,
    *,
    depth: int,
) -> None:
    child_ids: list[str] = []
    title_id = f"{sec_id}-title"
    child_ids.append(title_id)
    components.append(
        {
            "id": title_id,
            "component": "KmNodeLink",
            "nodeId": node["id"],
            "label": node.get("name") or node["id"],
        }
    )
    desc = (node.get("description") or "").strip()
    if desc:
        desc_id = f"{sec_id}-desc"
        child_ids.append(desc_id)
        components.append({"id": desc_id, "component": "Text", "text": desc, "variant": "caption"})

    for i, lk in enumerate(links_by_node.get(node["id"], [])):
        rid = f"{sec_id}-res-{i}"
        child_ids.append(rid)
        key = f"{lk['resource_type']}:{lk['resource_id']}"
        label = labels.get(key) or f"{lk['resource_type']}: {lk['resource_id']}"
        href = _resource_href(lk["resource_type"], lk["resource_id"])
        components.append(
            {
                "id": rid,
                "component": "KmResourceLink",
                "resourceType": lk["resource_type"],
                "resourceId": lk["resource_id"],
                "label": label,
                "href": href,
            }
        )

    for j, child in enumerate(node.get("children") or []):
        nested_id = f"{sec_id}-c{j}-{child['id'][:12]}"
        child_ids.append(nested_id)
        _append_node_section(components, child, links_by_node, labels, nested_id, depth=depth + 1)

    components.append({"id": sec_id, "component": "Column", "children": child_ids})


def _resource_href(resource_type: str, resource_id: str) -> str:
    if resource_type == "document_channel":
        return f"/documents/channels/{resource_id}"
    if resource_type == "wiki_space":
        return f"/wikis/{resource_id}/pages/graph"
    if resource_type == "article_channel":
        return f"/articles/channels/{resource_id}"
    if resource_type == "media_channel":
        return f"/media/channels/{resource_id}"
    return "/articles"


def normalize_a2ui_component_shapes(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fix common LLM mistakes (e.g. Card.children → Card.child + Column wrapper)."""
    out: list[dict[str, Any]] = []
    extras: list[dict[str, Any]] = []

    for msg in messages:
        if not isinstance(msg, dict) or "updateComponents" not in msg:
            out.append(msg)
            continue
        upd = msg.get("updateComponents")
        if not isinstance(upd, dict):
            out.append(msg)
            continue
        comps = list(upd.get("components") or [])
        fixed: list[dict[str, Any]] = []
        for comp in comps:
            if not isinstance(comp, dict):
                continue
            c = dict(comp)
            name = c.get("component")
            # Card / Button / Modal take a single child id — not a children list.
            if name in ("Card", "Button") and "children" in c and "child" not in c:
                kids = c.pop("children")
                if isinstance(kids, list) and len(kids) == 1 and isinstance(kids[0], str):
                    c["child"] = kids[0]
                elif isinstance(kids, list) and kids and all(isinstance(k, str) for k in kids):
                    wrap_id = f"{c.get('id', 'wrap')}-inner"
                    extras.append({"id": wrap_id, "component": "Column", "children": kids})
                    c["child"] = wrap_id
                elif isinstance(kids, str):
                    c["child"] = kids
            if name == "Card" and isinstance(c.get("child"), list):
                kids = c["child"]
                if len(kids) == 1 and isinstance(kids[0], str):
                    c["child"] = kids[0]
                elif kids and all(isinstance(k, str) for k in kids):
                    wrap_id = f"{c.get('id', 'wrap')}-inner"
                    extras.append({"id": wrap_id, "component": "Column", "children": kids})
                    c["child"] = wrap_id
            fixed.append(c)
        # Insert wrappers before cards that reference them (order does not matter to processor).
        new_upd = {**upd, "components": extras + fixed if extras else fixed}
        extras = []
        out.append({**msg, "updateComponents": new_upd})
    return out


def validate_a2ui_messages_against_snapshot(
    messages: list[dict[str, Any]],
    snapshot: dict[str, Any],
) -> list[dict[str, Any]]:
    """Ensure envelope + root + KmNodeLink / KmResourceLink ids. Raises ValueError."""
    if not isinstance(messages, list) or not messages:
        raise ValueError("a2ui messages must be a non-empty list")
    messages = normalize_a2ui_component_shapes(messages)
    live_nodes = {n["id"] for n in snapshot.get("nodes") or []}
    live_links = {(lk["resource_type"], lk["resource_id"]) for lk in snapshot.get("links") or []}
    bad_nodes: list[str] = []
    bad_res: list[str] = []
    saw_create = False
    component_ids: set[str] = set()
    for msg in messages:
        if not isinstance(msg, dict):
            raise ValueError("each a2ui message must be an object")
        create = msg.get("createSurface")
        if isinstance(create, dict):
            saw_create = True
            if create.get("surfaceId") != KM_OVERVIEW_A2UI_SURFACE_ID:
                raise ValueError(f"createSurface.surfaceId must be '{KM_OVERVIEW_A2UI_SURFACE_ID}'")
            if create.get("catalogId") != KM_OVERVIEW_A2UI_CATALOG_ID:
                raise ValueError(f"createSurface.catalogId must be '{KM_OVERVIEW_A2UI_CATALOG_ID}'")
        upd = msg.get("updateComponents")
        if not isinstance(upd, dict):
            continue
        if upd.get("surfaceId") not in (None, KM_OVERVIEW_A2UI_SURFACE_ID):
            raise ValueError(f"updateComponents.surfaceId must be '{KM_OVERVIEW_A2UI_SURFACE_ID}'")
        for comp in upd.get("components") or []:
            if not isinstance(comp, dict):
                continue
            cid = comp.get("id")
            if isinstance(cid, str) and cid:
                component_ids.add(cid)
            name = comp.get("component")
            if name == "KmNodeLink":
                nid = comp.get("nodeId")
                if not isinstance(nid, str) or nid not in live_nodes:
                    bad_nodes.append(str(nid))
            elif name == "KmResourceLink":
                rt = comp.get("resourceType")
                rid = comp.get("resourceId")
                if not isinstance(rt, str) or not isinstance(rid, str) or (rt, rid) not in live_links:
                    bad_res.append(f"{rt}:{rid}")
    if not saw_create:
        raise ValueError("a2ui messages must include createSurface")
    if "root" not in component_ids:
        raise ValueError(
            "a2ui messages must include a component with id 'root' "
            "(A2uiSurface always renders id=root)"
        )
    if bad_nodes:
        raise ValueError(f"unknown node ids in A2UI: {', '.join(sorted(set(bad_nodes))[:12])}")
    if bad_res:
        raise ValueError(f"unknown resource refs in A2UI: {', '.join(sorted(set(bad_res))[:12])}")
    return messages


def normalize_stored_a2ui_document(raw: Any) -> list[dict[str, Any]] | None:
    """Parse published JSONB; return messages or None if legacy / invalid."""
    if not isinstance(raw, dict):
        return None
    if raw.get("format") == "a2ui_v0_9" and isinstance(raw.get("messages"), list):
        return list(raw["messages"])
    return None
