"""LLM-generated static HTML snapshot for the Knowledge Map (term tree + resource links)."""

from __future__ import annotations

import hashlib
import html as html_stdlib
import json
import logging
import re
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

from openai import AsyncOpenAI
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_map import KnowledgeMapNode, KnowledgeMapResourceLink
from app.services.agent.wiki_runner import (
    _wiki_agent_chat_extra_body,
    _wiki_use_llm_reasoning_content_shim,
)

logger = logging.getLogger(__name__)

_HTML_CONTEXT_MAX = 120_000
_MAX_TOOL_RESULT_HTML = 150_000

_KM_PATCH_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "apply_html_patches",
        "description": (
            "Apply exact-string replacements to the current overview HTML (the same document shown in "
            "PUBLISHED_HTML / WORKING_HTML). Each `find` must appear exactly once. Run small, safe edits; "
            "order matters. After patching, still reply with prose and a full ```html … ``` block when you want the user to preview."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patches": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "find": {"type": "string", "description": "Exact substring to replace (unique match)."},
                            "replace": {"type": "string", "description": "Replacement string (may be empty)."},
                        },
                        "required": ["find", "replace"],
                    },
                }
            },
            "required": ["patches"],
        },
    },
}

_KM_NODE_TOKEN = re.compile(r"\{\{TAXONOMY_NODE:([a-zA-Z0-9_]+)\}\}")
_KM_RES_TOKEN = re.compile(r"\{\{RESOURCE:([^:}]+):([^}]+)\}\}")


def _build_tree_payload(
    nodes: list[KnowledgeMapNode],
    link_counts: dict[str, int],
    parent_id: str | None,
) -> list[dict[str, Any]]:
    children = [n for n in nodes if n.parent_id == parent_id]
    children.sort(key=lambda n: (n.sort_order, n.name))
    out: list[dict[str, Any]] = []
    for n in children:
        out.append(
            {
                "id": n.id,
                "name": n.name,
                "description": n.description,
                "sort_order": n.sort_order,
                "link_count": link_counts.get(n.id, 0),
                "children": _build_tree_payload(nodes, link_counts, n.id),
            }
        )
    return out


async def load_semantic_snapshot(db: AsyncSession) -> dict[str, Any]:
    """Canonical structure for hashing and LLM prompts (no timestamps)."""
    n_result = await db.execute(select(KnowledgeMapNode))
    nodes = list(n_result.scalars().all())
    link_counts: dict[str, int] = {}
    if nodes:
        ids = [n.id for n in nodes]
        lc_result = await db.execute(
            select(KnowledgeMapResourceLink.taxonomy_node_id).where(KnowledgeMapResourceLink.taxonomy_node_id.in_(ids))
        )
        for (nid,) in lc_result.all():
            link_counts[nid] = link_counts.get(nid, 0) + 1

    l_result = await db.execute(
        select(KnowledgeMapResourceLink).order_by(
            KnowledgeMapResourceLink.taxonomy_node_id,
            KnowledgeMapResourceLink.resource_type,
            KnowledgeMapResourceLink.resource_id,
        )
    )
    links = list(l_result.scalars().all())

    tree = _build_tree_payload(nodes, link_counts, None)
    flat_nodes = [
        {
            "id": n.id,
            "parent_id": n.parent_id,
            "name": n.name,
            "description": n.description,
            "sort_order": n.sort_order,
        }
        for n in sorted(nodes, key=lambda x: x.id)
    ]
    flat_links = [
        {
            "knowledge_map_node_id": r.taxonomy_node_id,
            "resource_type": r.resource_type,
            "resource_id": r.resource_id,
        }
        for r in links
    ]
    return {"tree": tree, "nodes": flat_nodes, "links": flat_links}


def semantic_content_hash(snapshot: dict[str, Any]) -> str:
    payload = {
        "nodes": snapshot["nodes"],
        "links": snapshot["links"],
    }
    blob = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


async def knowledge_map_nodes_last_modified_at(db: AsyncSession) -> datetime | None:
    """Latest Knowledge Map node edit (resource link rows have no updated_at; content_hash covers link changes)."""
    t = await db.scalar(select(sa_func.max(KnowledgeMapNode.updated_at)))
    return t


def _resource_href(frontend_base: str, resource_type: str, resource_id: str) -> str:
    base = frontend_base.rstrip("/")
    rid = quote(resource_id, safe="")
    if resource_type == "document_channel":
        return f"{base}/documents/channels/{rid}"
    if resource_type == "wiki_space":
        return f"{base}/wikis/{rid}/pages/graph"
    if resource_type == "article_channel":
        return f"{base}/articles/channels/{rid}"
    return f"{base}/articles"


def hydrate_placeholder_links(raw_html: str, snapshot: dict[str, Any], frontend_base: str) -> str:
    """Replace {{TAXONOMY_NODE:id}} and {{RESOURCE:type:id}} with safe anchor tags."""
    node_names = {n["id"]: n["name"] for n in snapshot["nodes"]}
    out = raw_html
    for nid, name in node_names.items():
        token = f"{{{{TAXONOMY_NODE:{nid}}}}}"
        if token not in out:
            continue
        href = f"{frontend_base.rstrip('/')}/knowledge-map?node={quote(nid, safe='')}"
        repl = f'<a class="km-node" href="{html_stdlib.escape(href, quote=True)}">{html_stdlib.escape(name)}</a>'
        out = out.replace(token, repl)
    for link in snapshot["links"]:
        rt = link["resource_type"]
        rid = link["resource_id"]
        token = f"{{{{RESOURCE:{rt}:{rid}}}}}"
        if token not in out:
            continue
        href = _resource_href(frontend_base, rt, rid)
        label = f"{rt}: {rid}"
        repl = f'<a class="km-res" href="{html_stdlib.escape(href, quote=True)}">{html_stdlib.escape(label)}</a>'
        out = out.replace(token, repl)
    return out


def sanitize_html_document(raw: str) -> str:
    import nh3

    allowed_tags = frozenset(
        {
            "html",
            "head",
            "meta",
            "title",
            "body",
            "main",
            "header",
            "footer",
            "section",
            "article",
            "nav",
            "h1",
            "h2",
            "h3",
            "h4",
            "p",
            "ul",
            "ol",
            "li",
            "a",
            "strong",
            "em",
            "span",
            "div",
            "table",
            "thead",
            "tbody",
            "tr",
            "th",
            "td",
            "br",
            "hr",
            "style",
        }
    )
    common = frozenset({"class", "id"})
    attributes: dict[str, frozenset[str]] = {
        "a": frozenset({"href", "class", "id", "title", "rel", "target"}),
        "meta": frozenset({"charset", "name", "content"}),
        "style": frozenset({"type"}),
        "html": frozenset({"class", "id", "lang"}),
    }
    for tag in allowed_tags:
        if tag not in attributes:
            attributes[tag] = common
    return nh3.clean(
        raw,
        tags=allowed_tags,
        # nh3/ammonia default ``CLEAN_CONTENT_TAGS`` includes ``style``; our ``tags`` also
        # lists ``style`` for Knowledge Map CSS — passing an empty set avoids the panic:
        # "style appears in clean_content_tags and in tags at the same time".
        clean_content_tags=frozenset(),
        attributes=attributes,
        url_schemes={"http", "https", "mailto"},
        # We allow ``rel`` on ``<a>``; nh3 otherwise injects ``link_rel`` and errors.
        link_rel=None,
    )


_EMPTY_KM_DOC = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Knowledge Map</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;max-width:960px;line-height:1.5}</style></head>
<body><main><p>No terms yet. Add terms on the Knowledge Map page, then regenerate this HTML snapshot.</p></main></body></html>"""


def static_html_for_empty_knowledge_map() -> str:
    return sanitize_html_document(_EMPTY_KM_DOC)


_KM_HTML_SYSTEM = """You write a single self-contained HTML5 page for an internal "Knowledge Map" (hierarchical terms + links to content).

Output rules (strict):
- Return ONLY the HTML document (no markdown fences, no commentary).
- Start with <!DOCTYPE html>.
- Include <head><meta charset="utf-8"><title>…</title> and a compact <style> for readability (system fonts, max-width ~960px, sensible spacing). No @import.
- No <script>, <iframe>, <object>, <embed>, <form>, <input>, <button>, SVG, or inline event handlers (onclick=, etc.).
- Use placeholders exactly as given for links — do not invent ids or resource pairs:
  - Knowledge Map term: {{TAXONOMY_NODE:<id>}} (use the exact id strings from PLACEHOLDERS).
  - Resource: {{RESOURCE:<resource_type>:<resource_id>}} (use exact tuples from PLACEHOLDERS).
- Reflect the tree structure from JSON.tree (parent/child). Summarize long descriptions briefly in prose; do not dump raw JSON.

LANGUAGE: Write concise section headings and short intro copy in the same language as the majority of term names (Chinese if most names contain CJK, otherwise English)."""


def _placeholder_cheatsheet(snapshot: dict[str, Any]) -> str:
    lines: list[str] = []
    for n in snapshot["nodes"]:
        nid = n["id"]
        name = n["name"]
        token = "{{TAXONOMY_NODE:" + nid + "}}"
        lines.append(f'- Term "{name}" → {token}')
    for link in snapshot["links"]:
        rt = link["resource_type"]
        rid = link["resource_id"]
        tn = link["knowledge_map_node_id"]
        res_token = "{{RESOURCE:" + rt + ":" + rid + "}}"
        lines.append(f'- Linked resource ({rt} {rid}) under node {tn} → {res_token}')
    return "\n".join(lines[:400])


def _trim_tree_for_prompt(tree: list[dict[str, Any]], max_desc: int = 400) -> list[dict[str, Any]]:
    def walk(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out2: list[dict[str, Any]] = []
        for n in nodes:
            d = n.get("description")
            if isinstance(d, str) and len(d) > max_desc:
                d = d[: max_desc - 1] + "…"
            out2.append(
                {
                    "id": n["id"],
                    "name": n["name"],
                    "description": d,
                    "sort_order": n["sort_order"],
                    "link_count": n["link_count"],
                    "children": walk(n.get("children") or []),
                }
            )
        return out2

    return walk(tree)


async def generate_static_html_via_llm(snapshot: dict[str, Any], model_config: dict[str, str]) -> str:
    base_url = (model_config.get("base_url") or "").rstrip("/")
    if not base_url:
        raise ValueError("LLM base_url is not configured")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"
    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )
    model_name = model_config.get("model_name", "gpt-4o-mini")
    prompt_obj = {
        "tree": _trim_tree_for_prompt(snapshot["tree"]),
        "links": snapshot["links"],
        "PLACEHOLDERS": _placeholder_cheatsheet(snapshot),
    }
    user = json.dumps(prompt_obj, ensure_ascii=False, indent=2)

    try:
        response = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": _KM_HTML_SYSTEM},
                {"role": "user", "content": user},
            ],
            temperature=0.35,
            max_tokens=8192,
        )
    except Exception as e:
        logger.error("knowledge map html LLM call failed: %s", e)
        raise

    content = response.choices[0].message.content or ""
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```[a-zA-Z0-9]*\s*", "", content)
        content = re.sub(r"\s*```\s*$", "", content)
    return content.strip()


def _truncate_for_designer_context(s: str | None, max_chars: int = _HTML_CONTEXT_MAX) -> str:
    if not s or not s.strip():
        return ""
    t = s.strip()
    if len(t) <= max_chars:
        return t
    return t[: max_chars - 24] + "\n…(truncated for context)…\n"


def _apply_html_patches_to_document(html: str, patches: list[dict[str, Any]]) -> tuple[str, str | None]:
    out = html
    for i, p in enumerate(patches):
        find = p.get("find")
        repl = p.get("replace")
        if not isinstance(find, str) or find == "":
            return out, f"patch[{i}]: empty find"
        if not isinstance(repl, str):
            return out, f"patch[{i}]: replace must be a string"
        c = out.count(find)
        if c == 0:
            return out, f"patch[{i}]: find not found (exact match required)"
        if c > 1:
            return out, f"patch[{i}]: find matched {c} times (must be unique)"
        out = out.replace(find, repl, 1)
    return out, None


def _designer_context_appendix(published_html: str | None, working_html: str | None) -> str:
    pub_st = (published_html or "").strip()
    work_st = (working_html or "").strip()
    pub = _truncate_for_designer_context(pub_st)
    work_trunc = _truncate_for_designer_context(work_st)
    parts: list[str] = []
    if pub_st:
        parts.append(
            "PUBLISHED_HTML_IN_DATABASE (current saved overview; **edit this in place** when the user asks for changes, "
            "unless they explicitly want a brand-new page):\n"
            + pub
        )
    else:
        parts.append("PUBLISHED_HTML_IN_DATABASE: (none — no saved overview yet.)")
    if work_st and work_st != pub_st:
        parts.append(
            "WORKING_HTML_FROM_CLIENT (latest draft from the UI, including unpublished edits; prefer this as the "
            "baseline when it differs from published):\n"
            + work_trunc
        )
    elif work_st and work_st == pub_st:
        parts.append(
            "WORKING_HTML_FROM_CLIENT: same as published (user is viewing the saved version in the editor context)."
        )
    else:
        parts.append("WORKING_HTML_FROM_CLIENT: (not supplied — use published HTML if any.)")
    return "\n\n".join(parts)


_KM_HTML_DESIGNER_SYSTEM = """You are **Knowledge Map Designer**, helping the user iterate on one static HTML overview page for their Knowledge Map (hierarchical terms + links to channels and wiki spaces).

You will receive:
- KNOWLEDGE_SNAPSHOT (JSON) with `tree`, `links`, and `PLACEHOLDERS` (authoritative ids).
- PUBLISHED_HTML_IN_DATABASE and/or WORKING_HTML_FROM_CLIENT (see below).

**Response style (Claude-style artifacts):**
- Always write normal **prose first** (questions, explanations, what changed).
- When you want the user to see an HTML page, include **one** markdown fenced block: opening line is three grave accents + `html`, then the document, then a closing line of three grave accents alone. The client renders only that fenced region as a live preview.
- If you only need a small edit to the current document, you may call **`apply_html_patches`** instead of pasting the whole file again — then still follow up with a short message; include a fresh full fenced `html` block when it helps the user preview.

**Tool `apply_html_patches`:**
- Each patch is `{ "find": "...", "replace": "..." }` with **exact** `find` (must occur **exactly once** in the current HTML working copy).
- Patches run in order on the server’s working copy for this request.

**HTML rules (production):**
- `<!DOCTYPE html>`, `<head><meta charset="utf-8"><title>…</title>`, compact `<style>` (no `@import`).
- No `<script>`, `<iframe>`, `<form>`, `<input>`, `<button>`, SVG, or inline event handlers.
- Links: only placeholders from PLACEHOLDERS: `{{TAXONOMY_NODE:<id>}}` and `{{RESOURCE:<type>:<id>}}` (for new drafts). Saved pages in the database may already contain real `href` values — keep those when editing.

LANGUAGE: Match the dominant language of term names (CJK-heavy → Chinese; else English) unless the user asks otherwise."""


def _snapshot_json_for_designer(snapshot: dict[str, Any]) -> str:
    prompt_obj = {
        "tree": _trim_tree_for_prompt(snapshot["tree"]),
        "links": snapshot["links"],
        "PLACEHOLDERS": _placeholder_cheatsheet(snapshot),
    }
    return json.dumps(prompt_obj, ensure_ascii=False, indent=2)


def _reasoning_content_from_completion_message(msg: Any) -> str | None:
    """Extract provider thinking payload for OpenAI-compat round-trip (may live on model_extra)."""
    rc = getattr(msg, "reasoning_content", None)
    if rc is None and hasattr(msg, "model_extra") and isinstance(msg.model_extra, dict):
        raw = msg.model_extra.get("reasoning_content")
        rc = raw if raw is not None else None
    if rc is None:
        return None
    if isinstance(rc, str):
        return rc
    return str(rc)


def _inject_reasoning_content_on_assistant_rows(messages: list[dict[str, Any]], *, use_shim: bool) -> None:
    """Match wiki copilot: some gateways require ``reasoning_content`` on every assistant row in tool loops."""
    if not use_shim:
        return
    for row in messages:
        if isinstance(row, dict) and row.get("role") == "assistant":
            row["reasoning_content"] = row.get("reasoning_content") or ""


def _tool_result_payload_for_html(html: str) -> str:
    if len(html) <= _MAX_TOOL_RESULT_HTML:
        return json.dumps({"ok": True, "html": html})
    half = _MAX_TOOL_RESULT_HTML // 2
    return json.dumps(
        {
            "ok": True,
            "truncated": True,
            "head": html[:half],
            "tail": html[-half:],
            "length": len(html),
        }
    )


async def designer_chat_via_llm(
    conversation: list[dict[str, str]],
    snapshot: dict[str, Any],
    model_config: dict[str, str],
    *,
    published_html: str | None = None,
    working_html: str | None = None,
) -> str:
    """Multi-turn chat with optional apply_html_patches tool; returns final assistant text (may include a fenced html block)."""
    base_url = (model_config.get("base_url") or "").rstrip("/")
    if not base_url:
        raise ValueError("LLM base_url is not configured")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"
    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )
    model_name = model_config.get("model_name", "gpt-4o-mini")

    pub_st = (published_html or "").strip()
    work_st = (working_html or "").strip()
    if work_st:
        mutable_html = work_st
    elif pub_st:
        mutable_html = pub_st
    else:
        mutable_html = ""

    system = (
        _KM_HTML_DESIGNER_SYSTEM
        + "\n\n"
        + _designer_context_appendix(published_html, working_html)
        + "\n\nKNOWLEDGE_SNAPSHOT (JSON):\n"
        + _snapshot_json_for_designer(snapshot)
    )

    openai_messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for msg in conversation[-32:]:
        role = msg.get("role")
        content = (msg.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        openai_messages.append({"role": role, "content": content[:48000]})

    if len(openai_messages) < 2:
        raise ValueError("Add at least one user message")

    extra_body = _wiki_agent_chat_extra_body()
    use_rc_shim = _wiki_use_llm_reasoning_content_shim(base_url)

    last_text = ""
    for _round in range(10):
        _inject_reasoning_content_on_assistant_rows(openai_messages, use_shim=use_rc_shim)
        try:
            response = await client.chat.completions.create(
                model=model_name,
                messages=openai_messages,
                tools=[_KM_PATCH_TOOL],
                tool_choice="auto",
                temperature=0.45,
                max_tokens=16384,
                extra_body=extra_body,
            )
        except Exception as e:
            logger.error("knowledge map designer LLM call failed: %s", e)
            raise

        msg = response.choices[0].message
        text = (msg.content or "").strip()
        if text:
            last_text = text

        if not msg.tool_calls:
            return text

        asst: dict[str, Any] = {
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
                if tc.function
            ],
        }
        rc = _reasoning_content_from_completion_message(msg)
        if use_rc_shim:
            asst["reasoning_content"] = rc if rc is not None else ""
        elif rc is not None:
            asst["reasoning_content"] = rc
        openai_messages.append(asst)

        for tc in msg.tool_calls:
            if not tc.function:
                tool_payload = json.dumps({"ok": False, "error": "missing function on tool call"})
                openai_messages.append({"role": "tool", "tool_call_id": tc.id, "content": tool_payload})
                continue
            if tc.function.name != "apply_html_patches":
                tool_payload = json.dumps({"ok": False, "error": f"unknown tool: {tc.function.name}"})
            else:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                    patches = args.get("patches") or []
                    if not isinstance(patches, list):
                        raise ValueError("patches must be a list")
                    mutable_html, err = _apply_html_patches_to_document(mutable_html, patches)
                    if err:
                        tool_payload = json.dumps({"ok": False, "error": err})
                    else:
                        tool_payload = _tool_result_payload_for_html(mutable_html)
                except Exception as e:
                    tool_payload = json.dumps({"ok": False, "error": str(e)})
            openai_messages.append({"role": "tool", "tool_call_id": tc.id, "content": tool_payload})

    return last_text


def _merge_stream_tool_call_slots(slots: dict[int, dict[str, str]], delta_tool_calls: list[Any] | None) -> None:
    if not delta_tool_calls:
        return
    for tc in delta_tool_calls:
        idx = 0 if getattr(tc, "index", None) is None else int(tc.index)
        row = slots.setdefault(idx, {"id": "", "name": "", "arguments": ""})
        tid = getattr(tc, "id", None)
        if isinstance(tid, str) and tid.strip():
            row["id"] = tid.strip()
        fn = getattr(tc, "function", None)
        if fn is None:
            continue
        nm = getattr(fn, "name", None)
        if isinstance(nm, str) and nm.strip():
            row["name"] = nm.strip()
        args = getattr(fn, "arguments", None)
        if isinstance(args, str) and args:
            row["arguments"] += args


def _tool_calls_from_stream_slots(slots: dict[int, dict[str, str]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for idx in sorted(slots.keys()):
        s = slots[idx]
        name = (s.get("name") or "").strip()
        if not name:
            continue
        tid = (s.get("id") or "").strip() or f"call_{idx}"
        args = s.get("arguments") or ""
        out.append({"id": tid, "type": "function", "function": {"name": name, "arguments": args}})
    return out


def _reasoning_delta_append(buf: str, delta: Any) -> str:
    chunk = getattr(delta, "reasoning_content", None)
    if isinstance(chunk, str) and chunk:
        return buf + chunk
    ex = getattr(delta, "model_extra", None)
    if isinstance(ex, dict):
        inner = ex.get("reasoning_content")
        if isinstance(inner, str) and inner:
            return buf + inner
    return buf


async def iter_designer_chat_llm_stream_events(
    conversation: list[dict[str, str]],
    snapshot: dict[str, Any],
    model_config: dict[str, str],
    *,
    published_html: str | None = None,
    working_html: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Stream one designer turn as NDJSON-shaped dicts: ``delta``, ``tool_*``, ``done`` / ``error``."""
    base_url = (model_config.get("base_url") or "").rstrip("/")
    if not base_url:
        raise ValueError("LLM base_url is not configured")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"
    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )
    model_name = model_config.get("model_name", "gpt-4o-mini")

    pub_st = (published_html or "").strip()
    work_st = (working_html or "").strip()
    if work_st:
        mutable_html = work_st
    elif pub_st:
        mutable_html = pub_st
    else:
        mutable_html = ""

    system = (
        _KM_HTML_DESIGNER_SYSTEM
        + "\n\n"
        + _designer_context_appendix(published_html, working_html)
        + "\n\nKNOWLEDGE_SNAPSHOT (JSON):\n"
        + _snapshot_json_for_designer(snapshot)
    )

    openai_messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for msg in conversation[-32:]:
        role = msg.get("role")
        content = (msg.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        openai_messages.append({"role": role, "content": content[:48000]})

    if len(openai_messages) < 2:
        raise ValueError("Add at least one user message")

    extra_body = _wiki_agent_chat_extra_body()
    use_rc_shim = _wiki_use_llm_reasoning_content_shim(base_url)

    last_text = ""
    for _round in range(10):
        _inject_reasoning_content_on_assistant_rows(openai_messages, use_shim=use_rc_shim)
        try:
            stream = await client.chat.completions.create(
                model=model_name,
                messages=openai_messages,
                tools=[_KM_PATCH_TOOL],
                tool_choice="auto",
                temperature=0.45,
                max_tokens=16384,
                extra_body=extra_body,
                stream=True,
            )
        except Exception as e:
            logger.error("knowledge map designer LLM stream failed: %s", e)
            raise

        content_buf = ""
        tool_slots: dict[int, dict[str, str]] = {}
        reasoning_buf = ""
        finish_reason: str | None = None

        async for event in stream:
            if not event.choices:
                continue
            ch0 = event.choices[0]
            if ch0.finish_reason:
                finish_reason = ch0.finish_reason
            delta = ch0.delta
            if delta is None:
                continue
            reasoning_buf = _reasoning_delta_append(reasoning_buf, delta)
            if delta.content:
                content_buf += delta.content
                yield {"type": "delta", "t": delta.content}
            _merge_stream_tool_call_slots(tool_slots, delta.tool_calls)

        text = content_buf.strip()
        if text:
            last_text = text

        tool_calls_openai = _tool_calls_from_stream_slots(tool_slots)
        if finish_reason == "tool_calls" and not tool_calls_openai:
            raise ValueError("Designer stream ended with tool_calls but incomplete tool call data")
        wants_tools = bool(tool_calls_openai)
        if not wants_tools:
            yield {"type": "done", "content": content_buf}
            return

        asst: dict[str, Any] = {
            "role": "assistant",
            "content": content_buf or "",
            "tool_calls": [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["function"]["name"], "arguments": tc["function"]["arguments"]},
                }
                for tc in tool_calls_openai
            ],
        }
        if use_rc_shim:
            asst["reasoning_content"] = reasoning_buf if reasoning_buf else ""
        elif reasoning_buf:
            asst["reasoning_content"] = reasoning_buf
        openai_messages.append(asst)

        for tc in tool_calls_openai:
            fn = tc.get("function") or {}
            name = str(fn.get("name") or "")
            tid = str(tc.get("id") or "")
            args_preview = str(fn.get("arguments") or "")[:6000]
            yield {"type": "tool_start", "run_id": tid, "name": name, "input": args_preview}
            if name != "apply_html_patches":
                tool_payload = json.dumps({"ok": False, "error": f"unknown tool: {name}"})
            else:
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                    patches = args.get("patches") or []
                    if not isinstance(patches, list):
                        raise ValueError("patches must be a list")
                    mutable_html, err = _apply_html_patches_to_document(mutable_html, patches)
                    if err:
                        tool_payload = json.dumps({"ok": False, "error": err})
                    else:
                        tool_payload = _tool_result_payload_for_html(mutable_html)
                except Exception as e:
                    tool_payload = json.dumps({"ok": False, "error": str(e)})
            openai_messages.append({"role": "tool", "tool_call_id": tid, "content": tool_payload})
            yield {
                "type": "tool_end",
                "run_id": tid,
                "name": name,
                "output": tool_payload[:12_000] if len(tool_payload) > 12_000 else tool_payload,
            }

    yield {"type": "done", "content": last_text}


def assert_no_unresolved_placeholders(document: str) -> None:
    if _KM_NODE_TOKEN.search(document) or _KM_RES_TOKEN.search(document):
        raise ValueError("Generated HTML still contains unresolved {{TAXONOMY_NODE:…}} or {{RESOURCE:…}} placeholders")


def finalize_html_document(raw_llm: str, snapshot: dict[str, Any], frontend_base: str) -> str:
    hydrated = hydrate_placeholder_links(raw_llm, snapshot, frontend_base)
    assert_no_unresolved_placeholders(hydrated)
    return sanitize_html_document(hydrated)
