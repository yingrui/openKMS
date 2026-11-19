"""workforce: installed skill packages per agent

Revision ID: wf6skills
Revises: wf5thinkbodies

A workforce agent now distinguishes two things that were merged:

* `agent_skills` — the **tool switches** the runtime enforces (ontology, catalog, page index, …);
* `installed_skills` — **skill packages** from the global registry, `{"<skill_id>": "<version>"}`.

A skill is instruction text plus files (`SKILL.md`); installing one adds it to the prompt. A tool is a capability the
runtime provides. They were one list, which is why "Skills" read like a checkbox panel of tools.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "wf6skills"
down_revision = "wf5thinkbodies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workforce_agents", sa.Column("installed_skills", sa.dialects.postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("workforce_agents", "installed_skills")
