"""Conversation title suggestion helpers."""

from types import SimpleNamespace

from app.models.agent_models import AgentMessage
from app.services.agent.conversation_title import (
    MAX_TOTAL_CHARS,
    _build_transcript,
    _fallback_title_from_messages,
    _title_from_completion_message,
)


def test_title_from_json_content() -> None:
    msg = SimpleNamespace(content='{"title": "Insurance knowledge base"}', reasoning_content=None)
    assert _title_from_completion_message(msg) == "Insurance knowledge base"


def test_title_from_plain_content() -> None:
    msg = SimpleNamespace(content="Insurance FAQ planning", reasoning_content=None)
    assert _title_from_completion_message(msg) == "Insurance FAQ planning"


def test_title_from_reasoning_quote() -> None:
    msg = SimpleNamespace(
        content="",
        reasoning_content='例如："保险知识库资料搜集准备"',
    )
    assert _title_from_completion_message(msg) == "保险知识库资料搜集准备"


def test_fallback_title_from_last_user_message() -> None:
    msgs = [
        AgentMessage(id="1", conversation_id="c", role="user", content="Hello"),
        AgentMessage(id="2", conversation_id="c", role="assistant", content="Hi"),
        AgentMessage(id="3", conversation_id="c", role="user", content="整理保险知识库"),
    ]
    assert _fallback_title_from_messages(msgs) == "整理保险知识库"


def test_build_transcript_prefers_latest_messages() -> None:
    msgs = [
        AgentMessage(id="1", conversation_id="c", role="user", content="OLD_TOPIC_A" * 20),
        AgentMessage(id="2", conversation_id="c", role="assistant", content="old reply"),
    ]
    for i in range(30):
        msgs.append(
            AgentMessage(
                id=f"filler-{i}",
                conversation_id="c",
                role="user" if i % 2 == 0 else "assistant",
                content=f"filler-{i}",
            )
        )
    msgs.append(AgentMessage(id="last", conversation_id="c", role="user", content="LATEST_TOPIC insurance wiki"))
    msgs.append(
        AgentMessage(id="last-a", conversation_id="c", role="assistant", content="Sure, let's build the wiki.")
    )

    transcript = _build_transcript(msgs)
    assert "LATEST_TOPIC insurance wiki" in transcript
    assert "OLD_TOPIC_A" not in transcript
    assert "filler-0" not in transcript


def test_build_transcript_respects_total_char_budget() -> None:
    msgs = [
        AgentMessage(
            id=str(i),
            conversation_id="c",
            role="user" if i % 2 == 0 else "assistant",
            content="x" * 500,
        )
        for i in range(20)
    ]
    transcript = _build_transcript(msgs)
    assert len(transcript) <= MAX_TOTAL_CHARS


def test_build_transcript_keeps_tail_of_long_message() -> None:
    msgs = [
        AgentMessage(
            id="1",
            conversation_id="c",
            role="user",
            content=("HEAD_" * 200) + "TAIL_UNIQUE",
        )
    ]
    transcript = _build_transcript(msgs)
    assert transcript.endswith("TAIL_UNIQUE")
    assert transcript.startswith("user: …")
