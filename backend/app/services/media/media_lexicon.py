"""Glossary-driven transcript correction and ASR hotword selection.

A glossary term's ``primary_cn`` is the canonical spelling and ``synonyms_cn``
holds the variants — including the ways speech recognition mangles it. That one
table therefore drives three things: biasing the decoder (hotwords), repairing
the transcript afterwards (corrections), and normalising synonyms downstream.

The two layers are deliberately different in kind, and measurement says only one
of them earns its place by default.

Corrections are exact replacements: they cannot drop content, so they are pure
gain. Hotwords only *bias* the decoder — and on this corpus that bias made the
decoder skip whole passages. Measured against a clip whose script we have
verbatim: 94.8% coverage with neither layer, 95.8% with corrections alone, but
only 84.5% once 29 hotwords were added, which lost two complete sentences.

So hotwords are off unless a caller explicitly asks for them, and the docstring
on ``select_hotwords`` says what to check before turning them on.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.glossary import Glossary
from app.models.glossary_term import GlossaryTerm

logger = logging.getLogger(__name__)

# Whisper silently truncates the hotword prompt to ``max_length // 2 - 1`` = 223
# tokens (see faster_whisper.transcribe.get_prompt). Chinese runs roughly 1.4
# tokens per character, so stay well inside that with a character budget.
HOTWORD_CHAR_BUDGET = 140

# Always worth biasing towards, whatever the clip is about.
CORE_HOTWORDS = ("安利", "纽崔莱")


async def load_glossary_lexicon(
    db: AsyncSession, glossary_id: str
) -> tuple[dict[str, str], list[str]]:
    """Read one glossary into (corrections, canonical terms).

    ``corrections`` maps every synonym to its canonical term. Synonyms that are
    also canonical terms elsewhere are dropped: rewriting a real term into
    another one would corrupt the transcript rather than repair it.
    """
    glossary = await db.get(Glossary, glossary_id)
    if not glossary:
        logger.warning("Glossary %s not found; skipping transcript correction", glossary_id)
        return {}, []

    rows = (
        await db.execute(select(GlossaryTerm).where(GlossaryTerm.glossary_id == glossary_id))
    ).scalars().all()

    canonical = {r.primary_cn.strip() for r in rows if (r.primary_cn or "").strip()}
    corrections: dict[str, str] = {}
    for row in rows:
        primary = (row.primary_cn or "").strip()
        if not primary:
            continue
        for syn in row.synonyms_cn or []:
            syn = (syn or "").strip()
            if syn and syn != primary and syn not in canonical:
                corrections[syn] = primary
    return corrections, sorted(canonical)


def apply_corrections(text: str, corrections: dict[str, str]) -> tuple[str, list[dict[str, Any]]]:
    """Replace known mis-transcriptions. Returns the text and an audit trail.

    Longer keys are applied first so a specific variant wins over a shorter one
    it contains ("细胞卡塌" before "卡塌").
    """
    if not text or not corrections:
        return text, []
    applied: list[dict[str, Any]] = []
    for wrong in sorted(corrections, key=len, reverse=True):
        count = text.count(wrong)
        if count:
            right = corrections[wrong]
            text = text.replace(wrong, right)
            applied.append({"from": wrong, "to": right, "count": count})
    return text, applied


def correct_transcript(
    transcript: dict[str, Any], corrections: dict[str, str]
) -> list[dict[str, Any]]:
    """Correct a transcript payload in place. Returns the audit trail."""
    if not transcript or not corrections:
        return []
    for seg in transcript.get("segments") or []:
        seg["text"], _ = apply_corrections(seg.get("text", ""), corrections)
    transcript["text"], applied = apply_corrections(transcript.get("text", ""), corrections)
    if applied:
        transcript["corrections_applied"] = applied
    return applied


def select_hotwords(terms: list[str], context: str, budget: int = HOTWORD_CHAR_BUDGET) -> str:
    """Pick the hotwords most likely to matter for this clip, within budget.

    Opt-in only — see the module docstring for why. If you do enable hotwords,
    compare the transcript length against a run without them before trusting the
    result: the failure mode is silently dropped speech, not a visible error.

    Terms already named in the title/description come first — they are what the
    clip is demonstrably about. The rest fill the remaining budget in the order
    the glossary gives them, which keeps the choice stable across re-runs.
    """
    context = context or ""
    chosen: list[str] = []
    used = 0

    def take(term: str) -> None:
        nonlocal used
        cost = len(term) + 1
        if term not in chosen and used + cost <= budget:
            chosen.append(term)
            used += cost

    for term in CORE_HOTWORDS:
        if term in terms:
            take(term)
    for term in terms:
        if term and term in context:
            take(term)
    for term in terms:
        take(term)
    return " ".join(chosen)
