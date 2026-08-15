"""NDJSON Overview Designer chat (same dialect as map-html designer; A2UI via set_a2ui_messages)."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from openai import AsyncOpenAI

from app.services.agent.shared import (
    _wiki_agent_chat_extra_body,
    _wiki_use_llm_reasoning_content_shim,
)
from app.services.knowledge_map.knowledge_map_html import (
    _inject_reasoning_content_on_assistant_rows,
    _merge_stream_tool_call_slots,
    _reasoning_delta_append,
    _tool_calls_from_stream_slots,
)
from app.services.knowledge_map.knowledge_map_overview_a2ui import (
    KM_OVERVIEW_A2UI_CATALOG_ID,
    KM_OVERVIEW_A2UI_SURFACE_ID,
    validate_a2ui_messages_against_snapshot,
)

logger = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 8

_SET_A2UI_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "set_a2ui_messages",
        "description": (
            "Replace the Overview A2UI v0.9 message list (createSurface + updateComponents + optional "
            "updateDataModel). Use catalogId "
            f"'{KM_OVERVIEW_A2UI_CATALOG_ID}' and surfaceId '{KM_OVERVIEW_A2UI_SURFACE_ID}'. "
            "Must include component id 'root'. "
            "Column/Row/List use children:[id,...]. Card/Button use child:'oneId' (singular — never children). "
            "Custom: KmNodeLink {nodeId,label}, KmResourceLink {resourceType,resourceId,label,href}. "
            "Never invent node/resource ids."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "messages": {
                    "type": "array",
                    "description": "Full A2UI v0.9 server→client message list.",
                    "items": {"type": "object"},
                }
            },
            "required": ["messages"],
        },
    },
}

_SYSTEM = f"""You are **Knowledge Map Overview Designer** using **A2UI** (Agent-to-User Interface).

You reshape a navigable Overview: agent-driven UI as declarative A2UI JSON, rendered natively in the SPA.

You receive KNOWLEDGE_SNAPSHOT (tree, links, labels) and CURRENT_A2UI_MESSAGES.

Rules:
- Reply briefly in the user language, then call **set_a2ui_messages**.
- First message: createSurface surfaceId="{KM_OVERVIEW_A2UI_SURFACE_ID}" catalogId="{KM_OVERVIEW_A2UI_CATALOG_ID}".
- updateComponents **must** include id **"root"** (Column). SPA always mounts root.
- Layout props:
  - Column / Row / List → `children`: string[] of component ids
  - Card / Button → `child`: **one** string id (NOT children). To put multiple widgets in a Card, wrap them in a Column and pass that Column's id as `child`.
- Example Card: {{"id":"card-ai","component":"Card","child":"col-ai"}} with {{"id":"col-ai","component":"Column","children":["title-ai","link-ai"]}}
- Use KmNodeLink / KmResourceLink for navigation; Text for blurbs (plain string `text`).
- Never invent nodeId / resourceType / resourceId — only snapshot ids. Never emit HTML.
"""


def _trim_snapshot_for_prompt(snapshot: dict[str, Any], labels: dict[str, str]) -> str:
    payload = {
        "tree": snapshot.get("tree"),
        "links": snapshot.get("links"),
        "resource_labels": labels,
    }
    blob = json.dumps(payload, ensure_ascii=False, indent=2)
    if len(blob) > 100_000:
        return blob[:99_000] + "\n…(truncated)…"
    return blob


def last_user_content(messages: list[dict[str, str]]) -> str | None:
    for m in reversed(messages):
        if m.get("role") == "user":
            text = (m.get("content") or "").strip()
            return text or None
    return None


async def iter_overview_designer_chat_ndjson(
    conversation: list[dict[str, str]],
    snapshot: dict[str, Any],
    labels: dict[str, str],
    model_config: dict[str, str],
    *,
    working_a2ui_messages: list[dict[str, Any]] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Stream one designer turn as NDJSON dicts: ``delta``, ``tool_*``, ``done`` / raise."""
    base_url = (model_config.get("base_url") or "").rstrip("/")
    if not base_url:
        raise ValueError("LLM base_url is not configured")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    working: list[dict[str, Any]] = list(working_a2ui_messages or [])
    if working:
        working = validate_a2ui_messages_against_snapshot(working, snapshot)

    client = AsyncOpenAI(base_url=base_url, api_key=model_config.get("api_key") or "no-key")
    model_name = model_config.get("model_name", "gpt-4o-mini")
    use_shim = _wiki_use_llm_reasoning_content_shim(base_url)
    extra_body = _wiki_agent_chat_extra_body()

    openai_messages: list[dict[str, Any]] = [
        {"role": "system", "content": _SYSTEM},
        {
            "role": "user",
            "content": (
                "KNOWLEDGE_SNAPSHOT:\n"
                + _trim_snapshot_for_prompt(snapshot, labels)
                + "\n\nCURRENT_A2UI_MESSAGES:\n"
                + json.dumps(working, ensure_ascii=False, indent=2)[:80_000]
            ),
        },
    ]
    for msg in conversation[-32:]:
        role = msg.get("role")
        content = (msg.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        openai_messages.append({"role": role, "content": content[:48000]})

    if len(openai_messages) < 3:
        raise ValueError("Add at least one user message")

    last_text = ""
    for _round in range(_MAX_TOOL_ROUNDS):
        _inject_reasoning_content_on_assistant_rows(openai_messages, use_shim=use_shim)
        try:
            stream = await client.chat.completions.create(
                model=model_name,
                messages=openai_messages,
                tools=[_SET_A2UI_TOOL],
                tool_choice="auto",
                temperature=0.35,
                max_tokens=16384,
                extra_body=extra_body,
                stream=True,
            )
        except Exception as e:
            logger.error("overview designer LLM stream failed: %s", e)
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
        if not tool_calls_openai:
            yield {"type": "done", "content": content_buf, "a2ui_messages": working}
            return

        asst: dict[str, Any] = {
            "role": "assistant",
            "content": content_buf or "",
            "tool_calls": [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["function"]["name"],
                        "arguments": tc["function"]["arguments"],
                    },
                }
                for tc in tool_calls_openai
            ],
        }
        if use_shim:
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
            if name != "set_a2ui_messages":
                tool_payload_obj: dict[str, Any] = {"ok": False, "error": f"unknown tool: {name}"}
            else:
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                    raw_msgs = args.get("messages")
                    if not isinstance(raw_msgs, list):
                        raise ValueError("messages must be a list")
                    working = validate_a2ui_messages_against_snapshot(raw_msgs, snapshot)
                    tool_payload_obj = {"ok": True, "messages": working}
                except Exception as e:
                    tool_payload_obj = {"ok": False, "error": str(e)}
            tool_payload = json.dumps(tool_payload_obj, ensure_ascii=False)
            openai_messages.append({"role": "tool", "tool_call_id": tid, "content": tool_payload})
            # Client applies canvas from tool_end when ok+messages (A2UI has no HTML fence path).
            out = tool_payload
            if len(out) > 200_000:
                # Prefer sending messages separately via truncated ok payload size.
                slim = {
                    "ok": tool_payload_obj.get("ok"),
                    "error": tool_payload_obj.get("error"),
                    "messages": tool_payload_obj.get("messages") if tool_payload_obj.get("ok") else None,
                }
                out = json.dumps(slim, ensure_ascii=False)
            yield {"type": "tool_end", "run_id": tid, "name": name, "output": out}

    yield {"type": "done", "content": last_text, "a2ui_messages": working}
