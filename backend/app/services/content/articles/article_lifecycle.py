"""Article lifecycle: same applicability rules as documents for future KB use."""

from datetime import datetime

from app.models.article import Article
from app.lifecycle import row_effective_for_rag


def article_effective_for_rag(row: Article, at: datetime | None = None) -> bool:
    """Is this row in force for retrieval? The rule itself lives in `app.lifecycle`."""
    return row_effective_for_rag(row, at)
