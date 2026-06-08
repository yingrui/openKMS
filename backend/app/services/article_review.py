"""LLM-based intrinsic content review for articles."""

import json
import logging
from typing import Any

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

TRUNCATE_CHARS = 24000

DEFAULT_REVIEW_CRITERIA: list[dict[str, str]] = [
    {
        "id": "completeness",
        "label": "Completeness",
        "description": "Required topics and sections are present; no empty placeholders.",
    },
    {
        "id": "clarity",
        "label": "Clarity",
        "description": "Readable for the intended audience; terms are defined where needed.",
    },
    {
        "id": "structure",
        "label": "Structure",
        "description": "Logical headings, lists, and flow.",
    },
    {
        "id": "verifiability",
        "label": "Verifiability",
        "description": "Claims are supported by links, citations, or references.",
    },
    {
        "id": "consistency",
        "label": "Consistency",
        "description": "Terminology and formatting are consistent.",
    },
]

DEFAULT_ARTICLE_REVIEW_PROMPT = """You are an expert editorial reviewer for enterprise knowledge articles.
Evaluate the article body against each criterion on a scale of 1–5 (1 = poor, 5 = excellent).
Be specific and cite passages from the article when noting issues.
Focus on intrinsic content quality — not whether the topic matches an external ground truth.
Do not invent facts beyond what is in the article."""


def _normalize_criteria(criteria: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    if not criteria:
        return list(DEFAULT_REVIEW_CRITERIA)
    out: list[dict[str, str]] = []
    for i, item in enumerate(criteria):
        if not isinstance(item, dict):
            continue
        cid = str(item.get("id") or f"criterion_{i + 1}").strip()
        label = str(item.get("label") or cid).strip()
        desc = str(item.get("description") or "").strip()
        if cid and label:
            out.append({"id": cid, "label": label, "description": desc})
    return out or list(DEFAULT_REVIEW_CRITERIA)


def _format_criteria_block(criteria: list[dict[str, str]]) -> str:
    lines = []
    for c in criteria:
        desc = f" — {c['description']}" if c.get("description") else ""
        lines.append(f"- {c['id']} ({c['label']}){desc}")
    return "\n".join(lines)


def _strip_json_fence(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return content.strip()


async def run_article_review(
    *,
    title: str,
    markdown: str,
    model_config: dict[str, Any],
    custom_prompt: str | None = None,
    criteria: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Run an LLM rubric review on article markdown. Returns structured result dict."""
    if not markdown or not markdown.strip():
        raise ValueError("Article has no content to review")

    normalized = _normalize_criteria(criteria)
    system_prompt = (
        custom_prompt.strip()
        if custom_prompt and custom_prompt.strip()
        else DEFAULT_ARTICLE_REVIEW_PROMPT
    )

    criteria_ids = [c["id"] for c in normalized]
    user_prompt = f"""Article title: {title}

Criteria (score each 1–5):
{_format_criteria_block(normalized)}

Article body:
---
{markdown[:TRUNCATE_CHARS]}
---

Respond with JSON only:
{{
  "overall_score": 0.0-1.0,
  "pass": true|false,
  "summary": "2-4 sentence overall assessment",
  "criteria": [
    {{"id": "<criterion id>", "score": 1-5, "notes": "brief rationale"}}
  ],
  "suggestions": ["actionable improvement 1", "..."]
}}

Rules:
- Include one entry in "criteria" for each id: {", ".join(criteria_ids)}
- "pass" is true when the article is acceptable for publication without major edits (use your judgment)
- "suggestions" lists concrete edits; empty array if none
"""

    base_url = model_config.get("base_url", "").rstrip("/")
    if base_url and not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )

    try:
        response = await client.chat.completions.create(
            model=model_config.get("model_name", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
        )
        content = _strip_json_fence(response.choices[0].message.content or "{}")
        data = json.loads(content)
        if not isinstance(data, dict):
            raise ValueError("Review response was not a JSON object")

        overall = float(data.get("overall_score", 0.0))
        overall = max(0.0, min(1.0, overall))
        crit_out = []
        raw_crit = data.get("criteria")
        if isinstance(raw_crit, list):
            for item in raw_crit:
                if not isinstance(item, dict):
                    continue
                cid = str(item.get("id", "")).strip()
                if not cid:
                    continue
                score = item.get("score", 0)
                try:
                    score_f = float(score)
                except (TypeError, ValueError):
                    score_f = 0.0
                score_f = max(1.0, min(5.0, score_f))
                crit_out.append({
                    "id": cid,
                    "label": next((c["label"] for c in normalized if c["id"] == cid), cid),
                    "score": score_f,
                    "notes": str(item.get("notes") or ""),
                })

        suggestions = data.get("suggestions")
        if not isinstance(suggestions, list):
            suggestions = []
        suggestions = [str(s) for s in suggestions if s]

        return {
            "overall_score": overall,
            "pass": bool(data.get("pass", overall >= 0.7)),
            "summary": str(data.get("summary") or ""),
            "criteria": crit_out,
            "suggestions": suggestions,
        }
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse article review response: %s", e)
        raise ValueError(f"Review response was not valid JSON: {e}") from e
    except Exception as e:
        logger.error("Article review failed: %s", e)
        raise ValueError(f"Article review failed: {e}") from e
