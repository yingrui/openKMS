"""persist the answer verdict behind the thumbs

Revision ID: wf13feedback
Revises: wf12websearch

The conversation screen has offered thumbs up / down since it shipped, and stored the vote in component state. A
reload lost it, so "how is this agent answering" could only be answered by asking the people who use it.

The row references the message instead of copying the answer: `agent_messages` already holds it.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "wf13feedback"
down_revision = "wf12websearch"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workforce_answer_feedback",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("agent_id", sa.String(length=64), nullable=False),
        sa.Column("conversation_id", sa.String(length=64), nullable=True),
        sa.Column("message_id", sa.String(length=64), nullable=False),
        sa.Column("vote", sa.String(length=4), nullable=False),
        sa.Column("actor_sub", sa.String(length=512), nullable=False),
        sa.Column("actor_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["workforce_agents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id", "actor_sub", name="uq_workforce_feedback_message_voter"),
    )
    op.create_index("ix_workforce_answer_feedback_agent_id", "workforce_answer_feedback", ["agent_id"])
    op.create_index("ix_workforce_answer_feedback_conversation_id", "workforce_answer_feedback", ["conversation_id"])
    op.create_index("ix_workforce_answer_feedback_message_id", "workforce_answer_feedback", ["message_id"])
    op.create_index("ix_workforce_answer_feedback_actor_sub", "workforce_answer_feedback", ["actor_sub"])


def downgrade() -> None:
    op.drop_index("ix_workforce_answer_feedback_actor_sub", table_name="workforce_answer_feedback")
    op.drop_index("ix_workforce_answer_feedback_message_id", table_name="workforce_answer_feedback")
    op.drop_index("ix_workforce_answer_feedback_conversation_id", table_name="workforce_answer_feedback")
    op.drop_index("ix_workforce_answer_feedback_agent_id", table_name="workforce_answer_feedback")
    op.drop_table("workforce_answer_feedback")
