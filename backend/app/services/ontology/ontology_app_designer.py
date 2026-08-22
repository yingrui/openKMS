"""NDJSON Ontology App Designer chat (set_resources + set_a2ui_messages)."""

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
    _merge_stream_tool_call_slots,
    _reasoning_delta_append,
    _tool_calls_from_stream_slots,
)
from app.services.openai_compat import inject_reasoning_content_on_assistant_rows
from app.services.ontology.ontology_app_a2ui import (
    ONTOLOGY_APP_A2UI_CATALOG_ID,
    ONTOLOGY_APP_A2UI_SURFACE_ID,
    synthesize_stub_a2ui_messages,
    validate_ontology_app_a2ui_messages,
)

logger = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 8

ApplyBindingsFn = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]

_SET_RESOURCES_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "set_resources",
        "description": (
            "Declare which existing ontology api names this app may use. "
            "Does not create Object Types, Actions, or Functions, and does not change the UI. "
            "Pass objectTypes, actions, and/or functions as string arrays from ONTOLOGY_SNAPSHOT. "
            "After resources are set, call set_a2ui_messages to compose the layout."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "objectTypes": {"type": "array", "items": {"type": "string"}},
                "actions": {"type": "array", "items": {"type": "string"}},
                "functions": {"type": "array", "items": {"type": "string"}},
            },
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
            "Platform primitives: OntoObjectList (objectType, titleProperty, optional "
            "filterProperty+filterValue), OntoActionForm (actionApiName, label), "
            "OntoActionButton (actionApiName, label, optional objectId), "
            "OntoFunctionButton (functionApiName, label), OntoObjectLink "
            "(objectTypeId, objectId, label). "
            "Never use OntoKanbanBoard (removed). "
            "Only reference api_names from RESOURCES. Call set_resources first if RESOURCES are empty."
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

_SYSTEM = f"""You are **Ontology App Designer** for the openKMS **platform**.

You help authors build ontology-backed apps by **linking** existing Object Types, Actions, and Functions and **composing** A2UI from platform primitives — never invent ontology assets, never emit HTML, never use removed components (OntoKanbanBoard).

## Intent → layout (choose; do not default to a board)

| User intent | Compose |
|-------------|---------|
| List / browse / table | Text + OntoObjectList (± OntoActionForm for create) |
| Create / intake form | Emphasize OntoActionForm; list optional |
| Columns by status/stage ("kanban-like") | Several OntoObjectList with different filterProperty/filterValue + optional global OntoActionForm — NOT a board component |
| Deep link | OntoObjectLink |
| Read-only suggestion | OntoFunctionButton |
| Needs drag-and-drop or heavy custom UI | Say the platform a2ui lane cannot do that yet; stay within primitives |

## Recipes (complete shapes — Create labels live in Source as OntoActionForm)

1) Single list + create — prefer this when the user asks for a simple app.
2) Read-only list — no OntoActionForm.
3) Multi-column filters — Row of Columns each with OntoObjectList + one Form.

## Protocol

- Reply briefly in the user language.
- Use ONTOLOGY_SNAPSHOT for real names and Action input_schema summaries.
- If resources are empty, call **set_resources** first (objectTypes / actions / functions arrays).
- Then call **set_a2ui_messages** to set the full tree. Changing button copy = edit Source nodes, do not invent platform widgets.
- **Never** emit `OntoKanbanBoard` (removed). Use multiple `OntoObjectList` + `OntoActionForm` instead.
- createSurface surfaceId="{ONTOLOGY_APP_A2UI_SURFACE_ID}" catalogId="{ONTOLOGY_APP_A2UI_CATALOG_ID}".
- updateComponents must include id **"root"**.
- filter values must match stored property values on instances, not display labels, unless those strings are what is stored.
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
    working_note = ""
    if working:
        try:
            working = validate_ontology_app_a2ui_messages(working, bindings=current_bindings or None)
        except ValueError as e:
            # Old drafts may still contain OntoKanbanBoard / invalid trees — don't block the designer.
            working = synthesize_stub_a2ui_messages(title=app_name)
            working_note = (
                f"CURRENT_A2UI was invalid ({e}). It was replaced with a stub for this session; "
                "call set_resources (if needed) then set_a2ui_messages to rebuild."
            )

    client = AsyncOpenAI(base_url=base_url, api_key=model_config.get("api_key") or "no-key")
    model_name = model_config.get("model_name", "gpt-4o-mini")
    use_shim = _wiki_use_llm_reasoning_content_shim(base_url)
    extra_body = _wiki_agent_chat_extra_body()

    context_bits = [
        f"APP_NAME: {app_name}",
        "RESOURCES:\n" + json.dumps(current_bindings, ensure_ascii=False, indent=2),
        "ONTOLOGY_SNAPSHOT:\n"
        + json.dumps(ontology_snapshot or {}, ensure_ascii=False, indent=2)[:60_000],
        "CURRENT_A2UI_MESSAGES:\n" + json.dumps(working, ensure_ascii=False, indent=2)[:80_000],
    ]
    if working_note:
        context_bits.insert(1, "NOTE:\n" + working_note)

    openai_messages: list[dict[str, Any]] = [
        {"role": "system", "content": _SYSTEM},
        {
            "role": "user",
            "content": "\n\n".join(context_bits),
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

    tools = [_SET_RESOURCES_TOOL, _SET_A2UI_TOOL]
    last_text = ""
    for _round in range(_MAX_TOOL_ROUNDS):
        inject_reasoning_content_on_assistant_rows(openai_messages, use_shim=use_shim)
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
            if name in ("set_resources", "set_bindings"):
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                    if not isinstance(args, dict):
                        raise ValueError("set_resources arguments must be an object")
                    if apply_bindings is None:
                        raise ValueError("set_resources is not available")
                    result = await apply_bindings(args)
                    current_bindings = dict(result.get("bindings") or args)
                    tool_payload_obj = {
                        "ok": True,
                        "bindings": current_bindings,
                        "messages": working,
                        "note": "Resources updated. Call set_a2ui_messages to compose the UI.",
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
