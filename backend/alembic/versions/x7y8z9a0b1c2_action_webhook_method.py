"""Let the webhook use the receiver's HTTP verb.

A REST integration is not just a body and a path: removing a row is `DELETE /things/{id}`, and
posting everything as POST only worked for endpoints that upsert. The Action names the method.

Revision ID: x7y8z9a0b1c2
Revises: v6w7x8y9z0a1
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "x7y8z9a0b1c2"
down_revision: Union[str, Sequence[str], None] = "v6w7x8y9z0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ontology_action_types",
        sa.Column("webhook_method", sa.String(length=8), server_default="POST", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("ontology_action_types", "webhook_method")
