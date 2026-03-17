"""GlossaryTerm model for bilingual terms with synonyms."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GlossaryTerm(Base):
    """Bilingual term (EN/CN) with synonyms belonging to a glossary."""

    __tablename__ = "glossary_terms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    glossary_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("glossaries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    primary_en: Mapped[str | None] = mapped_column(String(512), nullable=True)
    primary_cn: Mapped[str | None] = mapped_column(String(512), nullable=True)
    definition: Mapped[str | None] = mapped_column(Text, nullable=True)
    synonyms_en: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True, default=list)
    synonyms_cn: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
