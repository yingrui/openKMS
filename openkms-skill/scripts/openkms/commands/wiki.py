"""wiki — put-page (existing) + list-pages / get-page (new)."""
from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import quote

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_put_page(ns: argparse.Namespace) -> None:
    path = Path(ns.file)
    raw = path.read_text(encoding="utf-8")
    path_enc = quote(ns.path.strip("/").lstrip("/"), safe="")
    api_path = f"/api/wiki-spaces/{ns.space_id}/pages/by-path/{path_enc}"
    body = {"title": ns.title, "body": raw, "metadata": None}
    confirm_or_abort("upsert wiki page", "PUT", api_path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(api_path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_list_pages(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit:
        params["limit"] = ns.limit
    if ns.offset:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get(f"/api/wiki-spaces/{ns.space_id}/pages", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_get_page(ns: argparse.Namespace) -> None:
    path_enc = quote(ns.path.strip("/").lstrip("/"), safe="")
    with client() as s:
        r = s.get(f"/api/wiki-spaces/{ns.space_id}/pages/by-path/{path_enc}")
    r.raise_for_status()
    print_json(r.json())


def cmd_files_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/wiki-spaces/{ns.space_id}/files")
    r.raise_for_status()
    print_json(r.json())


def cmd_files_delete(ns: argparse.Namespace) -> None:
    path = f"/api/wiki-spaces/{ns.space_id}/files/{ns.file_id}"
    confirm_or_abort(
        "delete wiki space stored file (vault .md/assets, uploads, etc.; DB + storage)",
        "DELETE",
        path,
        None,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted wiki file {ns.file_id} in space {ns.space_id}")


def add_subparser(sub) -> None:
    p = sub.add_parser("wiki", help="Wiki pages")
    sp = p.add_subparsers(dest="wp_cmd", required=True)

    pp = sp.add_parser("put-page", help="Upsert page by path (PUT by-path)")
    pp.add_argument("--space-id", required=True)
    pp.add_argument("--path", required=True, help="Obsidian-style path, e.g. notes/hello")
    pp.add_argument("--title", required=True)
    pp.add_argument("--file", required=True, help="Markdown file")
    add_write_flags(pp)
    pp.set_defaults(fn=cmd_put_page)

    ls = sp.add_parser("list-pages", help="List pages in space (paginated)")
    ls.add_argument("--space-id", required=True)
    ls.add_argument("--limit", type=int, default=0)
    ls.add_argument("--offset", type=int, default=0)
    ls.set_defaults(fn=cmd_list_pages)

    gp = sp.add_parser("get-page", help="Get page by path (GET by-path)")
    gp.add_argument("--space-id", required=True)
    gp.add_argument("--path", required=True, help="Obsidian-style path, e.g. notes/hello")
    gp.set_defaults(fn=cmd_get_page)

    wf = sp.add_parser(
        "files",
        help=(
            "Stored files for the wiki space (vault imports incl. .md and images, "
            "manual uploads — not only attachments)"
        ),
    )
    wfs = wf.add_subparsers(dest="wiki_files_cmd", required=True)
    fl = wfs.add_parser(
        "list",
        help="List stored files (GET …/files); entries may include vault .md and other paths",
    )
    fl.add_argument("--space-id", required=True)
    fl.set_defaults(fn=cmd_files_list)
    fd = wfs.add_parser(
        "delete",
        help=(
            "Delete one stored file by id (DB + storage). "
            "Can remove vault-imported .md or assets, not just attachments"
        ),
    )
    fd.add_argument("--space-id", required=True)
    fd.add_argument("--file-id", required=True)
    add_write_flags(fd)
    fd.set_defaults(fn=cmd_files_delete)
