"""Tool trace storage and replay for agent surfaces (wiki, project, KB)."""

from __future__ import annotations

from typing import Any

# Persisted JSONB key on AgentMessage.tool_calls (unchanged for backward compatibility).
AGENT_TOOL_TRANSCRIPTS_KEY = "wiki_tool_traces_v1"
WIKI_TOOL_TRANSCRIPTS_KEY = AGENT_TOOL_TRANSCRIPTS_KEY

_MAX_TOOL_OUTPUT_STORAGE = 48_000


def truncate_tool_output_for_storage(text: str, max_len: int = _MAX_TOOL_OUTPUT_STORAGE) -> str:
    t = text or ""
    suffix = "\n…[truncated for storage]"
    if len(t) + len(suffix) <= max_len:
        return t
    head = max_len - len(suffix)
    if head < 1:
        return suffix[:max_len]
    return t[:head] + suffix


# Backward-compatible alias used across wiki-era call sites.
truncate_wiki_tool_output_for_storage = truncate_tool_output_for_storage


def tool_traces_from_tool_messages(messages: list[Any]) -> list[dict[str, str]]:
    """Extract name/output pairs from LangChain ToolMessage rows."""
    import json

    out: list[dict[str, str]] = []
    from langchain_core.messages import ToolMessage

    for m in messages:
        if not isinstance(m, ToolMessage):
            continue
        name = getattr(m, "name", None) or "tool"
        raw = m.content
        body = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False, default=str)
        out.append({"name": name, "output": truncate_tool_output_for_storage(body)})
    return out


def tool_payload_from_traces(
    traces: list[dict[str, str]],
    *,
    stream_parts: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Persist tool transcripts and optional interleaved UI stream parts on `tool_calls`."""
    payload: dict[str, Any] = {}
    if traces:
        payload[AGENT_TOOL_TRANSCRIPTS_KEY] = traces
    if stream_parts:
        # Same key as wiki / KB so SPA `assistantHistoryStreamParts` prefers interleaved order.
        from app.services.agent.assistant_stream_parts import WIKI_ASSISTANT_STREAM_PARTS_KEY

        payload[WIKI_ASSISTANT_STREAM_PARTS_KEY] = stream_parts
    return payload or None


def assistant_lc_content_from_db_row(content: str, tool_calls: list | dict | None) -> str:
    """Rebuild assistant LangChain content including stored tool transcripts."""
    vis = (content or "").strip()
    traces: list[dict[str, str]] = []
    if isinstance(tool_calls, dict):
        raw = tool_calls.get(AGENT_TOOL_TRANSCRIPTS_KEY)
        if isinstance(raw, list):
            for item in raw:
                if (
                    isinstance(item, dict)
                    and isinstance(item.get("name"), str)
                    and isinstance(item.get("output"), str)
                ):
                    traces.append({"name": item["name"], "output": item["output"]})
    if not traces:
        return content or ""
    blocks = [f"### Tool `{t['name']}` result\n\n{t['output']}" for t in traces]
    section = "\n\n".join(blocks)
    if vis:
        return f"{vis}\n\n---\n\n{section}"
    return section
