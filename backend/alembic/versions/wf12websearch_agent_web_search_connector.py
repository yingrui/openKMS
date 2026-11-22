"""one web-search connector per agent

Revision ID: wf12websearch
Revises: wf11kbsearch

An agent that enables `web_search` needs to know *which* connector answers. Two providers answer the same question, so
the choice belongs to whoever configures the agent — not to the model (which cannot tell them apart) and not to "the
first enabled connector in the table" (which silently ignores the rest).

One column, one binding: a second provider is a decision for another agent, or for the deployment to switch.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "wf12websearch"
down_revision = "wf11kbsearch"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workforce_agents", sa.Column("web_search_connector_id", sa.String(length=64), nullable=True))
    op.create_foreign_key(
        "fk_workforce_agents_web_search_connector",
        "workforce_agents",
        "connectors",
        ["web_search_connector_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_workforce_agents_web_search_connector_id",
        "workforce_agents",
        ["web_search_connector_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_workforce_agents_web_search_connector_id", table_name="workforce_agents")
    op.drop_constraint("fk_workforce_agents_web_search_connector", "workforce_agents", type_="foreignkey")
    op.drop_column("workforce_agents", "web_search_connector_id")
