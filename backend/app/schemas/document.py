from datetime import datetime
from typing import Any

from pydantic import BaseModel, model_validator


class DocumentBase(BaseModel):
    name: str
    channel_id: str
    file_type: str = "PDF"


class DocumentCreate(DocumentBase):
    pass


class DocumentResponse(BaseModel):
    id: str
    name: str
    file_type: str
    size_bytes: int = 0
    channel_id: str
    file_hash: str | None = None
    status: str = "uploaded"
    markdown: str | None = None
    parsing_result: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    labels: dict[str, str | list[str]] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _map_doc_metadata(cls, data: Any) -> Any:
        """Map Document.doc_metadata to metadata (SQLAlchemy reserves 'metadata')."""
        if hasattr(data, "doc_metadata"):
            return {
                "id": data.id,
                "name": data.name,
                "file_type": data.file_type,
                "size_bytes": data.size_bytes,
                "channel_id": data.channel_id,
                "file_hash": data.file_hash,
                "status": data.status,
                "markdown": data.markdown,
                "parsing_result": data.parsing_result,
                "metadata": data.doc_metadata,
                "labels": getattr(data, "labels", None),
                "created_at": data.created_at,
                "updated_at": data.updated_at,
            }
        return data


class MetadataUpdateBody(BaseModel):
    """Body for PUT /documents/{id}/metadata."""

    metadata: dict[str, Any]


class DocumentInfoUpdateBody(BaseModel):
    """Body for PUT /documents/{id} (document info and labels)."""

    name: str | None = None
    channel_id: str | None = None
    labels: dict[str, str | list[str]] | None = None


class MarkdownUpdateBody(BaseModel):
    """Body for PUT /documents/{id}/markdown."""

    markdown: str


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int


class ParsingResultResponse(BaseModel):
    """Parsing result (result.json format for frontend)."""

    file_hash: str
    parsing_res_list: list[dict[str, Any]] = []
    layout_det_res: list[dict[str, Any]] = []
    markdown: str = ""
    page_count: int = 0
