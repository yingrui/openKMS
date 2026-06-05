"""Optional web search tools for deep research."""

from __future__ import annotations

import json

import httpx
from langchain_core.tools import tool

from app.config import settings


def make_web_search_tools() -> list:
    if not settings.agent_web_search_enabled or not settings.agent_web_search_api_key:
        return []

    api_key = settings.agent_web_search_api_key
    base = (settings.agent_web_search_base_url or "https://api.tavily.com").rstrip("/")

    @tool
    def web_search(query: str, max_results: int = 5) -> str:
        """Search the web for current information."""
        with httpx.Client(timeout=60.0) as client:
            r = client.post(
                f"{base}/search",
                json={"api_key": api_key, "query": query, "max_results": max_results},
            )
            r.raise_for_status()
            return json.dumps(r.json(), ensure_ascii=False)[:48_000]

    return [web_search]
