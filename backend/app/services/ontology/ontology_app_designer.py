"""NDJSON Ontology App Designer chat (set_bindings + set_a2ui_messages)."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
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
from app.services.ontology.ontology_app_a2ui import (
    ONTOLOGY_APP_A2UI_CATALOG_ID,
    ONTOLOGY_APP_A2UI_SURFACE_ID,
    bindings_board_ready,
    synthesize_status_board_a2ui_messages,
    validate_ontology_app_a2ui_messages,
)

logger = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 8

ApplyBindingsFn = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]

_SET_BINDINGS_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "set_bindings",
        "description": (
            "Link the app to existing ontology api names from ONTOLOGY_SNAPSHOT. "
            "Does not create Object Types, Actions, or Functions. "
            "Required: objectType, columnProperty, columns (array of strings), cardTitleProperty. "
            "Optional: createAction, updateAction, setStatusAction, deleteAction, suggestFunction. "
            "On success the server stores bindings and synthesizes a board A2UI draft."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "objectType": {"type": "string"},
                "columnProperty": {"type": "string"},
                "columns": {"type": "array", "items": {"type": "string"}},
                "cardTitleProperty": {"type": "string"},
                "createAction": {"type": "string"},
                "updateAction": {"type": "string"},
                "setStatusAction": {"type": "string"},
                "deleteAction": {"type": "string"},
                "suggestFunction": {"type": "string"},
            },
            "required": ["objectType", "columnProperty", "columns", "cardTitleProperty"],
        },
    },
}

_SET_A2UI_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "set_a2ui_messages",
        "description": (
            "Replace the Ontology App A2UI v0.9 message list. Use catalogId "
            f"'{ONTOLOGY_APP_A2UI_CATALOG_ID}' and surfaceId '{ONTOLOGY_APP_A2UI_SURFACE_ID}'. "
            "Must include component id 'root'. "
            "Column/Row/List use children:[id,...]. Card/Button use child:'oneId'. "
            "Custom: OntoKanbanBoard (objectType, columnProperty, columns CSV, cardTitleProperty, "
            "createAction, updateAction, setStatusAction, deleteAction, suggestFunction), "
            "OntoActionButton, OntoFunctionButton, OntoObjectLink. "
            "Only use api_names from BINDINGS. Call set_bindings first if BINDINGS are empty."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "messages": {
                    "type": "array",
                    "items": {"type": "object"},
                }
            },
            "required": ["messages"],
        },
    },
}

_SYSTEM = f"""You are **Ontology App Designer** using **A2UI**.

You help the author build an ontology-backed app UI by **linking** existing Object Types, Actions, and Functions — never invent or create them.

Rules:
- Reply briefly in the user language.
- Use ONTOLOGY_SNAPSHOT to pick real api names. If something is missing, tell the user to create it in Ontology Manager or Function Editor.
- When bindings are empty or incomplete, call **set_bindings** with objectType, columnProperty, columns, cardTitleProperty, and any Actions/FoO from the snapshot.
- **columns** must be the exact stored property values used in filters and Actions (e.g. backlog, in_progress, done) — never display labels like "To Do" unless those strings are what instances actually store.
- After bindings exist, call **set_a2ui_messages** to reshape layout if needed (or rely on the synthesized board from set_bindings).
- createSurface surfaceId="{ONTOLOGY_APP_A2UI_SURFACE_ID}" catalogId="{ONTOLOGY_APP_A2UI_CATALOG_ID}".
- updateComponents must include id **"root"**.
- Prefer one OntoKanbanBoard wired to BINDINGS.
- Never emit HTML.
"""


async def iter_ontology_app_designer_chat_ndjson(
    conversation: list[dict[str, str]],
    bindings: dict[str, Any],
    model_config: dict[str, str],
    *,
    working_a2ui_messages: list[dict[str, Any]] | None = None,
    app_name: str = "App",
    ontology_snapshot: dict[str, Any] | None = None,
    apply_bindings: ApplyBindingsFn | None = None,
) -> AsyncIterator[dict[str, Any]]:
    base_url = (model_config.get("base_url") or "").rstrip("/")
    if not base_url:
        raise ValueError("LLM base_url is not configured")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    working: list[dict[str, Any]] = list(working_a2ui_messages or [])
    current_bindings: dict[str, Any] = dict(bindings or {})
    if working:
        working = validate_ontology_app_a2ui_messages(working, bindings=current_bindings or None)

    client = AsyncOpenAI(base_url=base_url, api_key=model_config.get("api_key") or "no-key")
    model_name = model_config.get("model_name", "gpt-4o-mini")
    use_shim = _wiki_use_llm_reasoning_content_shim(base_url)
    extra_body = _wiki_agent_chat_extra_body()

    openai_messages: list[dict[str, Any]] = [
        {"role": "system", "content": _SYSTEM},
        {
            "role": "user",
            "content": (
                f"APP_NAME: {app_name}\n\nBINDINGS:\n"
                + json.dumps(current_bindings, ensure_ascii=False, indent=2)
                + "\n\nONTOLOGY_SNAPSHOT:\n"
                + json.dumps(ontology_snapshot or {}, ensure_ascii=False, indent=2)[:60_000]
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

    tools = [_SET_BINDINGS_TOOL, _SET_A2UI_TOOL]
    last_text = ""
    for _round in range(_MAX_TOOL_ROUNDS):
        _inject_reasoning_content_on_assistant_rows(openai_messages, use_shim=use_shim)
        try:
            stream = await client.chat.completions.create(
                model=model_name,
                messages=openai_messages,
                tools=tools,
                tool_choice="auto",
                temperature=0.35,
                max_tokens=16384,
                extra_body=extra_body,
                stream=True,
            )
        except Exception as e:
            logger.error("ontology app designer LLM stream failed: %s", e)
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
            yield {
                "type": "done",
                "content": content_buf,
                "a2ui_messages": working,
                "bindings": current_bindings,
            }
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
            tool_payload_obj: dict[str, Any]
            if name == "set_bindings":
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                    if not isinstance(args, dict):
                        raise ValueError("set_bindings arguments must be an object")
                    if apply_bindings is None:
                        raise ValueError("set_bindings is not available")
                    result = await apply_bindings(args)
                    current_bindings = dict(result.get("bindings") or args)
                    msgs = result.get("a2ui_messages")
                    if isinstance(msgs, list):
                        working = msgs
                    elif bindings_board_ready(current_bindings):
                        working = synthesize_status_board_a2ui_messages(
                            current_bindings, title=app_name
                        )
                    tool_payload_obj = {
                        "ok": True,
                        "bindings": current_bindings,
                        "messages": working,
                    }
                except Exception as e:
                    tool_payload_obj = {"ok": False, "error": str(e)}
            elif name == "set_a2ui_messages":
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                    raw_msgs = args.get("messages")
                    if not isinstance(raw_msgs, list):
                        raise ValueError("messages must be a list")
                    working = validate_ontology_app_a2ui_messages(
                        raw_msgs, bindings=current_bindings or None
                    )
                    tool_payload_obj = {"ok": True, "messages": working}
                except Exception as e:
                    tool_payload_obj = {"ok": False, "error": str(e)}
            else:
                tool_payload_obj = {"ok": False, "error": f"unknown tool: {name}"}
            tool_payload = json.dumps(tool_payload_obj, ensure_ascii=False)
            openai_messages.append({"role": "tool", "tool_call_id": tid, "content": tool_payload})
            yield {"type": "tool_end", "run_id": tid, "name": name, "output": tool_payload}

    yield {
        "type": "done",
        "content": last_text,
        "a2ui_messages": working,
        "bindings": current_bindings,
    }
