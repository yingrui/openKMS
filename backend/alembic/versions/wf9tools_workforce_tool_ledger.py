"""workforce tool ledger: agent_skills + sandbox.enabled become one column

Revision ID: wf9tools
Revises: wf8deadworkspace

A capability was a shortcut, not the unit of selection: what a request carries is a set of tools, and a capability is
one way to pick several at once. Naming a capability could not express "shell but not python", which is exactly the
case that matters for code execution — the command allow list constrains `run_command` only, while
`run_python` runs arbitrary code.

`workforce_agents.agent_tools` is that ledger: `{capability_id: "all" | [tool_id, ...]}`. A missing key means the
capability is off; `"all"` follows the capability as the runtime grows it; a list is an explicit subset. The old
`agent_skills` list and the `sandbox.enabled` flag are folded into it here, then dropped from the agent.

There were three agents on the development deployment, so no careful mapping is attempted: each row is converted from
its own two fields.
"""

from __future__ import annotations

import json

import sqlalchemy as sa

from alembic import op

revision = "wf9tools"
down_revision = "wf8deadworkspace"
branch_labels = None
depends_on = None

#: Mirrors `CORE_AGENT_SKILLS`; a row with no list used the core set.
_CORE = ["ontology", "catalog", "page_index"]


def upgrade() -> None:
    op.add_column("workforce_agents", sa.Column("agent_tools", sa.dialects.postgresql.JSONB(), nullable=True))

    # capability list → ledger, then code execution on top when the sandbox flag was set
    for capability in _CORE + ["workspace"]:
        op.execute(
            sa.text(
                "UPDATE workforce_agents "
                "SET agent_tools = COALESCE(agent_tools, '{}'::jsonb) || jsonb_build_object(:capability, 'all') "
                "WHERE agent_skills IS NOT NULL AND agent_skills ? :capability"
            ).bindparams(capability=capability)
        )
    op.execute(
        sa.text(
            "UPDATE workforce_agents "
            "SET agent_tools = COALESCE(agent_tools, '{}'::jsonb) || jsonb_build_object(:capability, 'all') "
            "WHERE coalesce((agent_config -> 'sandbox' ->> 'enabled')::boolean, false)"
        ).bindparams(capability="code_execution")
    )
    # An agent with no explicit list used the core set, so that is what it gets.
    core_ledger = json.dumps({capability: "all" for capability in _CORE})
    op.execute(
        sa.text(
            "UPDATE workforce_agents SET agent_tools = CAST(:core AS jsonb) "
            "WHERE agent_tools IS NULL AND (agent_skills IS NULL OR agent_skills = '[]'::jsonb)"
        ).bindparams(core=core_ledger)
    )
    op.execute("UPDATE workforce_agents SET agent_tools = '{}'::jsonb WHERE agent_tools IS NULL")

    op.drop_column("workforce_agents", "agent_skills")


def downgrade() -> None:
    """Back to a capability list: the keys of the ledger, and code execution back into the sandbox flag."""
    op.add_column(
        "workforce_agents",
        sa.Column("agent_skills", sa.dialects.postgresql.JSONB(), nullable=True),
    )
    op.execute(
        "UPDATE workforce_agents SET agent_skills = "
        "(SELECT jsonb_agg(key) FROM jsonb_each(agent_tools) WHERE key <> 'code_execution') "
        "WHERE agent_tools IS NOT NULL"
    )
    op.execute(
        "UPDATE workforce_agents SET agent_config = "
        "jsonb_set(coalesce(agent_config, '{}'::jsonb), '{sandbox,enabled}', "
        "(agent_tools ? 'code_execution')::text::jsonb, true) "
        "WHERE agent_tools IS NOT NULL"
    )
    op.drop_column("workforce_agents", "agent_tools")
