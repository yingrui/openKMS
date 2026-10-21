"""Let an Action deliver its result to a registered external service.

The webhook was a Function's job: the source had to know the URL and call it. That made every
integration a bespoke Function and hid the destination in code. An Action type can now name a
service + path, and the platform posts a standard envelope (the object it acted on, the input, the
applied ids, the caller) after a successful run.

Revision ID: n5o6p7q8r9s0
Revises: k7l8m9n0b1v2
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "n5o6p7q8r9s0"
down_revision: Union[str, Sequence[str], None] = "k7l8m9n0b1v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ontology_action_types", sa.Column("webhook_service_id", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "ontology_action_types", sa.Column("webhook_path", sa.String(length=512), nullable=True)
    )
    op.create_foreign_key(
        "ontology_action_types_webhook_service_id_fkey",
        "ontology_action_types",
        "external_services",
        ["webhook_service_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_ontology_action_types_webhook_service_id",
        "ontology_action_types",
        ["webhook_service_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ontology_action_types_webhook_service_id", table_name="ontology_action_types")
    op.drop_constraint(
        "ontology_action_types_webhook_service_id_fkey",
        "ontology_action_types",
        type_="foreignkey",
    )
    op.drop_column("ontology_action_types", "webhook_path")
    op.drop_column("ontology_action_types", "webhook_service_id")
