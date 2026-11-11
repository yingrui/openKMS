"""Evaluation model: query + expected answer pairs for a knowledge base (and optional wiki space)."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Evaluation(Base):
    """Evaluation: query + expected answer pairs for a knowledge base (and optional wiki space)."""

    __tablename__ = "evaluations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    knowledge_base_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: What an item holds: `answer` (prose ground truth), `query` (the query an answer must cite), `content`
    #: (text a wiki answer must cover). It decides which columns the editor shows and which run types are allowed,
    #: so it is a property of the data set, not of a run.
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="answer", server_default="answer")
    #: A data-query evaluation judges a semantic model's answers; null for the RAG types.
    semantic_model_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("semantic_models.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: For a restricted model, the data resource the evaluator acts as when reading answers.
    data_resource_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    wiki_space_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("wiki_spaces.id", ondelete="SET NULL"), nullable=True, index=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EvaluationItem(Base):
    """Single evaluation item: query + expected answer."""

    __tablename__ = "evaluation_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    evaluation_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("evaluations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    query: Mapped[str] = mapped_column(Text, nullable=False)
    #: Null for a `query` item: the ground truth is the query, not a sentence.
    expected_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Data-query ground truth: every query the answer should have made (see docs/features/data-query-evaluation.md).
    expected_query: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    topic: Mapped[str | None] = mapped_column(String(256), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
