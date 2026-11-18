"""workforce agents: stop describing a service with its corpus's blurb

Revision ID: wf3agentdesc
Revises: wf2patterns

`wf1agents` seeded each knowledge base's default agent with the knowledge base's own description — which
says what is *known*, not who answers. Every default agent therefore read like a document collection.
This clears the copy where it is still the untouched one (the agent's description equals the source's), so
a description someone has written is never overwritten.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "wf3agentdesc"
down_revision = "wf2patterns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    if "workforce_agents" not in sa.inspect(conn).get_table_names():
        return
    conn.execute(
        sa.text(
            "UPDATE workforce_agents a SET description = NULL "
            "FROM knowledge_bases k "
            "WHERE a.origin_knowledge_base_id = k.id "
            "  AND a.description IS NOT NULL "
            "  AND a.description = k.description"
        )
    )


def downgrade() -> None:
    """The copies were not information; there is nothing to restore."""
