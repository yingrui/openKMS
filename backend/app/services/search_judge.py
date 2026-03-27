"""LLM judge for evaluating search retrieval quality."""
import json
import logging
from typing import Any

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

JUDGE_PROMPT = """You are evaluating retrieval quality for a RAG system.

Query: {query}
Expected answer (ground truth): {expected_answer}

Retrieved passages:
{formatted_results}

Task: Judge whether the retrieved passages contain information that supports or matches the expected answer. Consider relevance, coverage, and factual alignment.

Respond with JSON only, no other text: {{"pass": true|false, "score": 0.0-1.0, "reasoning": "brief explanation"}}
- pass: true if the passages support the expected answer, false otherwise
- score: 0.0 to 1.0 indicating how well the passages support the answer
- reasoning: one or two sentences explaining your judgment"""


async def judge_search_results(
    query: str,
    expected_answer: str,
    search_results: list[dict[str, Any]],
    model_config: dict[str, Any],
) -> dict[str, Any]:
    """
    Use an LLM to judge whether search results support the expected answer.

    Args:
        query: The user query.
        expected_answer: Ground truth answer.
        search_results: List of dicts with at least "content", "score", "source_type".
        model_config: Dict with base_url, api_key, model_name.

    Returns:
        Dict with pass (bool), score (float), reasoning (str).
    """
    formatted = []
    for i, r in enumerate(search_results[:10], 1):
        content = (r.get("content") or "")[:2000]
        score = r.get("score", 0)
        stype = r.get("source_type", "unknown")
        formatted.append(f"[{i}] ({stype}, score={score})\n{content}")

    formatted_results = "\n\n".join(formatted) if formatted else "(No results)"

    prompt = JUDGE_PROMPT.format(
        query=query,
        expected_answer=expected_answer,
        formatted_results=formatted_results,
    )

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
                {"role": "system", "content": "You are a retrieval quality evaluator. Respond only with valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
        )
        content = (response.choices[0].message.content or "{}").strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        data = json.loads(content)
        if not isinstance(data, dict):
            return {"pass": False, "score": 0.0, "reasoning": "Invalid judge response"}

        return {
            "pass": bool(data.get("pass", False)),
            "score": float(data.get("score", 0.0)),
            "reasoning": str(data.get("reasoning", "")),
        }
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse judge response as JSON: %s", e)
        return {"pass": False, "score": 0.0, "reasoning": f"Parse error: {e}"}
    except Exception as e:
        logger.error("Judge failed: %s", e)
        return {"pass": False, "score": 0.0, "reasoning": str(e)}


QA_JUDGE_PROMPT = """You are evaluating end-to-end question answering for a RAG / knowledge base system.

User question: {query}
Expected answer (ground truth): {expected_answer}

Model-generated answer:
{generated_answer}

Optional cited sources (snippets the model may have used):
{formatted_sources}

Task: Judge whether the generated answer adequately addresses the question and is consistent with the expected answer. Allow paraphrasing; penalize contradictions, missing key facts, or hallucinations.

Respond with JSON only, no other text: {{"pass": true|false, "score": 0.0-1.0, "reasoning": "brief explanation"}}
- pass: true if the answer is satisfactory relative to the expected answer
- score: 0.0 to 1.0
- reasoning: one or two sentences"""


async def judge_qa_answer(
    query: str,
    expected_answer: str,
    generated_answer: str,
    sources: list[dict[str, Any]],
    model_config: dict[str, Any],
) -> dict[str, Any]:
    """LLM judge: generated QA answer vs expected answer."""
    formatted = []
    for i, r in enumerate(sources[:10], 1):
        content = (r.get("content") or "")[:1500]
        score = r.get("score", 0)
        stype = r.get("source_type", "unknown")
        formatted.append(f"[{i}] ({stype}, score={score})\n{content}")
    formatted_sources = "\n\n".join(formatted) if formatted else "(No sources provided)"

    prompt = QA_JUDGE_PROMPT.format(
        query=query,
        expected_answer=expected_answer,
        generated_answer=generated_answer or "(empty answer)",
        formatted_sources=formatted_sources,
    )

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
                {"role": "system", "content": "You are a QA quality evaluator. Respond only with valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
        )
        content = (response.choices[0].message.content or "{}").strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        data = json.loads(content)
        if not isinstance(data, dict):
            return {"pass": False, "score": 0.0, "reasoning": "Invalid judge response"}

        return {
            "pass": bool(data.get("pass", False)),
            "score": float(data.get("score", 0.0)),
            "reasoning": str(data.get("reasoning", "")),
        }
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse QA judge response as JSON: %s", e)
        return {"pass": False, "score": 0.0, "reasoning": f"Parse error: {e}"}
    except Exception as e:
        logger.error("QA judge failed: %s", e)
        return {"pass": False, "score": 0.0, "reasoning": str(e)}
