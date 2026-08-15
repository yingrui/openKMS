"""media-channels + media — library channels, upload, generate."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def _parse_json_arg(label: str, value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError as e:
        print(f"--{label}: invalid JSON ({e})", file=sys.stderr)
        sys.exit(2)


# --- media-channels ---


def cmd_channels_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/media-channels")
    r.raise_for_status()
    print_json(r.json())


def cmd_channels_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name}
    if ns.description:
        body["description"] = ns.description
    if ns.parent_id:
        body["parent_id"] = ns.parent_id
    if ns.sort_order is not None:
        body["sort_order"] = ns.sort_order
    confirm_or_abort(
        "create media channel",
        "POST",
        "/api/media-channels",
        body,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/media-channels", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_channels_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.name is not None:
        body["name"] = ns.name
    if ns.description is not None:
        body["description"] = ns.description
    if ns.parent_id is not None:
        body["parent_id"] = ns.parent_id
    if ns.sort_order is not None:
        body["sort_order"] = ns.sort_order
    if not body:
        print("update: nothing to update", file=sys.stderr)
        sys.exit(2)
    path = f"/api/media-channels/{ns.id}"
    confirm_or_abort("update media channel", "PUT", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_channels_delete(ns: argparse.Namespace) -> None:
    path = f"/api/media-channels/{ns.id}"
    confirm_or_abort("delete media channel", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted media channel {ns.id}")


# --- media ---


def cmd_media_list(ns: argparse.Namespace) -> None:
    params: dict[str, str] = {}
    if ns.channel_id:
        params["channel_id"] = ns.channel_id
    if ns.media_kind:
        params["media_kind"] = ns.media_kind
    if ns.search:
        params["search"] = ns.search
    with client() as s:
        r = s.get("/api/media", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_media_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/media/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_media_upload(ns: argparse.Namespace) -> None:
    path_file = Path(ns.file)
    if not path_file.is_file():
        print(f"file not found: {ns.file}", file=sys.stderr)
        sys.exit(2)
    summary = {
        "channel_id": ns.channel_id,
        "file": str(path_file),
        "title": ns.title,
        "description": ns.description,
    }
    confirm_or_abort(
        "upload media",
        "POST",
        "/api/media/upload",
        summary,
        ns.yes,
        ns.dry_run,
    )
    data = {"channel_id": ns.channel_id}
    if ns.title:
        data["title"] = ns.title
    if ns.description:
        data["description"] = ns.description
    with client() as s:
        with path_file.open("rb") as f:
            r = s.post(
                "/api/media/upload",
                data=data,
                files={"file": (path_file.name, f)},
            )
    r.raise_for_status()
    print_json(r.json())


def cmd_media_generate(ns: argparse.Namespace) -> None:
    body = _parse_json_arg("body-json", ns.body_json) if ns.body_json else {}
    if ns.channel_id:
        body["channel_id"] = ns.channel_id
    if ns.prompt:
        body["prompt"] = ns.prompt
    confirm_or_abort(
        "queue media generate",
        "POST",
        "/api/media/generate",
        body,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/media/generate", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_media_patch(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.title is not None:
        body["title"] = ns.title
    if ns.description is not None:
        body["description"] = ns.description
    if ns.channel_id is not None:
        body["channel_id"] = ns.channel_id
    if not body:
        print("patch: nothing to update", file=sys.stderr)
        sys.exit(2)
    path = f"/api/media/{ns.id}"
    confirm_or_abort("patch media", "PATCH", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_media_delete(ns: argparse.Namespace) -> None:
    path = f"/api/media/{ns.id}"
    confirm_or_abort("delete media", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted media {ns.id}")


def add_media_channels_subparser(sub) -> None:
    p = sub.add_parser("media-channels", help="Media library channels")
    sp = p.add_subparsers(dest="mc_cmd", required=True)

    sp.add_parser("list", help="List media channels").set_defaults(fn=cmd_channels_list)

    cr = sp.add_parser("create", help="Create media channel")
    cr.add_argument("--name", required=True)
    cr.add_argument("--description", default="")
    cr.add_argument("--parent-id", default="")
    cr.add_argument("--sort-order", type=int, default=None)
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_channels_create)

    up = sp.add_parser("update", help="Update media channel")
    up.add_argument("--id", required=True)
    up.add_argument("--name", default=None)
    up.add_argument("--description", default=None)
    up.add_argument("--parent-id", default=None)
    up.add_argument("--sort-order", type=int, default=None)
    add_write_flags(up)
    up.set_defaults(fn=cmd_channels_update)

    dl = sp.add_parser("delete", help="Delete empty media channel")
    dl.add_argument("--id", required=True)
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_channels_delete)


def add_media_subparser(sub) -> None:
    p = sub.add_parser("media", help="Media library items")
    sp = p.add_subparsers(dest="media_cmd", required=True)

    ls = sp.add_parser("list", help="List media")
    ls.add_argument("--channel-id", default=None)
    ls.add_argument("--media-kind", default=None)
    ls.add_argument("--search", default=None)
    ls.set_defaults(fn=cmd_media_list)

    gt = sp.add_parser("get", help="Get media item")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_media_get)

    up = sp.add_parser("upload", help="Upload media file")
    up.add_argument("--channel-id", required=True)
    up.add_argument("--file", required=True)
    up.add_argument("--title", default="")
    up.add_argument("--description", default="")
    add_write_flags(up)
    up.set_defaults(fn=cmd_media_upload)

    gen = sp.add_parser("generate", help="Queue image/video generation (POST /api/media/generate)")
    gen.add_argument("--channel-id", default=None)
    gen.add_argument("--prompt", default=None)
    gen.add_argument(
        "--body-json",
        default=None,
        help="Full JSON body (merged with --channel-id / --prompt when set)",
    )
    add_write_flags(gen)
    gen.set_defaults(fn=cmd_media_generate)

    pt = sp.add_parser("patch", help="Patch media metadata")
    pt.add_argument("--id", required=True)
    pt.add_argument("--title", default=None)
    pt.add_argument("--description", default=None)
    pt.add_argument("--channel-id", default=None)
    add_write_flags(pt)
    pt.set_defaults(fn=cmd_media_patch)

    dl = sp.add_parser("delete", help="Delete media item")
    dl.add_argument("--id", required=True)
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_media_delete)
