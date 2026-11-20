"""drop the unread `workspace` block from agent configs

Revision ID: wf8deadworkspace
Revises: wf7skills

`agent_config.workspace` held four fields — `enabled`, `disk_mb`, `session_ttl_minutes`, `artifact_max_mb` — and the
runtime read none of them: the file tools are switched by the `workspace` capability id, and the reaper takes its limits
from the qa-agent's own settings. A stored key that nothing reads is a switch that lies, so the block goes.

Both config carriers are cleaned: a knowledge base's default agent and a workforce agent each keep their own JSONB.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "wf8deadworkspace"
down_revision = "wf7skills"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("knowledge_bases", "workforce_agents"):
        op.execute(
            sa.text(
                f"UPDATE {table} SET agent_config = agent_config - 'workspace' "
                "WHERE agent_config IS NOT NULL AND agent_config ? 'workspace'"
            )
        )


def downgrade() -> None:
    # Nothing to restore: the values were never read, and re-adding them would restore a lie.
    pass
