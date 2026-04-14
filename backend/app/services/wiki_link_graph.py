"""Extract inter-page links from wiki markdown and build a graph payload.

Resolution rules mirror frontend ``wikiPreviewMarkdown.ts`` (wikilinks + relative paths).
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import PurePosixPath
from typing import Any

from app.models.wiki_models import WikiPage
from app.services.wiki_vault_import import join_and_norm_dir_rel, md_relative_path_to_wiki_path


def link_graph_cache_key(space_id: str) -> str:
    return f"wiki/{space_id}/link-graph.json"


def normalize_wiki_path_str(p: str) -> str:
    """Match frontend ``normalizeWikiPath``."""
    t = p.strip().strip("/")
    while "//" in t:
        t = t.replace("//", "/")
    return t


def _try_wikilink_path_variants(t: str, norm_to_id: dict[str, str]) -> str | None:
    if not t:
        return None
    hit = norm_to_id.get(t)
    if hit:
        return hit
    if t.lower().endswith(".md"):
        hit = norm_to_id.get(t[: -len(".md")])
        if hit:
            return hit
        hit = norm_to_id.get(normalize_wiki_path_str(t[: -len(".md")]))
        if hit:
            return hit
    if not t.startswith("wiki/"):
        hit = norm_to_id.get(normalize_wiki_path_str(f"wiki/{t}"))
        if hit:
            return hit
    else:
        hit = norm_to_id.get(normalize_wiki_path_str(t[len("wiki/") :]))
        if hit:
            return hit
    return None


def find_page_id_by_wikilink_target(target: str, norm_to_id: dict[str, str]) -> str | None:
    """Map ``[[target]]`` text to page id (same semantics as frontend ``findPageIdByWikilinkTarget``)."""
    raw = target.strip()
    if not raw:
        return None
    pipe = raw.find("|")
    path_part = (raw[:pipe] if pipe >= 0 else raw).strip()
    if not path_part:
        return None
    t = normalize_wiki_path_str(path_part)
    return _try_wikilink_path_variants(t, norm_to_id)


_WIKILINK = re.compile(r"(?<!!)\[\[([^\]]+)\]\]")
# Non-image markdown links [text](href)
_MD_LINK = re.compile(r"(?<!!)\[([^\]]*)\]\(([^)]+)\)")


def _wiki_path_parent_dir(wiki_path: str) -> str:
    parent = PurePosixPath(wiki_path).parent
    s = str(parent)
    if s == ".":
        return ""
    return s.replace("\\", "/")


def _skip_href(href: str) -> bool:
    h = href.strip()
    if not h:
        return True
    if h.startswith(("http://", "https://", "mailto:", "data:", "/api/")):
        return True
    # Same-page or fragment-only
    if h.startswith("#"):
        return True
    return False


def _resolve_href_to_wiki_paths(href: str, note_dir: str) -> list[str]:
    """Resolve a relative markdown href to candidate wiki paths (no leading slash)."""
    h = href.strip().split("?", 1)[0].split("#", 1)[0].strip()
    if not h or _skip_href(h):
        return []
    resolved = join_and_norm_dir_rel(note_dir, h) if note_dir else join_and_norm_dir_rel("", h)
    if not resolved:
        return []
    norm = md_relative_path_to_wiki_path(resolved)
    if not norm:
        return []
    return [normalize_wiki_path_str(norm)]


def _lines_skipping_fenced_code(body: str) -> list[tuple[int, str]]:
    """Yield (line_num, line) for lines outside fenced ``` blocks."""
    lines = body.splitlines()
    out: list[tuple[int, str]] = []
    in_fence = False
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence:
            out.append((i, line))
    return out


def extract_outgoing_targets_for_page(source_wiki_path: str, body: str) -> list[str]:
    """Return resolved wiki path strings (targets that exist as pages) — caller filters by index."""
    note_dir = _wiki_path_parent_dir(source_wiki_path)
    raw_targets: list[str] = []

    for _ln, line in _lines_skipping_fenced_code(body or ""):
        for m in _WIKILINK.finditer(line):
            inner = m.group(1).strip()
            if inner:
                raw_targets.append(inner)
        for m in _MD_LINK.finditer(line):
            href = m.group(2)
            for p in _resolve_href_to_wiki_paths(href, note_dir):
                raw_targets.append(p)

    return raw_targets


def build_link_graph_payload(
    pages: list[WikiPage],
) -> dict[str, Any]:
    """Build { source_max_updated_at, nodes, links } for JSON serialization."""
    norm_to_id: dict[str, str] = {}
    for p in pages:
        norm_to_id[normalize_wiki_path_str(p.path)] = p.id

    max_u: datetime | None = None
    for p in pages:
        if max_u is None or p.updated_at > max_u:
            max_u = p.updated_at

    nodes = [{"id": p.id, "path": p.path, "title": p.title} for p in pages]
    edge_set: set[tuple[str, str]] = set()

    for p in pages:
        targets = extract_outgoing_targets_for_page(p.path, p.body or "")
        for tgt in targets:
            tid = find_page_id_by_wikilink_target(tgt, norm_to_id)
            if tid is None:
                # Try resolved path string directly (already wiki path)
                nt = normalize_wiki_path_str(tgt)
                tid = norm_to_id.get(nt)
            if tid is None:
                continue
            if tid != p.id:
                edge_set.add((p.id, tid))

    links = [{"source": a, "target": b} for a, b in sorted(edge_set)]

    payload: dict[str, Any] = {
        "nodes": nodes,
        "links": links,
    }
    if max_u is not None:
        payload["source_max_updated_at"] = max_u.isoformat()
    return payload


def graph_payload_to_json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def graph_payload_from_json_bytes(raw: bytes) -> dict[str, Any]:
    return json.loads(raw.decode("utf-8"))
