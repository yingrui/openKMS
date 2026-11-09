"""Service for suggesting glossary term translations and synonyms using an LLM."""
import json
import logging
from typing import Any

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

SUGGEST_PROMPT = """You are a bilingual (English/Chinese) domain term expert. Given a primary term in one language, suggest:
1. The translation in the other language
2. A concise definition (1-2 sentences explaining what the term means)
3. Common synonyms/acronyms in both languages

Respond with a JSON object ONLY, with these keys:
- primary_en: string (English term, empty if input was Chinese)
- primary_cn: string (Chinese term, empty if input was English)
- definition: string (concise definition of the term in 1-2 sentences)
- synonyms_en: array of strings (English synonyms, e.g. acronyms, alternate phrasings)
- synonyms_cn: array of strings (Chinese synonyms)

If input is in English, fill primary_cn, definition, and synonyms; if Chinese, fill primary_en, definition, and synonyms.
Keep synonyms focused and relevant (3-6 items each max). Use empty arrays if none apply."""


async def suggest_glossary_term(
    primary_en: str | None,
    primary_cn: str | None,
    model_config: dict[str, Any],
) -> dict[str, Any]:
    """
    Suggest translation and synonyms for a glossary term using an LLM.

    Args:
        primary_en: Primary English term (if user entered it).
        primary_cn: Primary Chinese term (if user entered it).
        model_config: Dict with base_url, api_key, model_name.

    Returns:
        Dict with primary_en, primary_cn, synonyms_en, synonyms_cn.
    """
    if not primary_en and not primary_cn:
        return {
            "primary_en": "",
            "primary_cn": "",
            "definition": "",
            "synonyms_en": [],
            "synonyms_cn": [],
        }

    en_val = (primary_en or "").strip()
    cn_val = (primary_cn or "").strip()
    if not en_val and not cn_val:
        return {"primary_en": "", "primary_cn": "", "definition": "", "synonyms_en": [], "synonyms_cn": []}

    base_url = model_config.get("base_url", "").rstrip("/")
    if base_url and not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )

    if en_val and cn_val:
        user_prompt = f"Term: English=\"{en_val}\", Chinese=\"{cn_val}\". Suggest synonyms for both."
    elif en_val:
        user_prompt = f"English term: \"{en_val}\". Suggest Chinese translation and synonyms for both languages."
    else:
        user_prompt = f"Chinese term: \"{cn_val}\". Suggest English translation and synonyms for both languages."

    try:
        response = await client.chat.completions.create(
            model=model_config.get("model_name", "gpt-4"),
            messages=[
                {"role": "system", "content": SUGGEST_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )
        content = response.choices[0].message.content or "{}"
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        data = json.loads(content)
        if not isinstance(data, dict):
            return {"primary_en": en_val, "primary_cn": cn_val, "definition": "", "synonyms_en": [], "synonyms_cn": []}

        out_en = data.get("primary_en")
        out_cn = data.get("primary_cn")
        out_def = data.get("definition")
        syn_en = data.get("synonyms_en")
        syn_cn = data.get("synonyms_cn")

        # Preserve user input
        if en_val and (not out_en or not str(out_en).strip()):
            out_en = en_val
        elif not en_val and out_en:
            out_en = str(out_en).strip()
        else:
            out_en = str(out_en).strip() if out_en else en_val

        if cn_val and (not out_cn or not str(out_cn).strip()):
            out_cn = cn_val
        elif not cn_val and out_cn:
            out_cn = str(out_cn).strip()
        else:
            out_cn = str(out_cn).strip() if out_cn else cn_val

        return {
            "primary_en": out_en or "",
            "primary_cn": out_cn or "",
            "definition": str(out_def).strip() if out_def else "",
            "synonyms_en": [str(s) for s in syn_en] if isinstance(syn_en, list) else [],
            "synonyms_cn": [str(s) for s in syn_cn] if isinstance(syn_cn, list) else [],
        }

    except json.JSONDecodeError as e:
        logger.warning("Failed to parse LLM suggest response: %s", e)
        return {"primary_en": en_val, "primary_cn": cn_val, "definition": "", "synonyms_en": [], "synonyms_cn": []}
    except Exception as e:
        logger.error("Glossary term suggestion failed: %s", e)
        raise ValueError(f"Suggestion failed: {e}") from e
