"""agent_config: drop the duplicate tools key

Revision ID: 5c2e8f1a9b04
Revises: 42186607a45f
Create Date: 2026-11-11 10:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '5c2e8f1a9b04'
down_revision: Union[str, Sequence[str], None] = '42186607a45f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """`agent_config.tools` duplicated `knowledge_bases.agent_skills`.

    Which skills a KB enables lives in `agent_skills` and is what the agent is sent; a second list inside the config object
    meant a KB could show one set on screen and hand the agent another. The two were written together by hand in this
    environment, so the migration copies the config's list across **only where `agent_skills` is empty**, then drops the key.
    """
    op.execute(
        """
        UPDATE knowledge_bases
           SET agent_skills = agent_config -> 'tools'
         WHERE agent_skills IS NULL
           AND jsonb_typeof(agent_config -> 'tools') = 'array'
        """
    )
    op.execute("UPDATE knowledge_bases SET agent_config = agent_config - 'tools' WHERE agent_config ? 'tools'")


def downgrade() -> None:
    """No data to restore: the values live in `agent_skills`."""
    pass
