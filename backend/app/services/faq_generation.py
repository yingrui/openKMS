"""Service for generating FAQ pairs from document content using an LLM."""
import json
import logging
from typing import Any

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

TRUNCATE_CHARS = 12000

DEFAULT_FAQ_PROMPT = """You are an expert at reading documents and generating useful FAQ pairs.
Given document content, generate question-answer pairs that capture the key information.
Each pair should have a clear, standalone question and a concise, accurate answer.

Respond ONLY with a JSON array of objects, each with "question" and "answer" keys.
Example: [{"question": "What is X?", "answer": "X is ..."}]
Generate between 3 and 10 FAQ pairs depending on document length and richness."""


async def generate_faq_pairs(
    markdown: str,
    model_config: dict[str, Any],
    max_pairs: int = 10,
    custom_prompt: str | None = None,
) -> list[dict[str, str]]:
    """
    Generate FAQ pairs from document markdown using an LLM.

    Args:
        markdown: Document content in markdown.
        model_config: Dict with base_url, api_key, model_name.
        max_pairs: Maximum number of FAQ pairs to generate.
        custom_prompt: Optional custom system prompt; falls back to DEFAULT_FAQ_PROMPT.

    Returns:
        List of dicts with "question" and "answer" keys.
    """
    if not markdown or not markdown.strip():
        return []

    base_url = model_config["base_url"].rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )

    system_prompt = custom_prompt.strip() if custom_prompt and custom_prompt.strip() else DEFAULT_FAQ_PROMPT

    truncated = markdown[:TRUNCATE_CHARS]
    user_prompt = (
        f"Document:\n---\n{truncated}\n---\n\n"
        f"Generate up to {max_pairs} FAQ pairs from this document. "
        f"Respond with a JSON array only."
    )

    try:
        response = await client.chat.completions.create(
            model=model_config.get("model_name", "gpt-4"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )
        content = response.choices[0].message.content or "[]"
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        pairs = json.loads(content)
        if not isinstance(pairs, list):
            logger.warning("LLM returned non-list for FAQ generation")
            return []

        valid = []
        for p in pairs:
            if isinstance(p, dict) and "question" in p and "answer" in p:
                valid.append({"question": str(p["question"]), "answer": str(p["answer"])})
        return valid[:max_pairs]

    except json.JSONDecodeError as e:
        logger.warning("Failed to parse LLM FAQ response as JSON: %s", e)
        return []
    except Exception as e:
        logger.error("FAQ generation failed: %s", e)
        raise ValueError(f"FAQ generation failed: {e}") from e
