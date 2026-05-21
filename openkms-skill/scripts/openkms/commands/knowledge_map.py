"""knowledge-map — Knowledge Map tree, nodes CRUD, resource link map/unmap (Console Knowledge Map)."""
from __future__ import annotations

import argparse
import sys
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json

_RESOURCE_TYPES = frozenset({"document_channel", "article_channel", "wiki_space"})


def cmd_nodes_tree(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/knowledge-map/nodes/tree")
    r.raise_for_status()
    print_json(r.json())


def cmd_nodes_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "name": ns.name.strip(),
        "sort_order": ns.sort_order,
    }
    if ns.parent_id:
        body["parent_id"] = ns.parent_id.strip()
    if ns.description:
        body["description"] = ns.description.strip()
    confirm_or_abort("create knowledge map node", "POST", "/api/knowledge-map/nodes", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/knowledge-map/nodes", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_nodes_patch(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.clear_parent:
        body["parent_id"] = None
    elif ns.parent_id is not None:
        body["parent_id"] = ns.parent_id.strip() or None
    if ns.name is not None:
        body["name"] = ns.name
    if ns.description is not None:
        body["description"] = ns.description
    if ns.sort_order is not None:
        body["sort_order"] = ns.sort_order
    if not body:
        print(
            "knowledge-map nodes patch: nothing to send "
            "(use --name, --description, --sort-order, --parent-id, or --clear-parent)",
            file=sys.stderr,
        )
        sys.exit(2)
    path = f"/api/knowledge-map/nodes/{ns.id}"
    confirm_or_abort("patch knowledge map node", "PATCH", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_nodes_delete(ns: argparse.Namespace) -> None:
    path = f"/api/knowledge-map/nodes/{ns.id}"
    confirm_or_abort("delete knowledge map node", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted knowledge map node {ns.id}")


def cmd_resource_links_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/knowledge-map/resource-links")
    r.raise_for_status()
    print_json(r.json())


def cmd_resource_links_put(ns: argparse.Namespace) -> None:
    rt = ns.resource_type.strip()
    if rt not in _RESOURCE_TYPES:
        print(
            f"--resource-type must be one of: {', '.join(sorted(_RESOURCE_TYPES))}",
            file=sys.stderr,
        )
        sys.exit(2)
    body = {
        "knowledge_map_node_id": ns.knowledge_map_node_id.strip(),
        "resource_type": rt,
        "resource_id": ns.resource_id.strip(),
    }
    confirm_or_abort(
        "upsert knowledge map resource link",
        "PUT",
        "/api/knowledge-map/resource-links",
        body,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.put("/api/knowledge-map/resource-links", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_resource_links_delete(ns: argparse.Namespace) -> None:
    rt = ns.resource_type.strip()
    if rt not in _RESOURCE_TYPES:
        print(
            f"--resource-type must be one of: {', '.join(sorted(_RESOURCE_TYPES))}",
            file=sys.stderr,
        )
        sys.exit(2)
    rid = ns.resource_id.strip()
    path = "/api/knowledge-map/resource-links"
    params = {"resource_type": rt, "resource_id": rid}
    confirm_or_abort(
        "delete knowledge map resource link",
        "DELETE",
        f"{path}?resource_type={rt}&resource_id={rid}",
        None,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.delete(path, params=params)
    r.raise_for_status()
    print(f"unmapped {rt} {rid} from knowledge map")


def add_subparser(sub) -> None:
    p = sub.add_parser(
        "knowledge-map",
        help="Knowledge map (term tree + channel/wiki links; same as Console)",
    )
    sp = p.add_subparsers(dest="km_cmd", required=True)

    nodes = sp.add_parser("nodes", help="Knowledge Map terms (nodes)")
    nsp = nodes.add_subparsers(dest="km_nodes_cmd", required=True)

    nsp.add_parser("tree", help="Get full tree (GET /api/knowledge-map/nodes/tree)").set_defaults(fn=cmd_nodes_tree)

    nc = nsp.add_parser("create", help="Create node under optional parent")
    nc.add_argument("--name", required=True)
    nc.add_argument("--parent-id", default="", help="parent map node id; omit for root")
    nc.add_argument("--description", default="")
    nc.add_argument("--sort-order", type=int, default=0)
    add_write_flags(nc)
    nc.set_defaults(fn=cmd_nodes_create)

    np = nsp.add_parser("patch", help="Update node (partial)")
    np.add_argument("--id", required=True, dest="id", help="map node id")
    np.add_argument("--name", default=None)
    np.add_argument("--description", default=None)
    np.add_argument("--sort-order", type=int, default=None)
    np.add_argument(
        "--parent-id",
        default=None,
        help="move under this parent id (omit flag entirely if not changing parent)",
    )
    np.add_argument(
        "--clear-parent",
        action="store_true",
        help="set parent to null (make this a root node)",
    )
    add_write_flags(np)
    np.set_defaults(fn=cmd_nodes_patch)

    nd = nsp.add_parser("delete", help="Delete node (server removes subtree per API)")
    nd.add_argument("--id", required=True, dest="id")
    add_write_flags(nd)
    nd.set_defaults(fn=cmd_nodes_delete)

    rl = sp.add_parser("resource-links", help="Map channels / wiki spaces to map nodes")
    rlsp = rl.add_subparsers(dest="km_rl_cmd", required=True)

    rlsp.add_parser(
        "list",
        help="List all resource links (GET /api/knowledge-map/resource-links)",
    ).set_defaults(fn=cmd_resource_links_list)

    rlp = rlsp.add_parser(
        "put",
        help="Attach or move a resource to a map node (one resource → one node)",
    )
    rlp.add_argument("--knowledge-map-node-id", required=True, dest="knowledge_map_node_id")
    rlp.add_argument(
        "--resource-type",
        required=True,
        choices=sorted(_RESOURCE_TYPES),
    )
    rlp.add_argument("--resource-id", required=True, help="document_channel, article_channel, or wiki_space id")
    add_write_flags(rlp)
    rlp.set_defaults(fn=cmd_resource_links_put)

    rld = rlsp.add_parser("delete", help="Remove a resource from the map (query by type + id)")
    rld.add_argument(
        "--resource-type",
        required=True,
        choices=sorted(_RESOURCE_TYPES),
    )
    rld.add_argument("--resource-id", required=True)
    add_write_flags(rld)
    rld.set_defaults(fn=cmd_resource_links_delete)
