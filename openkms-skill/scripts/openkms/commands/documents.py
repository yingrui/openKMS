"""documents — upload + list / get / markdown + lifecycle + relationships (lineage)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from ..config import load_config
from .._io import print_json, write_or_print


def _document_channel_id(ns: argparse.Namespace) -> str:
    direct = (getattr(ns, "channel_id", None) or "").strip()
    if direct:
        return direct
    cfg = load_config()
    return (cfg.get("default_document_channel_id") or "").strip()


def cmd_upload(ns: argparse.Namespace) -> None:
    path = Path(ns.file)
    if not path.is_file():
        print(f"Not a file: {path}", file=sys.stderr)
        sys.exit(1)
    chid = _document_channel_id(ns)
    if not chid:
        print(
            "Missing channel: pass --channel-id or set default_document_channel_id in config.yml.",
            file=sys.stderr,
        )
        sys.exit(2)
    preview = {"channel_id": chid, "file": str(path.resolve())}
    confirm_or_abort(
        "upload document",
        "POST",
        "/api/documents/upload",
        preview,
        ns.yes,
        ns.dry_run,
    )
    with client() as s, path.open("rb") as f:
        r = s.post(
            "/api/documents/upload",
            files={"file": (path.name, f, "application/octet-stream")},
            data={"channel_id": chid},
        )
    r.raise_for_status()
    print_json(r.json())


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, str | int] = {}
    chid = _document_channel_id(ns)
    if chid:
        params["channel_id"] = chid
    if ns.search:
        params["search"] = ns.search
    if ns.limit:
        params["limit"] = ns.limit
    if ns.offset:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get("/api/documents", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/documents/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_markdown(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/documents/{ns.id}")
    r.raise_for_status()
    data = r.json()
    md = data.get("markdown")
    if md is None:
        print(f"document {ns.id} has no markdown field in response", file=sys.stderr)
        sys.exit(1)
    write_or_print(md, ns.out or None)


def cmd_put_markdown(ns: argparse.Namespace) -> None:
    if ns.file:
        markdown = Path(ns.file).read_text(encoding="utf-8")
    elif ns.markdown is not None:
        markdown = ns.markdown
    else:
        print("put-markdown: require --file or --markdown", file=sys.stderr)
        sys.exit(2)
    path = f"/api/documents/{ns.id}/markdown"
    body = {"markdown": markdown}
    confirm_or_abort(
        "update document markdown",
        "PUT",
        path,
        {"markdown": f"<{len(markdown)} chars>"},
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_put_metadata(ns: argparse.Namespace) -> None:
    try:
        meta = json.loads(ns.metadata_json)
    except json.JSONDecodeError as e:
        print(f"--metadata-json: invalid JSON ({e})", file=sys.stderr)
        sys.exit(2)
    path = f"/api/documents/{ns.id}/metadata"
    confirm_or_abort("update document metadata", "PUT", path, meta, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=meta)
    r.raise_for_status()
    print_json(r.json())


def cmd_versions_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/documents/{ns.id}/versions")
    r.raise_for_status()
    print_json(r.json())


def cmd_versions_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/documents/{ns.id}/versions/{ns.version_id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_versions_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.tag:
        body["tag"] = ns.tag
    if ns.note:
        body["note"] = ns.note
    path = f"/api/documents/{ns.id}/versions"
    confirm_or_abort("create document version", "POST", path, body or None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_versions_restore(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.save_current_as_version:
        body["save_current_as_version"] = True
    if ns.tag:
        body["tag"] = ns.tag
    if ns.note:
        body["note"] = ns.note
    path = f"/api/documents/{ns.id}/versions/{ns.version_id}/restore"
    confirm_or_abort("restore document version", "POST", path, body or None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_export(ns: argparse.Namespace) -> None:
    path = f"/api/documents/{ns.id}/export"
    confirm_or_abort(
        "export document parsing zip",
        "GET",
        path,
        {"out": ns.out},
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.get(path)
    r.raise_for_status()
    out = Path(ns.out)
    out.write_bytes(r.content)
    print(json.dumps({"id": ns.id, "out": str(out.resolve()), "bytes": len(r.content)}, indent=2))


_DOCUMENT_RELATION_TYPES = ("supersedes", "amends", "implements", "see_also")
_DOCUMENT_LIFECYCLE_STATUSES = ("draft", "in_force", "superseded", "withdrawn")


def cmd_relationships_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/documents/{ns.id}/relationships")
    r.raise_for_status()
    print_json(r.json())


def cmd_relationships_create(ns: argparse.Namespace) -> None:
    path = f"/api/documents/{ns.id}/relationships"
    body: dict[str, Any] = {
        "target_document_id": ns.target_id,
        "relation_type": ns.relation_type,
    }
    if ns.note:
        body["note"] = ns.note
    confirm_or_abort(
        "create document relationship (outgoing edge)",
        "POST",
        path,
        body,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_relationships_delete(ns: argparse.Namespace) -> None:
    path = f"/api/documents/{ns.id}/relationships/{ns.relationship_id}"
    confirm_or_abort(
        "delete document relationship (outgoing only)",
        "DELETE",
        path,
        None,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted relationship {ns.relationship_id} from document {ns.id}")


def cmd_lifecycle_patch(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.series_id is not None:
        body["series_id"] = ns.series_id
    if ns.clear_effective_from:
        body["effective_from"] = None
    elif ns.effective_from is not None:
        body["effective_from"] = ns.effective_from
    if ns.clear_effective_to:
        body["effective_to"] = None
    elif ns.effective_to is not None:
        body["effective_to"] = ns.effective_to
    if ns.lifecycle_status is not None:
        body["lifecycle_status"] = ns.lifecycle_status
    if not body:
        print(
            "documents lifecycle patch: nothing to send (use --series-id, dates, "
            "--lifecycle-status, or --clear-effective-from / --clear-effective-to)",
            file=sys.stderr,
        )
        sys.exit(2)
    path = f"/api/documents/{ns.id}/lifecycle"
    confirm_or_abort(
        "patch document lifecycle",
        "PATCH",
        path,
        body,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("documents", help="Documents")
    sp = p.add_subparsers(dest="doc_cmd", required=True)

    up = sp.add_parser("upload", help="Upload file to channel")
    up.add_argument(
        "--channel-id",
        default="",
        help="document channel UUID (or set default_document_channel_id in config.yml)",
    )
    up.add_argument("--file", required=True)
    add_write_flags(up)
    up.set_defaults(fn=cmd_upload)

    ls = sp.add_parser("list", help="List documents (GET /api/documents)")
    ls.add_argument(
        "--channel-id",
        default="",
        help="filter by channel (or use default_document_channel_id from config.yml)",
    )
    ls.add_argument("--search", default="")
    ls.add_argument("--limit", type=int, default=0)
    ls.add_argument("--offset", type=int, default=0)
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get document by ID (GET /api/documents/{id})")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    md = sp.add_parser(
        "markdown",
        help="Print or save document markdown (extracts .markdown from GET /api/documents/{id})",
    )
    md.add_argument("--id", required=True)
    md.add_argument("--out", default="", help="Output file path; omit to print to stdout")
    md.set_defaults(fn=cmd_markdown)

    pmd = sp.add_parser("put-markdown", help="Replace document markdown (PUT …/markdown)")
    pmd.add_argument("--id", required=True)
    pmd.add_argument("--file", default=None, help="Read markdown from file")
    pmd.add_argument("--markdown", default=None, help="Inline markdown string")
    add_write_flags(pmd)
    pmd.set_defaults(fn=cmd_put_markdown)

    pmeta = sp.add_parser("put-metadata", help="Merge document metadata (PUT …/metadata)")
    pmeta.add_argument("--id", required=True)
    pmeta.add_argument("--metadata-json", required=True)
    add_write_flags(pmeta)
    pmeta.set_defaults(fn=cmd_put_metadata)

    ver = sp.add_parser("versions", help="Document version snapshots")
    vsp = ver.add_subparsers(dest="doc_ver_cmd", required=True)
    vls = vsp.add_parser("list", help="List versions")
    vls.add_argument("--id", required=True)
    vls.set_defaults(fn=cmd_versions_list)
    vgt = vsp.add_parser("get", help="Get one version snapshot")
    vgt.add_argument("--id", required=True)
    vgt.add_argument("--version-id", required=True)
    vgt.set_defaults(fn=cmd_versions_get)
    vcr = vsp.add_parser("create", help="Snapshot current markdown + metadata")
    vcr.add_argument("--id", required=True)
    vcr.add_argument("--tag", default="")
    vcr.add_argument("--note", default="")
    add_write_flags(vcr)
    vcr.set_defaults(fn=cmd_versions_create)
    vrs = vsp.add_parser("restore", help="Restore working copy from a version")
    vrs.add_argument("--id", required=True)
    vrs.add_argument("--version-id", required=True)
    vrs.add_argument("--save-current-as-version", action="store_true")
    vrs.add_argument("--tag", default="")
    vrs.add_argument("--note", default="")
    add_write_flags(vrs)
    vrs.set_defaults(fn=cmd_versions_restore)

    ex = sp.add_parser("export", help="Download parsing zip to --out")
    ex.add_argument("--id", required=True)
    ex.add_argument("--out", required=True, help="Output .zip path")
    add_write_flags(ex)
    ex.set_defaults(fn=cmd_export)

    rel = sp.add_parser(
        "relationships",
        help="Lineage edges (outgoing/incoming vs other documents; same data as document detail)",
    )
    rsp = rel.add_subparsers(dest="doc_rel_cmd", required=True)
    rls = rsp.add_parser("list", help="List outgoing and incoming relationships")
    rls.add_argument("--id", required=True, dest="id", help="document id")
    rls.set_defaults(fn=cmd_relationships_list)
    rcr = rsp.add_parser(
        "create",
        help="Create outgoing edge: this document → target (e.g. supersedes, amends)",
    )
    rcr.add_argument("--id", required=True, dest="id", help="source document id")
    rcr.add_argument("--target-id", required=True, help="target document id")
    rcr.add_argument(
        "--relation-type",
        required=True,
        choices=_DOCUMENT_RELATION_TYPES,
        help="edge type",
    )
    rcr.add_argument("--note", default="")
    add_write_flags(rcr)
    rcr.set_defaults(fn=cmd_relationships_create)
    rdl = rsp.add_parser(
        "delete",
        help="Delete an outgoing relationship by id (source must be --id)",
    )
    rdl.add_argument("--id", required=True, dest="id", help="source document id")
    rdl.add_argument("--relationship-id", required=True)
    add_write_flags(rdl)
    rdl.set_defaults(fn=cmd_relationships_delete)

    lc = sp.add_parser(
        "lifecycle",
        help="Policy lifecycle (series, effective dates, status; PATCH same fields as UI)",
    )
    lsp = lc.add_subparsers(dest="doc_lc_cmd", required=True)
    lp = lsp.add_parser(
        "patch",
        help="Update lifecycle fields (partial). Dates as ISO-8601 strings (e.g. 2025-01-15T00:00:00Z).",
    )
    lp.add_argument("--id", required=True, dest="id", help="document id")
    lp.add_argument("--series-id", default=None)
    lp.add_argument("--effective-from", default=None)
    lp.add_argument("--effective-to", default=None)
    lp.add_argument(
        "--lifecycle-status",
        default=None,
        choices=_DOCUMENT_LIFECYCLE_STATUSES,
        help="draft | in_force | superseded | withdrawn",
    )
    lp.add_argument(
        "--clear-effective-from",
        action="store_true",
        help="set effective_from to null (clears start of validity window)",
    )
    lp.add_argument(
        "--clear-effective-to",
        action="store_true",
        help="set effective_to to null (clears end of validity window)",
    )
    add_write_flags(lp)
    lp.set_defaults(fn=cmd_lifecycle_patch)
