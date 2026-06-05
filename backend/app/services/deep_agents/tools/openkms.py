"""JWT-authenticated openKMS tools for project agents."""

from __future__ import annotations

import json
from typing import Any

import httpx
from langchain_core.tools import tool

from app.config import settings


def _headers(bearer_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {bearer_token}", "Accept": "application/json"}


def _get(path: str, token: str, params: dict | None = None) -> Any:
    url = f"{settings.openkms_backend_url.rstrip('/')}{path}"
    with httpx.Client(timeout=60.0) as client:
        r = client.get(url, headers=_headers(token), params=params)
        r.raise_for_status()
        return r.json()


def _post(path: str, token: str, body: dict) -> Any:
    url = f"{settings.openkms_backend_url.rstrip('/')}{path}"
    with httpx.Client(timeout=120.0) as client:
        r = client.post(url, headers={**_headers(token), "Content-Type": "application/json"}, json=body)
        r.raise_for_status()
        return r.json()


def make_openkms_tools(bearer_token: str, permissions: set[str]) -> list:
    tools: list = []

    if "documents:read" in permissions or "all" in permissions:

        @tool
        def global_search(query: str, limit: int = 10) -> str:
            """Search documents, articles, wiki, and knowledge bases across openKMS."""
            data = _get("/api/search", token=bearer_token, params={"q": query, "limit": limit})
            return json.dumps(data, ensure_ascii=False, default=str)[:48_000]

        tools.append(global_search)

    if "wikis:read" in permissions or "all" in permissions:

        @tool
        def search_wiki_pages(space_id: str, query: str) -> str:
            """Semantic/substring search wiki pages in a space."""
            data = _get(
                f"/api/wiki-spaces/{space_id}/pages/search",
                token=bearer_token,
                params={"q": query},
            )
            return json.dumps(data, ensure_ascii=False, default=str)[:48_000]

        @tool
        def get_wiki_page(space_id: str, page_id: str) -> str:
            """Fetch wiki page markdown by id."""
            data = _get(f"/api/wiki-spaces/{space_id}/pages/{page_id}", token=bearer_token)
            return json.dumps(data, ensure_ascii=False, default=str)[:48_000]

        tools.extend([search_wiki_pages, get_wiki_page])

    if "knowledge_bases:read" in permissions or "all" in permissions:

        @tool
        def kb_search(kb_id: str, query: str) -> str:
            """Hybrid search in a knowledge base."""
            data = _post(f"/api/knowledge-bases/{kb_id}/search", token=bearer_token, body={"query": query})
            return json.dumps(data, ensure_ascii=False, default=str)[:48_000]

        tools.append(kb_search)

    if "ontology:read" in permissions or "all" in permissions:

        @tool
        def ontology_ask(question: str) -> str:
            """Ask the ontology graph a natural-language question."""
            data = _post("/api/ontology/ask", token=bearer_token, body={"question": question})
            return json.dumps(data, ensure_ascii=False, default=str)[:48_000]

        tools.append(ontology_ask)

    return tools
