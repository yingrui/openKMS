"""Metric references of a rule — a projection over `condition` / `relation` (see rules/refs.py)."""
from __future__ import annotations

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
# Imported for its side effect: the FK below targets `metric_definitions`, and SQLAlchemy needs that table
# registered in the same metadata whenever this model is imported on its own.
from app.models.metric_definition import MetricDefinition  # noqa: F401


class RuleMetricRef(Base):
    """One `(rule, metric, role)` triple. Derived on write; safe to rebuild at any time."""

    __tablename__ = "rule_metric_refs"
    __table_args__ = (Index("ix_rule_metric_refs_metric", "metric_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # The rule is an ontology object (`object_instances`), not a table of its own — no FK to enforce.
    rule_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    metric_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("metric_definitions.id", ondelete="CASCADE"), nullable=False
    )
    # subject | condition | target | member — where the reference appears, for a readable listing.
    role: Mapped[str] = mapped_column(String(16), nullable=False)
