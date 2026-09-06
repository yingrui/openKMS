"""Derive understanding from a media asset: speech transcript and executive summary.

Keyframe (screenshot) extraction lives in ``media_derivatives`` next to the poster
code, since both are ffmpeg frame grabs.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from openai import AsyncOpenAI
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from app.models.api_model import ApiModel

logger = logging.getLogger(__name__)

# Whisper model size. large-v3 is materially better on Chinese than medium and the
# assets here are short, so accuracy wins over speed.
WHISPER_MODEL_SIZE = "large-v3"
SUMMARY_MAX_INPUT_CHARS = 12000


def transcribe_media(
    src_path: str, language: str | None = None, hotwords: str | None = None
) -> dict[str, Any] | None:
    """Speech-to-text over a local media file using faster-whisper.

    ``hotwords`` biases the decoder towards domain vocabulary. It only shifts
    probabilities — it is not a guarantee, and whisper truncates it to 223
    tokens — so the caller should still run glossary corrections afterwards.

    Returns the transcript payload stored on ``media_assets.transcript``:
    ``{language, engine, duration_ms, text, segments: [{start_ms, end_ms, text}]}``.
    Returns None when faster-whisper is not installed, so the caller can carry on
    with the derivatives it can still produce.
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        logger.warning("faster-whisper not installed; skipping transcription")
        return None

    # int8 keeps a CPU-only box (no CUDA on macOS) within reach for these clips.
    model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        src_path,
        language=language,
        vad_filter=True,
        beam_size=5,
        hotwords=hotwords or None,
    )

    rows: list[dict[str, Any]] = []
    for seg in segments:
        text = (seg.text or "").strip()
        if not text:
            continue
        rows.append(
            {
                "start_ms": int(seg.start * 1000),
                "end_ms": int(seg.end * 1000),
                "text": text,
            }
        )

    return {
        "language": info.language,
        "engine": f"faster-whisper/{WHISPER_MODEL_SIZE}",
        "hotwords": hotwords or None,
        "duration_ms": int((info.duration or 0) * 1000),
        "text": "".join(r["text"] for r in rows),
        "segments": rows,
    }


def transcript_plain_text(transcript: dict[str, Any] | None) -> str:
    """Flatten a stored transcript payload to plain text."""
    if not transcript:
        return ""
    text = transcript.get("text")
    if isinstance(text, str) and text.strip():
        return text
    segments = transcript.get("segments") or []
    return "".join(str(s.get("text", "")) for s in segments)


async def summarize_transcript(text: str, title: str, model: ApiModel) -> str | None:
    """One LLM call: turn a transcript into a short executive summary.

    Best-effort — returns None on any provider error so a failed summary never
    costs the caller its transcript and keyframes.
    """
    if not text or not text.strip():
        return None

    base_url = (model.provider_rel.base_url or "").rstrip("/")
    if not re.search(r"/v\d+$", base_url):
        base_url = f"{base_url}/v1"
    client = AsyncOpenAI(base_url=base_url, api_key=model.provider_rel.api_key or "dummy")
    agent = Agent(
        OpenAIChatModel(model.model_name or "gpt-4", provider=OpenAIProvider(openai_client=client)),
        system_prompt=(
            "你是企业知识库的内容编辑。给定一段音视频的语音转写稿，写一段中文摘要（executive summary）。"
            "要求：先用一句话点明这条内容讲什么，再用 3-5 个要点列出关键信息（每点一行，以「- 」开头）。"
            "只依据转写稿的内容，不要补充稿件里没有的事实，不要写开场白或结束语。"
        ),
    )
    prompt = f"标题：{title}\n\n语音转写稿：\n---\n{text[:SUMMARY_MAX_INPUT_CHARS]}\n---"
    try:
        result = await agent.run(prompt)
        summary = (result.output or "").strip()
        return summary or None
    except Exception as e:  # noqa: BLE001 — summarization is best-effort
        logger.warning("Transcript summarization failed: %s", e)
        return None
