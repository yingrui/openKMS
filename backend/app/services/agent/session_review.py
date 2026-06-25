"""AI-powered session review: extract structured lesson events from a conversation trace.

Long conversations are split into parts (preserving message integrity, token-based) and
processed one by one. Uses pydantic-ai for structured output (no manual JSON parsing).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import tiktoken
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from pydantic_ai import Agent, PromptedOutput, StructuredDict
from pydantic_ai.exceptions import ModelAPIError
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.profiles.openai import OpenAIModelProfile
from pydantic_ai.providers.openai import OpenAIProvider

from app.models.agent_models import AgentMessage

logger = logging.getLogger(__name__)

# ── constants ──────────────────────────────────────────────────────────────
MAX_OUTPUT_TOKENS = 8192
MAX_TOOL_OUTPUT_DISPLAY = 1_200
MAX_MSG_BODY = 800
OVERLAP_MESSAGES = 3
PART_TOKEN_TARGET = 6500
RETRY_MAX_INPUT_TOKENS = 7000
_ENCODING_NAMES = ("cl100k_base", "o200k_base")

_REVIEW_PROFILE = OpenAIModelProfile(
    supports_json_schema_output=False,
    supports_json_object_output=True,
)

# ── pydantic-ai event model ────────────────────────────────────────────────
class LessonEvent(BaseModel):
    type: str = Field(
        ...,
        pattern=r"^(error|lesson|pattern|skill_candidate)$",
        description="Event kind: error, lesson, pattern, or skill_candidate (reusable workflow)",
    )
    severity: str = Field(
        default="medium",
        pattern=r"^(low|medium|high)$",
        description="Importance level",
    )
    context: str = Field(
        ...,
        max_length=1000,
        description="Verbatim quote from the transcript that is the clearest evidence",
    )
    what_went_wrong: str = Field(
        ...,
        max_length=500,
        description="Clear description of the issue, learning moment, or successful workflow (for skill_candidate)",
    )
    what_fixed_it: str | None = Field(
        default=None,
        max_length=500,
        description="What resolved the issue, null if unresolved, or why the workflow is reusable (for skill_candidate)",
    )
    message_ids: list[str] = Field(
        default_factory=list,
        max_length=20,
        description="Message IDs referenced by the context quote",
    )
    # Occurrence tracking (populated during merge, not by extraction LLM)
    occurrence_count: int = Field(default=1, ge=1, description="How many times this pattern occurred")
    session_ids: list[str] = Field(default_factory=list, description="Session IDs where this occurred")
    source_message_ids: list[str] = Field(default_factory=list, description="All message IDs across occurrences")


class ReviewResponse(BaseModel):
    events: list[LessonEvent] = Field(
        default_factory=list,
        description="Extracted lesson events. Empty list if nothing notable.",
    )

# Pre-compute JSON Schema from the Pydantic model for StructuredDict.
_REVIEW_JSON_SCHEMA = ReviewResponse.model_json_schema()

# JSON Schema for the merge output (same as extraction but with occurrence fields).
_MERGE_JSON_SCHEMA = ReviewResponse.model_json_schema()

_MERGE_SYSTEM_PROMPT = """You merge lesson events extracted from agent conversation reviews.
Your input:
- Existing lessons (from previous sessions), each has: type, severity, context, what_went_wrong, what_fixed_it, occurrence_count, session_ids, source_message_ids, status (approved/pending/rejected)
- New extracted events from the latest session, each has: type, severity, context, what_went_wrong, what_fixed_it, message_ids
- The current session_id

Merge rules:
1. If a new event is SIMILAR to an existing APPROVED or PENDING event (same type, similar what_went_wrong), MERGE them:
   - Keep the existing event's id, status, session_ids, timestamp
   - Increment occurrence_count by 1
   - Append the current session_id to session_ids
   - Append the new event's message_ids to source_message_ids
   - If the new event has a better (more specific) context or what_went_wrong or what_fixed_it, update it
   - If occurrence_count reaches 3+, increase severity one level (low→medium, medium→high)
2. If a new event matches a REJECTED existing event, do NOT merge — the user already decided this event is invalid. Keep the rejected event as-is.
3. If a new event is NOT similar to any existing event, create a new entry with occurrence_count=1, session_ids=[current_session_id], source_message_ids=from new event's message_ids.
4. Keep all existing events that are NOT matched by any new event (their occurrence_count and session_ids remain unchanged).
5. For the new entries, use the new event's message_ids as source_message_ids.

Return the FULL merged list as a JSON object with an "events" array. Each event must have: type, severity, context, what_went_wrong, what_fixed_it, message_ids, occurrence_count, session_ids, source_message_ids.
For EXISTING events being kept, preserve their original fields including id and timestamp.
For NEW events, omit id and timestamp (these will be assigned by the caller)."""


# ── pydantic-ai agent (prompt is immutable, model changes per call) ────────
_SYSTEM_PROMPT = (
    "You are a session reviewer. Review the agent conversation transcript\n"
    "and extract structured lesson events.\n\n"
    "Event types:\n"
    "- error: the assistant made a mistake and corrected it\n"
    "- lesson: an insight the assistant gained\n"
    "- pattern: a repeated behavior (positive or negative)\n"
    "- skill_candidate: a successful multi-step workflow executed by the assistant\n"
    "  that would be worth codifying as a reusable skill. This means the assistant\n"
    "  used tools in a specific sequence or with specific parameters that produced\n"
    "  a correct result. For skill_candidate: what_went_wrong describes the\n"
    "  successful workflow, what_fixed_it describes why this pattern is reusable.\n\n"
    "Rules:\n"
    "- Only extract events with clear, quotable evidence in the transcript.\n"
    "- If the session was straightforward with no notable events, return an empty events list.\n"
    "- Each context quote must be a real, verbatim snippet from the transcript.\n"
    "- Events should be about the ASSISTANT's behavior, not the user's requests.\n"
    "- A single mistake that was immediately corrected is 1 event, not 2.\n"
    "- Do NOT fabricate events."
)


# ── token helpers ──────────────────────────────────────────────────────────
_encoding: tiktoken.Encoding | None = None


def _get_encoding() -> tiktoken.Encoding:
    global _encoding
    if _encoding is not None:
        return _encoding
    for name in _ENCODING_NAMES:
        try:
            _encoding = tiktoken.get_encoding(name)
            return _encoding
        except (ValueError, KeyError):
            pass
    _encoding = tiktoken.get_encoding("cl100k_base")
    return _encoding


def _token_count(text: str) -> int:
    return len(_get_encoding().encode(text))


# ── message formatting & partitioning ──────────────────────────────────────
def _format_message(m: AgentMessage, idx: int) -> tuple[str, str] | None:
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
    return (m.id, f"[{idx}] {role}: {body}{tc_block}")


def _partition_messages(messages: list[AgentMessage]) -> list[tuple[int, int, str]]:
    formatted: list[tuple[str, str]] = []
    for idx, m in enumerate(messages):
        entry = _format_message(m, idx + 1)
        if entry:
            formatted.append(entry)

    if not formatted:
        return []

    token_counts: list[int] = [_token_count(line) + 1 for _, line in formatted]
    chunks: list[tuple[int, int, str]] = []
    current_start = 0
    current_tokens = 0
    current: list[tuple[str, str]] = []

    def _flush(i: int) -> None:
        nonlocal current, current_tokens, current_start
        if not current:
            current_start = i
            return
        chunks.append((current_start, i - 1, "\n".join(l for _, l in current)))
        if len(current) > OVERLAP_MESSAGES:
            current = list(current[-OVERLAP_MESSAGES:])
            current_start = i - OVERLAP_MESSAGES
        else:
            current = []
            current_start = i
        current_tokens = (
            sum(token_counts[max(current_start, 0):current_start + len(current)])
            if current
            else 0
        )

    for i in range(len(formatted)):
        tc = token_counts[i]
        if tc > PART_TOKEN_TARGET:
            _flush(i)
            chunks.append((i, i, formatted[i][1]))
            current_start = i + 1
            continue
        if current_tokens + tc > PART_TOKEN_TARGET and current:
            _flush(i)
        current.append(formatted[i])
        current_tokens += tc

    _flush(len(formatted))
    return chunks


# ── LLM call (pydantic-ai structured output) ───────────────────────────────
async def _review_part(
    model: OpenAIChatModel,
    transcript: str,
    part_num: int,
    total_parts: int,
) -> list[LessonEvent]:
    prefix = ""
    if total_parts > 1:
        prefix = (
            f"This is part {part_num} of {total_parts} of a longer conversation. "
            "Only extract events visible in THIS part. "
            "The transcript may overlap with previous parts for context — do not duplicate events already extracted.\n\n"
        )
    prompt = (
        f"{prefix}"
        "Conversation transcript (oldest first, [N] = message index):\n\n"
        f"{transcript}\n\n"
        "Extract lesson events from the above conversation."
    )

    structured = StructuredDict(
        _REVIEW_JSON_SCHEMA,
        name="ReviewResponse",
        description="Extracted lesson events from agent conversation review",
    )
    agent = Agent(
        model,
        output_type=PromptedOutput(structured),
        system_prompt=_SYSTEM_PROMPT,
    )
    try:
        result = await agent.run(prompt)
    except ModelAPIError as e:
        raise ValueError(str(e)) from e

    output = result.output or {}
    events_raw = output.get("events", [])
    if not isinstance(events_raw, list):
        return _parse_events_from_text(str(result.output), part_num, total_parts)

    events: list[LessonEvent] = []
    for item in events_raw:
        if not isinstance(item, dict):
            continue
        try:
            ev = LessonEvent.model_validate(item)
            events.append(ev)
        except Exception:
            ev = _coerce_event(item)
            if ev is not None:
                events.append(ev)
    return events


def _parse_events_from_text(text: str, part_num: int, total_parts: int) -> list[LessonEvent]:
    """Robustly parse lesson events from LLM text output."""

    # Try standard `{"events": [...]}` first
    try:
        parsed = ReviewResponse.model_validate_json(text)
        return parsed.events
    except Exception:
        pass

    # Try markdown code fence
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        try:
            parsed = ReviewResponse.model_validate_json(m.group(1))
            return parsed.events
        except Exception:
            pass

    # Try top-level array [...]
    try:
        raw_list = json.loads(text)
        if isinstance(raw_list, list):
            return [_coerce_event(item) for item in raw_list if isinstance(item, dict)]
    except json.JSONDecodeError:
        pass

    # Try extracting multiple top-level objects: { ... } { ... }
    objects = re.findall(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text, re.DOTALL)
    if len(objects) > 1:
        events: list[LessonEvent] = []
        for obj_str in objects:
            try:
                ev = _coerce_event(json.loads(obj_str))
                if ev is not None:
                    events.append(ev)
            except json.JSONDecodeError:
                pass
        if events:
            return events

    logger.warning("part %d/%d: all parse strategies failed. text[:300]=%s", part_num, total_parts, text[:300])
    return []


def _coerce_event(raw: dict) -> LessonEvent | None:
    """Map common LLM field name variations to LessonEvent."""

    # Map various LLM field names to our schema
    etype = (
        raw.get("type")
        or raw.get("event_type")
        or raw.get("eventType")
        or raw.get("kind")
        or ""
    )
    etype = str(etype).strip().lower()
    if etype not in ("error", "lesson", "pattern", "skill_candidate"):
        return None

    severity = (
        raw.get("severity")
        or raw.get("level")
        or raw.get("importance")
        or "medium"
    )
    severity = str(severity).strip().lower()
    if severity not in ("low", "medium", "high"):
        severity = "medium"

    context = (
        raw.get("context")
        or raw.get("context_quote")
        or raw.get("contextQuote")
        or raw.get("quote")
        or raw.get("evidence")
        or ""
    )
    context = str(context).strip()

    www = (
        raw.get("what_went_wrong")
        or raw.get("whatWentWrong")
        or raw.get("explanation")
        or raw.get("description")
        or raw.get("problem")
        or raw.get("issue")
        or ""
    )
    www = str(www).strip()

    wfi = raw.get("what_fixed_it") or raw.get("whatFixedIt") or raw.get("fix") or raw.get("solution") or raw.get("resolution")
    wfi_str = str(wfi).strip() if wfi is not None and str(wfi).strip() else None

    msg_ids = raw.get("message_ids") or raw.get("messageIds") or raw.get("message_id") or raw.get("ids") or []
    if isinstance(msg_ids, list):
        msg_ids = [str(x) for x in msg_ids if x]
    else:
        msg_ids = []

    if not context or not www:
        return None

    return LessonEvent(
        type=etype,  # type: ignore[arg-type]
        severity=severity,  # type: ignore[arg-type]
        context=context[:1000],
        what_went_wrong=www[:500],
        what_fixed_it=wfi_str[:500] if wfi_str else None,
        message_ids=msg_ids[:20],
    )


async def _review_part_with_retry(
    model: OpenAIChatModel,
    transcript: str,
    part_num: int,
    total_parts: int,
) -> list[LessonEvent]:
    """Call _review_part; on context-length errors, retry once with truncation."""
    try:
        return await _review_part(model, transcript, part_num, total_parts)
    except Exception as e:
        err_msg = str(e)
        if (
            "too long" in err_msg.lower()
            or "context_length" in err_msg.lower()
            or "maximum context" in err_msg.lower()
        ):
            logger.warning(
                "part %d/%d input too long, retrying with token-based truncation",
                part_num,
                total_parts,
            )
            lines = transcript.split("\n")
            truncated_lines: list[str] = []
            tok_total = 0
            for line in lines:
                lt = _token_count(line) + 1
                if tok_total + lt > RETRY_MAX_INPUT_TOKENS:
                    break
                truncated_lines.append(line)
                tok_total += lt
            truncated = "\n".join(truncated_lines)
            if len(truncated) < len(transcript):
                truncated += "\n…[truncated due to length]"
            try:
                return await _review_part(model, truncated, part_num, total_parts)
            except Exception as e2:
                logger.error("part %d/%d retry also failed: %s", part_num, total_parts, e2)
                raise ValueError(
                    f"LLM call failed for part {part_num} even after truncation: {e2}"
                ) from e2
        raise


# ── public API ─────────────────────────────────────────────────────────────


async def merge_lessons(
    existing: list[dict[str, Any]],
    new_events: list[dict[str, Any]],
    session_id: str,
    model_config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Merge lessons using code-level similarity grouping + LLM for final decisions.

    When called from review_session: merges new_events into existing.
    When called from the merge endpoint (new_events empty): deduplicates existing against itself.
    """
    all_items = list(existing) + list(new_events)
    if len(all_items) <= 1:
        return all_items

    # ── Phase 1: code-level grouping by text similarity ──────────────────
    groups: list[list[dict[str, Any]]] = _group_similar_lessons(all_items)
    singles = [g[0] for g in groups if len(g) == 1]
    multi = [g for g in groups if len(g) > 1]

    if not multi:
        return all_items  # nothing to merge

    # ── Phase 2: LLM merges each group of similar lessons ────────────────
    base_url = (model_config.get("base_url") or "").rstrip("/")
    if not base_url:
        raise ValueError("LLM base_url is not configured")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"
    model_name = model_config.get("model_name") or "gpt-4o-mini"

    client = AsyncOpenAI(base_url=base_url, api_key=model_config.get("api_key") or "no-key")
    provider = OpenAIProvider(openai_client=client)
    model = OpenAIChatModel(model_name, provider=provider, profile=_REVIEW_PROFILE)

    merged_multi: list[dict[str, Any]] = []
    for group_idx, group in enumerate(multi):
        if len(group) == 1:
            merged_multi.append(group[0])
            continue

        prompt = (
            "Merge the following similar lesson events into a single consolidated entry.\n\n"
            f"{json.dumps([_compact_for_merge(e) for e in group], ensure_ascii=False, indent=2)}\n\n"
            "Rules:\n"
            "- Keep the best (most detailed) context, what_went_wrong, and what_fixed_it.\n"
            "- Sum occurrence_count across all items. Set session_ids and source_message_ids to the union of all items.\n"
            "- If occurrence_count >= 3 after merge, increase severity one level (low→medium, medium→high).\n"
            "- If any item has status 'rejected', preserve that status.\n"
            "- Preserve the id and timestamp of the item with the highest occurrence_count.\n"
            "- Return a JSON object with a single \"events\" array containing only the merged event."
        )

        structured = StructuredDict(_MERGE_JSON_SCHEMA, name="MergedLessons", description="Merged lesson event")
        agent = Agent(model, output_type=PromptedOutput(structured), system_prompt=_MERGE_SYSTEM_PROMPT)
        try:
            result = await agent.run(prompt)
            output = result.output or {}
            events = output.get("events", [])
            if isinstance(events, list) and events:
                merged_multi.append(events[0])
            else:
                # LLM failed, just keep the first one and accumulate counts
                merged = dict(group[0])
                merged["occurrence_count"] = sum(g.get("occurrence_count", 1) for g in group)
                merged["session_ids"] = list({s for g in group for s in g.get("session_ids", []) if s})
                merged_multi.append(merged)
        except Exception as e:
            logger.warning("merge group %d LLM call failed, falling back: %s", group_idx, e)
            merged = dict(group[0])
            merged["occurrence_count"] = sum(g.get("occurrence_count", 1) for g in group)
            merged["session_ids"] = list({s for g in group for s in g.get("session_ids", []) if s})
            merged_multi.append(merged)

    result = singles + merged_multi
    # Sort by severity (high first), then occurrence_count
    sev_order = {"high": 0, "medium": 1, "low": 2}
    result.sort(key=lambda e: (sev_order.get(e.get("severity", "low"), 2), -(e.get("occurrence_count", 1))))
    return result


def _compact_for_merge(ev: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": ev.get("type"),
        "severity": ev.get("severity"),
        "context": (ev.get("context") or "")[:120],
        "what_went_wrong": (ev.get("what_went_wrong") or "")[:200],
        "what_fixed_it": (ev.get("what_fixed_it") or "")[:120],
        "occurrence_count": ev.get("occurrence_count", 1),
        "session_ids": ev.get("session_ids", []),
        "source_message_ids": ev.get("source_message_ids", []),
        "status": ev.get("status", "pending"),
        "id": ev.get("id"),
        "timestamp": ev.get("timestamp"),
    }


def _group_similar_lessons(lessons: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Group lessons by text similarity of what_went_wrong + type."""
    from difflib import SequenceMatcher

    if len(lessons) <= 1:
        return [lessons]

    # Build groups via union-find on similarity
    n = len(lessons)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(n):
        ti = str(lessons[i].get("type", ""))
        wi = str(lessons[i].get("what_went_wrong", ""))
        for j in range(i + 1, n):
            tj = str(lessons[j].get("type", ""))
            if ti != tj:
                continue
            wj = str(lessons[j].get("what_went_wrong", ""))
            # Compare the shorter of the two what_went_wrong strings
            ratio = SequenceMatcher(None, wi.lower(), wj.lower()).ratio()
            if ratio >= 0.55:  # 55% similarity threshold
                union(i, j)

    # Collect groups
    groups_map: dict[int, list[dict[str, Any]]] = {}
    for i in range(n):
        root = find(i)
        groups_map.setdefault(root, []).append(lessons[i])

    return list(groups_map.values())


async def review_session(
    messages: list[AgentMessage],
    model_config: dict[str, Any],
    *,
    session_id: str = "",
    existing_lessons: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if not messages:
        raise ValueError("No messages to review")

    base_url = (model_config.get("base_url") or "").rstrip("/")
    if not base_url:
        raise ValueError("LLM base_url is not configured")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"
    model_name = model_config.get("model_name") or "gpt-4o-mini"

    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )
    provider = OpenAIProvider(openai_client=client)
    pydantic_model = OpenAIChatModel(
        model_name,
        provider=provider,
        profile=_REVIEW_PROFILE,
    )

    chunks = _partition_messages(messages)
    if not chunks:
        raise ValueError("No valid messages to review")

    total_parts = len(chunks)
    all_events: list[dict[str, Any]] = []
    seen_signatures: set[str] = set()

    for pi, (chunk_start, chunk_end, transcript) in enumerate(chunks, 1):
        part_num = pi
        logger.info(
            "reviewing part %d/%d (messages %d-%d, %d tokens)",
            part_num,
            total_parts,
            chunk_start + 1,
            chunk_end + 1,
            _token_count(transcript),
        )

        events = await _review_part_with_retry(
            pydantic_model, transcript, part_num, total_parts
        )

        for ev in events:
            sig = f"{ev.type}:{ev.context[:80]}"
            if sig not in seen_signatures:
                seen_signatures.add(sig)
                all_events.append(ev.model_dump(mode="json"))

        logger.info(
            "part %d/%d extracted %d events (total %d)",
            part_num,
            total_parts,
            len(events),
            len(all_events),
        )

    # If there are existing lessons, merge the new events into them.
    if existing_lessons and all_events:
        try:
            all_events = await merge_lessons(existing_lessons, all_events, session_id, model_config)
        except Exception as e:
            logger.warning("merge_lessons failed, returning unmerged events: %s", e)
            # Fall through — return unmerged events

    return all_events
