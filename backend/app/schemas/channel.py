"""Channel schemas."""
from pydantic import BaseModel


class ChannelNode(BaseModel):
    id: str
    name: str
    description: str | None = None
    pipeline_id: str | None = None
    auto_process: bool = False
    children: list["ChannelNode"] = []

    model_config = {"from_attributes": True}

ChannelNode.model_rebuild()


class ChannelCreate(BaseModel):
    name: str
    parent_id: str | None = None
    sort_order: int = 0


class ChannelUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    pipeline_id: str | None = None
    auto_process: bool | None = None
    sort_order: int | None = None
