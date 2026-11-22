"""the queue of things that need a person

Revision ID: wf14issues
Revises: wf13feedback

Operations stopped being a dashboard and became a work queue: 👎 feedback, refusals, and later Guardrails findings
(violations, risk, prompt-injection attempts) all become one row shape, closed with a sentence saying what was done.

`resolved` requires a resolution — the rule lives in `services/workforce/issues.py`, not in a constraint, because an
"ignored" row also carries a reason when one is known.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "wf14issues"
down_revision = "wf13feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workforce_issues",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("agent_id", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="normal"),
        sa.Column("source_ref", sa.String(length=128), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
        sa.Column("resolution", sa.Text(), nullable=True),
        sa.Column("resolved_by", sa.String(length=256), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workforce_issues_agent_id", "workforce_issues", ["agent_id"])
    op.create_index("ix_workforce_issues_kind", "workforce_issues", ["kind"])
    op.create_index("ix_workforce_issues_source_ref", "workforce_issues", ["source_ref"])
    op.create_index("ix_workforce_issues_status", "workforce_issues", ["status"])
    op.create_index("ix_workforce_issues_created_at", "workforce_issues", ["created_at"])


def downgrade() -> None:
    for name in (
        "ix_workforce_issues_created_at",
        "ix_workforce_issues_status",
        "ix_workforce_issues_source_ref",
        "ix_workforce_issues_kind",
        "ix_workforce_issues_agent_id",
    ):
        op.drop_index(name, table_name="workforce_issues")
    op.drop_table("workforce_issues")
