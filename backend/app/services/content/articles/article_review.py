"""LLM-based intrinsic content review for articles."""

import logging
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from pydantic_ai import Agent, PromptedOutput
from pydantic_ai.exceptions import ModelAPIError
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.profiles.openai import OpenAIModelProfile
from pydantic_ai.providers.openai import OpenAIProvider

logger = logging.getLogger(__name__)

TRUNCATE_CHARS = 24000

# DeepSeek and some OpenAI-compatible APIs reject response_format json_schema.
_LLM_REVIEW_PROFILE = OpenAIModelProfile(
    supports_json_schema_output=False,
    supports_json_object_output=True,
)

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


class ReviewCriterionScore(BaseModel):
    id: str
    score: float = Field(ge=1, le=5)
    notes: str = ""


class ArticleReviewLLMOutput(BaseModel):
    overall_score: float = Field(ge=0, le=1)
    pass_: bool = Field(alias="pass")
    summary: str = ""
    criteria: list[ReviewCriterionScore] = []
    suggestions: list[str] = []

    model_config = {"populate_by_name": True}


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


def _build_review_prompt(
    *,
    title: str,
    markdown: str,
    normalized: list[dict[str, str]],
) -> str:
    criteria_ids = [c["id"] for c in normalized]
    return f"""Article title: {title}

Criteria (score each 1–5):
{_format_criteria_block(normalized)}

Article body:
---
{markdown[:TRUNCATE_CHARS]}
---

Rules:
- Include one entry in "criteria" for each id: {", ".join(criteria_ids)}
- "pass" is true when the article is acceptable for publication without major edits (use your judgment)
- "suggestions" lists concrete edits; use an empty array if none
"""


def _result_from_output(
    data: ArticleReviewLLMOutput,
    normalized: list[dict[str, str]],
) -> dict[str, Any]:
    crit_out: list[dict[str, Any]] = []
    for item in data.criteria:
        cid = item.id.strip()
        if not cid:
            continue
        crit_out.append({
            "id": cid,
            "label": next((c["label"] for c in normalized if c["id"] == cid), cid),
            "score": max(1.0, min(5.0, float(item.score))),
            "notes": item.notes or "",
        })
    return {
        "overall_score": max(0.0, min(1.0, float(data.overall_score))),
        "pass": data.pass_,
        "summary": data.summary or "",
        "criteria": crit_out,
        "suggestions": [str(s) for s in data.suggestions if s],
    }


def _openai_model_from_config(model_config: dict[str, Any]) -> OpenAIChatModel:
    base_url = model_config.get("base_url", "").rstrip("/")
    if base_url and not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"
    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )
    provider = OpenAIProvider(openai_client=client)
    return OpenAIChatModel(
        model_config.get("model_name", "gpt-4o-mini"),
        provider=provider,
        profile=_LLM_REVIEW_PROFILE,
    )


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
    prompt = _build_review_prompt(title=title, markdown=markdown, normalized=normalized)

    agent = Agent(
        _openai_model_from_config(model_config),
        output_type=PromptedOutput(ArticleReviewLLMOutput),
        system_prompt=system_prompt,
    )

    try:
        result = await agent.run(prompt)
        output = result.output
        if not isinstance(output, ArticleReviewLLMOutput):
            raise ValueError("Review response did not match the expected schema")
        return _result_from_output(output, normalized)
    except ModelAPIError as e:
        status = getattr(e, "status_code", 502)
        logger.warning("Article review HTTP error: %s %s", status, str(e)[:200])
        raise ValueError(f"Article review failed: HTTP {status}") from e
    except Exception as e:
        logger.error("Article review failed: %s", e)
        raise ValueError(f"Article review failed: {e}") from e
