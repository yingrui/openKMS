"""drop the agent-config keys nothing reads

Revision ID: wf4deadkeys
Revises: d7e9f1a3c5b6

`AgentConfig` is validated with `extra="forbid"`, so removing a field from the schema while rows still carry it
turns every later save into a 422: the UI posts back the config it read, including the deleted keys. The
schema change and this migration therefore ship together.

Five keys go:

* `observability.{langfuse_credential_id, langfuse_tags, sample_rate}` — never read. Tracing is deployment-wide
  (`LANGFUSE_*` on the qa-agent); a per-KB tracing block that does nothing is worse than no block.
* `orchestration.profile` — `rag_only | rag_tools | agent_loop` restated what `orchestration.retrieve` and the
  enabled skills already say. Two knobs for one decision drift apart.
* `answer_policy.evidence_labels` — declared `flat | used+consulted`, defaulting to `flat`, while the agent
  labels every source `used`/`consulted` unconditionally. The setting never did anything; the labelling stays.

`#-` removes a nested key and is a no-op when the path is absent, so re-running this is harmless.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "wf4deadkeys"
down_revision = "d7e9f1a3c5b6"
branch_labels = None
depends_on = None

_TABLES = ("workforce_agents", "knowledge_bases")


def _exists(conn: sa.Connection, table: str) -> bool:
    return table in sa.inspect(conn).get_table_names()


def upgrade() -> None:
    conn = op.get_bind()
    for table in _TABLES:
        if not _exists(conn, table):
            continue
        conn.execute(
            sa.text(
                f"UPDATE {table} SET agent_config = agent_config - 'observability' "
                "WHERE agent_config ? 'observability'"
            )
        )
        conn.execute(
            sa.text(
                f"UPDATE {table} SET agent_config = agent_config #- '{{orchestration,profile}}' "
                "WHERE agent_config #> '{orchestration}' ? 'profile'"
            )
        )
        conn.execute(
            sa.text(
                f"UPDATE {table} SET agent_config = agent_config #- '{{answer_policy,evidence_labels}}' "
                "WHERE agent_config #> '{answer_policy}' ? 'evidence_labels'"
            )
        )


def downgrade() -> None:
    """The removed keys held no behaviour, so there is nothing to restore.

    A downgrade that re-inserted defaults would be worse than this: it would put back fields the code no
    longer reads and make the next save fail validation, which is the exact failure this migration prevents.
    """
    pass
