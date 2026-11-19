"""replace the provider thinking enum with body fragments

Revision ID: wf5thinkbodies
Revises: wf4deadkeys

`api_providers.config.thinking_style` held one of `auto | deepseek | none`, an enum of vendor spellings. It could
not describe the real differences: DeepSeek takes `{"thinking": {"type": "disabled"}}`, DashScope
`{"enable_thinking": false}`, OpenAI has no toggle (`reasoning_effort: none`), Anthropic a token budget rather than
a boolean. Adding a vendor would have meant code plus a probe.

Providers now store what to *send* for each choice — `config.thinking = {"on": {...}, "off": {...}}` — so a new
vendor is configuration. This migration freezes the behaviour the old enum produced at this moment: providers that
resolved to `deepseek` get the two DeepSeek fragments, everything else gets none (send nothing). Resolving "auto"
here, once, is deliberate: afterwards the rule is data, not a host-name guess at request time.
"""

from __future__ import annotations

import json

import sqlalchemy as sa

from alembic import op

revision = "wf5thinkbodies"
down_revision = "wf4deadkeys"
branch_labels = None
depends_on = None

_DEEPSEEK_FRAGMENTS = {
    "on": {"thinking": {"type": "enabled"}},
    "off": {"thinking": {"type": "disabled"}},
}


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "api_providers" not in inspector.get_table_names():
        return
    rows = conn.execute(sa.text("SELECT id, base_url, config FROM api_providers")).fetchall()
    for provider_id, base_url, config in rows:
        config = dict(config or {})
        style = config.pop("thinking_style", None)
        resolved = style if style in {"deepseek", "none"} else None
        if resolved is None:
            # The old default was `auto`: deepseek.com meant DeepSeek's spelling, anything else meant silence.
            resolved = "deepseek" if "deepseek" in (base_url or "").lower() else "none"
        if resolved == "deepseek":
            config["thinking"] = _DEEPSEEK_FRAGMENTS
        conn.execute(
            sa.text("UPDATE api_providers SET config = CAST(:config AS jsonb) WHERE id = :id"),
            {"config": json.dumps(config) if config else None, "id": provider_id},
        )


def downgrade() -> None:
    """Fragments cannot be mapped back to one enum value without guessing which vendor they were for.

    Restoring `thinking_style` would have to inspect the JSON and pick a label; a wrong label is worse than no
    label, because the old code trusted it. So the fragments stay and the enum simply stops being written.
    """
    pass
