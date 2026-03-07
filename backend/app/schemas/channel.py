"""Channel schemas."""
from pydantic import BaseModel

class ChannelNode(BaseModel):
    id: str
    name: str
    description: str | None = None
    children: list["ChannelNode"] = []

    model_config = {"from_attributes": True}

ChannelNode.model_rebuild()

class ChannelCreate(BaseModel):
    name: str
    parent_id: str | None = None
    sort_order: int = 0
