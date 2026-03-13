"""Retriever: fetch relevant chunks and FAQs via backend search API."""
import httpx

from .config import settings
from .schemas import SourceItem


def retrieve(
    knowledge_base_id: str,
    query: str,
    access_token: str,
    top_k: int = 5,
) -> list[SourceItem]:
    """Retrieve top-K relevant chunks and FAQs by calling the backend search API."""
    base = settings.openkms_backend_url.rstrip("/")
    url = f"{base}/api/knowledge-bases/{knowledge_base_id}/search"
    headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            url,
            json={"query": query, "top_k": top_k, "search_type": "all"},
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()

    results = data.get("results", [])
    return [
        SourceItem(
            id=r["id"],
            source_type=r["source_type"],
            content=r["content"],
            score=r["score"],
            source_name=r.get("source_name"),
            document_id=r.get("document_id"),
        )
        for r in results
    ]
