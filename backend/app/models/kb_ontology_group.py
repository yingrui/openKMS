"""Knowledge base — ontology group join (scopes Neo4j schema for this KB's qa-agent)."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class KBOntologyGroup(Base):
    """Many-to-many: which ontology groups are in scope for a knowledge base's Q&A."""

    __tablename__ = "kb_ontology_groups"
    __table_args__ = (
        UniqueConstraint("knowledge_base_id", "ontology_group_id", name="uq_kb_ontology_group"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    knowledge_base_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ontology_group_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("ontology_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
