"""Metric rules and their alerts — operational rows, not ontology objects.

A rule is "a metric must be consistent with these metrics, within this tolerance, this period". It has a
foreign key to the metric it watches, a status, a version, and a last run; an alert has the rule it came
from, a dedupe key and two timestamps. That is a table, not a graph node: there is nothing to traverse, and
storing it as a JSONB blob meant no constraints (a deleted metric left rules pointing at nothing), no
indexable period, and an evaluation path that depended on Neo4j being up.

`payload` keeps the shape the evaluator already speaks (a dict of rule fields, JSON strings for the three
nested documents), so the verdict logic did not have to be rewritten to change storage.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _dumps(value: Any) -> str | None:
    return json.dumps(value, ensure_ascii=False) if value is not None else None


def _loads(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return value


class MetricRule(Base):
    """The equalities (or the threshold) a metric must satisfy, checked together."""

    __tablename__ = "metric_rules"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    #: A stable slug for humans and exports; unique, immutable in practice.
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    #: The metric the rule watches (and whose permissions apply).
    metric_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("metric_definitions.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    condition: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    #: One or more identities, all asserted together: `[{target, members, tolerance}, …]`. A rule about a
    #: snapshot's four numbers is one rule with four identities, not four rules that drift apart.
    identities: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    severity: Mapped[str] = mapped_column(String(2), nullable=False, default="P1")
    conclusion: Mapped[str] = mapped_column(Text, nullable=False, default="")
    suggestion: Mapped[str] = mapped_column(Text, nullable=False, default="")
    owner: Mapped[str | None] = mapped_column(String(256), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    group_by: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    #: How this check uses the run's period: which time dimension to filter, or none, and how many
    #: periods back. The *value* of the period is a run argument; the alignment is the rule's decision.
    run_params: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    last_run_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    last_period_start: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_period_end: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def payload(self) -> dict[str, Any]:
        """The dict the evaluator speaks; nested documents stay JSON strings, as they always were."""
        return {
            "rule_id": self.slug,
            "name": self.name,
            "subject": _dumps({"kind": "metric", "ref": self.metric_id}),
            "condition": _dumps(self.condition),
            "identities": _dumps(self.identities),
            "severity": self.severity,
            "conclusion": self.conclusion,
            "suggestion": self.suggestion,
            "owner": self.owner,
            "status": self.status,
            "version": self.version,
            "group_by": _dumps(self.group_by),
            "run_params": _dumps(self.run_params),
            "last_run_at": self.last_run_at,
            "last_status": self.last_status,
            "last_period_start": self.last_period_start,
            "last_period_end": self.last_period_end,
            "last_reason": self.last_reason,
        }

    def apply_payload(self, data: dict[str, Any]) -> None:
        """Write back a payload produced by the evaluator (last run fields)."""
        self.last_run_at = data.get("last_run_at")
        self.last_status = data.get("last_status")
        self.last_period_start = data.get("last_period_start")
        self.last_period_end = data.get("last_period_end")
        self.last_reason = data.get("last_reason")
        if "version" in data:
            self.version = int(data["version"] or 1)


class MetricEvent(Base):
    """An alert raised by a rule for one scope and one period."""

    __tablename__ = "metric_events"
    __table_args__ = (
        # One open alert per rule + scope + period: the dedupe key is the constraint, not a convention.
        Index("ix_metric_events_dedupe", "dedupe_key"),
        Index("ix_metric_events_rule_period", "rule_id", "period_start", "period_end"),
        Index("ix_metric_events_metric", "metric_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    rule_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("metric_rules.id", ondelete="CASCADE"), nullable=False
    )
    #: Denormalised so "alerts for this metric" needs no join, and survives a rule rename.
    metric_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    #: `rule_slug|scope|period` — the event's own business identity.
    event_id: Mapped[str] = mapped_column(String(512), nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(512), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    severity: Mapped[str] = mapped_column(String(2), nullable=False, default="P1")
    intent: Mapped[str] = mapped_column(String(16), nullable=False, default="warning")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    scope: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    group_field: Mapped[str | None] = mapped_column(String(128), nullable=True)
    period_start: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    period_end: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    period_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    evidence: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    event_start_time: Mapped[str] = mapped_column(String(40), nullable=False)
    event_end_time: Mapped[str | None] = mapped_column(String(40), nullable=True)
    assignee: Mapped[str | None] = mapped_column(String(256), nullable=True)
    rule_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def is_open(self) -> bool:
        return not self.event_end_time

    def payload(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "severity": self.severity,
            "intent": self.intent,
            "status": self.status,
            "event_start_time": self.event_start_time,
            "event_end_time": self.event_end_time,
            "period_start": self.period_start,
            "period_end": self.period_end,
            "period_label": self.period_label,
            "scope": self.scope,
            "description": self.description,
            "evidence": self.evidence,
            "rule_id": None,  # filled by the caller from the joined rule
            "rule_object_id": self.rule_id,
            "rule_version": self.rule_version,
            "subject_type": "metric",
            "subject_id": self.metric_id,
            "assignee": self.assignee,
        }


class MetricRuleRef(Base):
    """Which metrics a rule references — a real table now, with real foreign keys."""

    __tablename__ = "metric_rule_metric_refs"
    __table_args__ = (Index("ix_metric_rule_refs_metric", "metric_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    rule_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("metric_rules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    metric_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("metric_definitions.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    #: Set when the reference is the rule's subject; kept for readable listings.
    is_subject: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
