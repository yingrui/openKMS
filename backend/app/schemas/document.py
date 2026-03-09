from datetime import datetime
from typing import Any

from pydantic import BaseModel


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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


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
