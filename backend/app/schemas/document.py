from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class DocumentBase(BaseModel):
    name: str
    channel_id: str = "dc1a"
    file_type: str = "PDF"


class DocumentCreate(DocumentBase):
    pass


class DocumentResponse(BaseModel):
    id: str
    name: str
    file_type: str
    size_bytes: int = 0
    channel_id: str = "dc1a"
    file_hash: Optional[str] = None
    markdown: Optional[str] = None
    parsing_result: Optional[dict[str, Any]] = None
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
