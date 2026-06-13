"""Pydantic schemas for wiki spaces, pages, and files."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class WikiSpaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    description: str | None = None


class WikiSpaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = None
    semantic_similarity_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    semantic_match_top_k: int | None = Field(default=None, ge=1, le=500)
    semantic_embedding_model_id: str | None = None


class WikiSpaceResponse(BaseModel):
    id: str
    name: str
    description: str | None
    semantic_similarity_threshold: float = 0.4
    semantic_match_top_k: int = 10
    semantic_embedding_model_id: str | None = None
    last_semantic_index_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    page_count: int = 0


class WikiSpaceListResponse(BaseModel):
    items: list[WikiSpaceResponse]
    total: int
    limit: int
    offset: int


class WikiPageCreate(BaseModel):
    path: str = Field(min_length=1, max_length=512)
    title: str = Field(min_length=1, max_length=512)
    body: str = ""
    metadata: dict[str, Any] | None = None


class WikiPageUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    body: str | None = None
    metadata: dict[str, Any] | None = None


class WikiPageUpsertBody(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    body: str = ""
    metadata: dict[str, Any] | None = None


class WikiPageResponse(BaseModel):
    id: str
    wiki_space_id: str
    path: str
    title: str
    body: str
    metadata: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class WikiPageListItem(BaseModel):
    """Lightweight row for ``GET .../pages`` (no markdown body — use ``GET .../pages/{id}``)."""

    id: str
    wiki_space_id: str
    path: str
    title: str
    metadata: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class WikiPageListResponse(BaseModel):
    """Page list; ``total`` counts all rows matching ``path_prefix`` when paginating."""

    items: list[WikiPageListItem]
    total: int
    limit: int | None = None  # None = client omitted limit (full ``items``)
    offset: int = 0


class WikiSemanticIndexResponse(BaseModel):
    """Result of offline wiki page embedding (default embedding ApiModel)."""

    indexed: int
    failed: int
    embedding_model_id: str
    embedding_model_label: str


class WikiSemanticMatchedPage(BaseModel):
    """One semantic hit from ``GET .../pages/semantic-matches``."""

    page_id: str = Field(description="Wiki page id.")
    similarity: float = Field(
        description="Cosine similarity ``1 - (embedding <=> query)`` (higher is closer; same scale as ``semantic_similarity_threshold``).",
    )


class WikiSemanticMatchIdsResponse(BaseModel):
    """Page ids / scores from wiki page search (title/path substring and optional semantic vectors)."""

    string_matched_page_ids: list[str] = Field(
        default_factory=list,
        description="Substring match on title or path only (case-insensitive).",
    )
    semantic_matched_pages: list[WikiSemanticMatchedPage] = Field(
        default_factory=list,
        description="Nearest pages with stored embeddings, ordered by similarity; empty when string matches short-circuit, semantic_skipped, or the space has no indexed embeddings yet.",
    )
    semantic_skipped: bool = False


class WikiFileResponse(BaseModel):
    id: str
    wiki_space_id: str
    wiki_page_id: str | None
    filename: str
    content_type: str | None
    size_bytes: int
    created_at: datetime


class WikiFileListResponse(BaseModel):
    items: list[WikiFileResponse]
    total: int


class WikiSpaceDocumentLinkResponse(BaseModel):
    """A channel document linked to this wiki space."""

    id: str
    document_id: str
    name: str
    file_type: str
    channel_id: str
    linked_at: datetime
    updated_at: datetime = Field(
        description="Last update time of the linked `documents` row (metadata/content).",
    )


class WikiSpaceDocumentListResponse(BaseModel):
    items: list[WikiSpaceDocumentLinkResponse]
    total: int


class WikiSpaceDocumentLinkCreate(BaseModel):
    document_id: str = Field(min_length=1, max_length=64)


class WikiVaultImportResponse(BaseModel):
    pages_upserted: int
    files_uploaded: int
    skipped: list[str]
    warnings: list[str]


class WikiVaultMarkdownFileBody(BaseModel):
    """Single vault markdown file: path relative to vault root (e.g. wiki/note.md)."""

    vault_path: str = Field(min_length=1, max_length=512)
    body: str = ""


class WikiVaultMarkdownImportResponse(BaseModel):
    wiki_path: str
    warnings: list[str]


class WikiLinkGraphNode(BaseModel):
    id: str
    path: str
    title: str


class WikiLinkGraphLink(BaseModel):
    source: str
    target: str


class WikiLinkGraphResponse(BaseModel):
    """Directed page graph: edges are ``source`` page linking to ``target`` page."""

    nodes: list[WikiLinkGraphNode]
    links: list[WikiLinkGraphLink]
    source_max_updated_at: datetime | None = None
