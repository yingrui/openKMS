"""Two things an integration needs: a REST-shaped body, and a way to see that it failed.

`webhook_body = envelope` keeps the rich metadata payload; `object` sends the object's own
properties (with the Action's input on top) so the receiver's ordinary REST endpoint accepts it —
the app keeps its own API instead of growing a webhook-shaped one. Path placeholders
(`/api/portfolios/{portfolio_id}/stocks`) use the same fields.

The delivery outcome becomes columns on the Action log rather than a key buried in JSONB, so
"did the webhook land?" is answerable with the log itself.

Revision ID: v6w7x8y9z0a1
Revises: n5o6p7q8r9s0
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v6w7x8y9z0a1"
down_revision: Union[str, Sequence[str], None] = "n5o6p7q8r9s0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ontology_action_types",
        sa.Column("webhook_body", sa.String(length=16), server_default="envelope", nullable=False),
    )
    op.add_column("ontology_action_log", sa.Column("webhook_ok", sa.Boolean(), nullable=True))
    op.add_column("ontology_action_log", sa.Column("webhook_status", sa.Integer(), nullable=True))
    op.add_column("ontology_action_log", sa.Column("webhook_error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("ontology_action_log", "webhook_error")
    op.drop_column("ontology_action_log", "webhook_status")
    op.drop_column("ontology_action_log", "webhook_ok")
    op.drop_column("ontology_action_types", "webhook_body")
