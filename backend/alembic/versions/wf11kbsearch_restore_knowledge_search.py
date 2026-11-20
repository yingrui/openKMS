"""restore corpus access for agents that already answer from a knowledge base

Revision ID: wf11kbsearch
Revises: wf10noretrieve

`wf10noretrieve` dropped `orchestration.retrieve`, which means retrieval now happens only through the
`knowledge_search` capability. An agent whose ledger was written before that capability existed has no way to read its
corpus at all — a service over a knowledge base that cannot read one.

This adds the capability to every agent that is bound to at least one knowledge base. That is not a guess: an agent with
no corpus has nothing to search, and an agent with one was answering from it until this change.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "wf11kbsearch"
down_revision = "wf10noretrieve"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE workforce_agents AS a "
            "SET agent_tools = COALESCE(a.agent_tools, '{}'::jsonb) "
            "    || jsonb_build_object('knowledge_search', 'all') "
            "WHERE EXISTS (SELECT 1 FROM workforce_agent_kbs AS b WHERE b.agent_id = a.id) "
            "  AND NOT (COALESCE(a.agent_tools, '{}'::jsonb) ? 'knowledge_search')"
        )
    )


def downgrade() -> None:
    # Leaving the capability on is harmless: the tool is only offered, not run.
    pass
