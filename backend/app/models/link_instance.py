"""LinkInstance model for ontology link instances."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LinkInstance(Base):
    """A link someone created by hand (e.g. COVID-19 covered by Health Plan A).

    The endpoints are object ids as the API shows them — ``__rid`` for hand-created types, the
    business key for dataset-backed ones (see ``object_neo4j_store.resolve_write_id_column``).
    They are deliberately *not* foreign keys to ``object_instances``: that table is the write queue,
    and a dataset-backed object has no row there. Referential integrity lives in the graph, which
    is also the read path; deleting an object removes the links that name it.
    """

    __tablename__ = "link_instances"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    link_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("link_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_object_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_object_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
