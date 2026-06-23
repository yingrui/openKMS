"""AI-powered session review: extract structured lesson events from a conversation trace."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from openai import AsyncOpenAI

from app.models.agent_models import AgentMessage

logger = logging.getLogger(__name__)

MAX_TOOL_OUTPUT_DISPLAY = 1_200

REVIEW_SYSTEM_PROMPT = """You are a session reviewer. Your job is to review an agent conversation (user <-> assistant)
and extract structured "lesson events" — things the assistant did wrong, corrected, learned, or
interesting patterns that emerged.

For each event you extract, include:
- type: "error" (mistake + fix), "lesson" (insight gained), or "pattern" (repeated behavior)
- severity: "low", "medium", or "high"
- context: a verbatim quote from the conversation (message content or tool call name/input/output) that is the clearest evidence
- what_went_wrong: clear description of the issue or the learning moment
- what_fixed_it: what resolved the issue, or null if unresolved
- message_ids: list of message IDs referenced by the context quote (the UUIDs shown in the transcript)

Rules:
- Only extract events with clear, quotable evidence in the conversation.
- If the session was straightforward with no notable issues, return an empty list. Do NOT fabricate.
- Each context quote must be a real, verbatim snippet from the transcript.
- Events should be about the ASSISTANT's behavior — not about the user's requests.
- A single mistake that was immediately corrected is 1 event, not 2.

Return a JSON object with one field "events" containing an array of event objects.
Each event must have exactly: type, severity, context, what_went_wrong, what_fixed_it, message_ids."""

MAX_MSG_BODY = 800
MAX_TRANSCRIPT_CHARS = 18_000


def _format_message(m: AgentMessage, idx: int) -> str | None:
    role = m.role
    if role not in ("user", "assistant"):
        return None
    body = (m.content or "").strip()
    if len(body) > MAX_MSG_BODY:
        body = body[: MAX_MSG_BODY - 1] + "…"
    tool_calls = m.tool_calls
    tc_block = ""
    if role == "assistant" and tool_calls and isinstance(tool_calls, dict):
        traces = tool_calls.get("wiki_tool_traces_v1")
        if isinstance(traces, list) and traces:
            parts: list[str] = []
            for t in traces:
                if isinstance(t, dict):
                    name = t.get("name", "tool")
                    inp = str(t.get("input") or "")[:200]
                    out = str(t.get("output") or "")[:MAX_TOOL_OUTPUT_DISPLAY]
                    err = str(t.get("error") or "")
                    line = f"  [tool:{name}] input={inp}"
                    if err:
                        line += f" ERROR={err}"
                    elif out:
                        line += f" output={out}"
                    parts.append(line)
            if parts:
                tc_block = "\n" + "\n".join(parts)
    return f"[{idx}] {role}: {body}{tc_block}"


def _build_review_transcript(messages: list[AgentMessage]) -> str:
    rows: list[str] = []
    total = 0
    for idx, m in enumerate(messages):
        line = _format_message(m, idx + 1)
        if not line:
            continue
        total += len(line) + 1
        rows.append(line)
    while total > MAX_TRANSCRIPT_CHARS and len(rows) > 6:
        removed = rows.pop(0)
        total -= len(removed) + 1
    return "\n".join(rows)


def _normalize_event(obj: dict[str, Any]) -> dict[str, Any] | None:
    etype = str(obj.get("type") or "").strip().lower()
    if etype not in ("error", "lesson", "pattern"):
        return None
    severity = str(obj.get("severity") or "").strip().lower()
    if severity not in ("low", "medium", "high"):
        severity = "medium"
    context = str(obj.get("context") or "").strip()
    www = str(obj.get("what_went_wrong") or "").strip()
    wfi = obj.get("what_fixed_it")
    wfi_str = str(wfi).strip() if wfi is not None and str(wfi).strip() else None
    msg_ids = obj.get("message_ids")
    if isinstance(msg_ids, list):
        msg_ids = [str(x) for x in msg_ids if x]
    else:
        msg_ids = []
    if not context or not www:
        return None
    return {
        "type": etype,
        "severity": severity,
        "context": context[:1000],
        "what_went_wrong": www[:500],
        "what_fixed_it": wfi_str[:500] if wfi_str else None,
        "message_ids": msg_ids[:20],
    }


async def review_session(
    messages: list[AgentMessage],
    model_config: dict[str, Any],
) -> list[dict[str, Any]]:
    transcript = _build_review_transcript(messages)
    if not transcript.strip():
        raise ValueError("No messages to review")

    base_url = (model_config.get("base_url") or "").rstrip("/")
    if not base_url:
        raise ValueError("LLM base_url is not configured")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )

    try:
        response = await client.chat.completions.create(
            model=model_config.get("model_name") or "gpt-4o-mini",
            messages=[
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        "Conversation transcript (oldest first, [N] = message index matching message_ids):\n\n"
                        f"{transcript}\n\n"
                        "Return json with events array."
                    ),
                },
            ],
            temperature=0.3,
            max_tokens=2048,
            response_format={"type": "json_object"},
        )
    except Exception as e:
        logger.error("session review LLM call failed: %s", e)
        raise

    content = (response.choices[0].message.content or "").strip()
    payload: dict[str, Any] = {}
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", content, re.DOTALL)
        if m:
            try:
                payload = json.loads(m.group())
            except json.JSONDecodeError:
                pass
    if not isinstance(payload, dict):
        raise ValueError("Unexpected LLM response format (not a JSON object)")

    raw_events = payload.get("events")
    if not isinstance(raw_events, list):
        raise ValueError("LLM response missing 'events' array")

    events: list[dict[str, Any]] = []
    for item in raw_events:
        if not isinstance(item, dict):
            continue
        norm = _normalize_event(item)
        if norm:
            events.append(norm)
    return events
