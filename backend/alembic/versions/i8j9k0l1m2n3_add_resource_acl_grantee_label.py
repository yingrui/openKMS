"""Add grantee_label on resource_acl_entries for display without API keys.

Revision ID: i8j9k0l1m2n3
Revises: h8i9j0k1l2m3
Create Date: 2026-06-02

Stores human-readable owner/group labels at save time (e.g. username) while grantee_id
remains canonical OIDC sub or local users.id.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i8j9k0l1m2n3"
down_revision: Union[str, Sequence[str], None] = "h8i9j0k1l2m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "resource_acl_entries",
        sa.Column("grantee_label", sa.String(length=320), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("resource_acl_entries", "grantee_label")
