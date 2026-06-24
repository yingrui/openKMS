"""Suggest short conversation titles from message history."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from openai import AsyncOpenAI

from app.models.agent_models import AgentMessage

logger = logging.getLogger(__name__)

MAX_TITLE_LEN = 80
# Title generation only needs recent context.
MAX_MESSAGES = 12
MAX_MSG_CHARS = 400
MAX_TOTAL_CHARS = 6_000

TITLE_SYSTEM_PROMPT = """You name chat sessions based on their conversation.
Return a JSON object with one string field "title".
The title should be about 3–10 words, capture the main topic or goal, and use the same language as the conversation.
The transcript shows the most recent turns only — prioritize what the user is working on now."""


def _message_text(m: AgentMessage) -> str | None:
    if m.role not in ("user", "assistant"):
        return None
    text = (m.content or "").strip().replace("\n", " ")
    return text or None


def _truncate_text(text: str, max_chars: int, *, keep_tail: bool) -> str:
    if len(text) <= max_chars:
        return text
    if max_chars <= 1:
        return "…"
    if keep_tail:
        return "…" + text[-(max_chars - 1) :]
    return text[: max_chars - 1] + "…"


def _build_transcript(messages: list[AgentMessage]) -> str:
    """Build a bounded transcript from the latest user/assistant turns."""
    rows: list[tuple[str, str]] = []
    for m in messages:
        text = _message_text(m)
        if text:
            rows.append((m.role, _truncate_text(text, MAX_MSG_CHARS, keep_tail=True)))

    if not rows:
        return ""

    recent = rows[-MAX_MESSAGES:]
    selected: list[str] = []
    total = 0

    for role, text in reversed(recent):
        prefix = f"{role}: "
        line = f"{prefix}{text}"
        line_len = len(line) + (1 if selected else 0)
        if total + line_len <= MAX_TOTAL_CHARS:
            selected.insert(0, line)
            total += line_len
            continue

        remaining = MAX_TOTAL_CHARS - total - len(prefix) - (1 if selected else 0)
        if remaining > 24:
            clipped = _truncate_text(text, remaining, keep_tail=True)
            selected.insert(0, f"{prefix}{clipped}")
        break

    return "\n".join(selected)


def _normalize_title(raw: str) -> str:
    title = raw.strip().strip("\"'")
    title = " ".join(title.split())
    if len(title) > MAX_TITLE_LEN:
        title = title[: MAX_TITLE_LEN - 1].rstrip() + "…"
    return title


def _title_from_completion_message(msg: Any) -> str | None:
    content = (getattr(msg, "content", None) or "").strip()
    if content:
        if content.startswith("{"):
            try:
                payload = json.loads(content)
                if isinstance(payload, dict):
                    candidate = payload.get("title")
                    if isinstance(candidate, str) and candidate.strip():
                        return _normalize_title(candidate)
            except json.JSONDecodeError:
                pass
        normalized = _normalize_title(content)
        if normalized:
            return normalized

    reasoning = getattr(msg, "reasoning_content", None)
    if reasoning is None and hasattr(msg, "model_dump"):
        extra = msg.model_dump()
        if isinstance(extra, dict):
            reasoning = extra.get("reasoning_content")
    if not reasoning:
        return None

    text = str(reasoning)
    for pattern in (
        r"[「\"']([^「」\"'\n]{2,80})[」\"']",
        r"(?:例如|标题|title)[：:]\s*[「\"']?([^「」\"'\n]{2,80})",
    ):
        matches = re.findall(pattern, text, flags=re.IGNORECASE)
        if matches:
            candidate = _normalize_title(matches[-1])
            if candidate:
                return candidate
    return None


def _fallback_title_from_messages(messages: list[AgentMessage]) -> str | None:
    for m in reversed(messages):
        if m.role != "user":
            continue
        text = (m.content or "").strip().replace("\n", " ")
        if len(text) < 2:
            continue
        return _truncate_text(text, MAX_TITLE_LEN, keep_tail=False)
    return None


async def suggest_conversation_title(
    messages: list[AgentMessage],
    model_config: dict[str, Any],
) -> str:
    transcript = _build_transcript(messages)
    if not transcript:
        raise ValueError("No messages to summarize")

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
                {"role": "system", "content": TITLE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        "Recent conversation (oldest to newest):\n"
                        f"{transcript}\n\nReturn json with title."
                    ),
                },
            ],
            temperature=0.3,
            max_tokens=128,
            response_format={"type": "json_object"},
        )
    except Exception as e:
        logger.error("conversation title LLM call failed: %s", e)
        raise

    title = _title_from_completion_message(response.choices[0].message)
    if not title:
        title = _fallback_title_from_messages(messages)
    if not title:
        raise ValueError("Could not generate title")
    return title
