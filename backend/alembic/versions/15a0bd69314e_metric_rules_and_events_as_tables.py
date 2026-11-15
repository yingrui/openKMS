"""metric rules and events as tables

Revision ID: 15a0bd69314e
Revises: c48c651eb56d
Create Date: 2026-11-16 00:11:15.963245

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '15a0bd69314e'
down_revision: Union[str, Sequence[str], None] = 'c48c651eb56d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rules and their alerts become rows with foreign keys.

    They were `Rule` / `Event` ontology objects (JSONB in `object_instances`, projected to Neo4j). Nothing ever
    traversed them as a graph, while the costs were real: no constraints (a deleted metric left a rule
    pointing at nothing), JSON-only querying (a separate projection table was needed just to answer "which
    rules touch this metric"), and an evaluation path that failed when Neo4j was down. The data moves here;
    the object types and their instances are removed at the end.
    """
    op.create_table(
        "metric_rules",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("metric_id", sa.String(length=64), nullable=False),
        sa.Column("condition", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("relation", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("severity", sa.String(length=2), nullable=False),
        sa.Column("conclusion", sa.Text(), nullable=False),
        sa.Column("suggestion", sa.Text(), nullable=False),
        sa.Column("owner", sa.String(length=256), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("group_by", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ai_context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("last_run_at", sa.String(length=40), nullable=True),
        sa.Column("last_status", sa.String(length=16), nullable=True),
        sa.Column("last_period_start", sa.String(length=20), nullable=True),
        sa.Column("last_period_end", sa.String(length=20), nullable=True),
        sa.Column("last_reason", sa.Text(), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["metric_id"], ["metric_definitions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_metric_rules_metric_id", "metric_rules", ["metric_id"])

    op.create_table(
        "metric_events",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("rule_id", sa.String(length=64), nullable=False),
        sa.Column("metric_id", sa.String(length=64), nullable=True),
        sa.Column("event_id", sa.String(length=512), nullable=False),
        sa.Column("dedupe_key", sa.String(length=512), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=2), nullable=False),
        sa.Column("intent", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("scope", sa.String(length=256), nullable=False),
        sa.Column("group_field", sa.String(length=128), nullable=True),
        sa.Column("period_start", sa.String(length=20), nullable=False),
        sa.Column("period_end", sa.String(length=20), nullable=False),
        sa.Column("period_label", sa.String(length=32), nullable=True),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("event_start_time", sa.String(length=40), nullable=False),
        sa.Column("event_end_time", sa.String(length=40), nullable=True),
        sa.Column("assignee", sa.String(length=256), nullable=True),
        sa.Column("rule_version", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["rule_id"], ["metric_rules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_metric_events_dedupe", "metric_events", ["dedupe_key"])
    op.create_index("ix_metric_events_rule_period", "metric_events", ["rule_id", "period_start", "period_end"])
    op.create_index("ix_metric_events_metric", "metric_events", ["metric_id"])

    op.create_table(
        "metric_rule_metric_refs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("rule_id", sa.String(length=64), nullable=False),
        sa.Column("metric_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("is_subject", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["rule_id"], ["metric_rules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["metric_id"], ["metric_definitions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_metric_rule_metric_refs_rule_id", "metric_rule_metric_refs", ["rule_id"])
    op.create_index("ix_metric_rule_refs_metric", "metric_rule_metric_refs", ["metric_id"])

    # --- data: Rule objects → metric_rules --------------------------------------------------------
    op.execute(
        """
        INSERT INTO metric_rules (
            id, slug, name, metric_id, condition, relation, severity, conclusion, suggestion, owner,
            status, version, group_by, ai_context, last_run_at, last_status, last_period_start,
            last_period_end, last_reason, created_by_name, created_at, updated_at
        )
        SELECT
            oi.id,
            COALESCE(oi.data->>'rule_id', oi.id),
            COALESCE(oi.data->>'name', 'rule'),
            ((oi.data->>'subject')::jsonb->>'ref'),
            NULLIF(oi.data->>'condition', '')::jsonb,
            NULLIF(oi.data->>'relation', '')::jsonb,
            COALESCE(oi.data->>'severity', 'P1'),
            COALESCE(oi.data->>'conclusion', ''),
            COALESCE(oi.data->>'suggestion', ''),
            NULLIF(oi.data->>'owner', ''),
            COALESCE(oi.data->>'status', 'active'),
            COALESCE(NULLIF(oi.data->>'version', '')::int, 1),
            NULLIF(oi.data->>'group_by', '')::jsonb,
            NULLIF(oi.data->>'ai_context', '')::jsonb,
            NULLIF(oi.data->>'last_run_at', ''),
            NULLIF(oi.data->>'last_status', ''),
            NULLIF(oi.data->>'last_period_start', ''),
            NULLIF(oi.data->>'last_period_end', ''),
            NULLIF(oi.data->>'last_reason', ''),
            NULLIF(oi.data->>'created_by_name', ''),
            oi.created_at,
            oi.updated_at
        FROM object_instances oi
        JOIN object_types ot ON ot.id = oi.object_type_id
        WHERE ot.api_name = 'Rule'
          AND (oi.data->>'subject')::jsonb->>'kind' = 'metric'
          AND EXISTS (SELECT 1 FROM metric_definitions md
                      WHERE md.id = ((oi.data->>'subject')::jsonb->>'ref'))
        """
    )

    # --- data: Event objects → metric_events ------------------------------------------------------
    op.execute(
        """
        INSERT INTO metric_events (
            id, rule_id, metric_id, event_id, dedupe_key, title, description, severity, intent, status,
            scope, group_field, period_start, period_end, evidence, event_start_time, event_end_time,
            assignee, rule_version, created_at, updated_at
        )
        SELECT
            oi.id,
            r.id,
            r.metric_id,
            COALESCE(oi.data->>'event_id', oi.id),
            COALESCE(oi.data->>'dedupe_key', oi.id),
            COALESCE(oi.data->>'title', ''),
            COALESCE(oi.data->>'description', ''),
            COALESCE(oi.data->>'severity', 'P1'),
            COALESCE(oi.data->>'intent', 'warning'),
            COALESCE(oi.data->>'status', 'open'),
            COALESCE(oi.data->>'scope', ''),
            NULLIF((oi.data->>'evidence')::jsonb->'group'->>'field', ''),
            COALESCE(oi.data->>'period_start', ''),
            COALESCE(oi.data->>'period_end', ''),
            NULLIF(oi.data->>'evidence', '')::jsonb,
            COALESCE(oi.data->>'event_start_time', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS')),
            NULLIF(oi.data->>'event_end_time', ''),
            NULLIF(oi.data->>'assignee', ''),
            NULLIF(oi.data->>'rule_version', '')::int,
            oi.created_at,
            oi.updated_at
        FROM object_instances oi
        JOIN object_types ot ON ot.id = oi.object_type_id
        JOIN metric_rules r ON r.id = oi.data->>'rule_object_id'
        WHERE ot.api_name = 'Event'
        """
    )

    # --- data: references -------------------------------------------------------------------------
    op.execute(
        """
        INSERT INTO metric_rule_metric_refs (id, rule_id, metric_id, role, is_subject)
        SELECT md5(r.id || ref.metric_id || ref.role), r.id, ref.metric_id, ref.role, ref.role = 'subject'
        FROM rule_metric_refs ref
        JOIN metric_rules r ON r.id = ref.rule_id
        JOIN metric_definitions md ON md.id = ref.metric_id
        """
    )

    # --- remove the old representation ------------------------------------------------------------
    op.execute(
        """
        DELETE FROM link_instances
        WHERE link_type_id IN (
            SELECT id FROM link_types WHERE source_object_type_id IN (
                SELECT id FROM object_types WHERE api_name IN ('Rule', 'Event')
            ) OR target_object_type_id IN (
                SELECT id FROM object_types WHERE api_name IN ('Rule', 'Event')
            )
        )
        """
    )
    op.execute(
        """
        DELETE FROM link_types
        WHERE source_object_type_id IN (SELECT id FROM object_types WHERE api_name IN ('Rule', 'Event'))
           OR target_object_type_id IN (SELECT id FROM object_types WHERE api_name IN ('Rule', 'Event'))
        """
    )
    op.execute(
        """
        DELETE FROM object_instances
        WHERE object_type_id IN (SELECT id FROM object_types WHERE api_name IN ('Rule', 'Event'))
        """
    )
    op.execute("DELETE FROM object_types WHERE api_name IN ('Rule', 'Event')")
    op.drop_index("ix_rule_metric_refs_rule_id", table_name="rule_metric_refs")
    op.drop_index("ix_rule_metric_refs_metric", table_name="rule_metric_refs")
    op.drop_table("rule_metric_refs")


def downgrade() -> None:
    """Recreate the object types and copy the rows back (best effort: slugs and ids are preserved)."""
    raise NotImplementedError("one-way migration: rule/event storage moved out of the ontology")
