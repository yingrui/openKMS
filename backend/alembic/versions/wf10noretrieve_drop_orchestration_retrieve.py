"""drop orchestration.retrieve: retrieval is a tool, not a graph node

Revision ID: wf10noretrieve
Revises: wf9tools

`orchestration.retrieve` selected between three shapes of the answer path: pre-retrieve, retrieve nothing, or skip
pre-retrieval and bind a search tool. With `search_knowledge_base` an ordinary capability, all three collapse into one
path — the agent searches when it decides to — so the field no longer selects anything. A stored key that nothing reads
is a switch that lies, so it goes from both config carriers.

An agent that had `never` keeps its behaviour (no `knowledge_search` in its ledger). An agent that had `always` loses the
pre-fetch; enabling `knowledge_search` on it restores access, which is a decision its owner makes rather than a migration
guessing on their behalf.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "wf10noretrieve"
down_revision = "wf9tools"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("knowledge_bases", "workforce_agents"):
        op.execute(
            sa.text(
                f"UPDATE {table} SET agent_config = agent_config #- '{{orchestration,retrieve}}' "
                "WHERE agent_config IS NOT NULL AND agent_config ? 'orchestration'"
            )
        )


def downgrade() -> None:
    # Nothing to restore: the value never described a behaviour the runtime can honour any more.
    pass
