"""record the creator roles on an evaluation

Revision ID: b8bcb67aff92
Revises: b0f4b0cc7f29
Create Date: 2026-11-11 23:56:05.968004

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b8bcb67aff92'
down_revision: Union[str, Sequence[str], None] = 'b0f4b0cc7f29'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('evaluations', sa.Column('created_by_roles', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    # Backfill from the creator's own key: that is where the roles of an existing user actually live, and a run without
    # them gets 403 on every dataset it needs.
    op.execute(
        """
        UPDATE evaluations e
        SET created_by_roles = k.oidc_realm_roles
        FROM (
            SELECT DISTINCT ON (owner_sub) owner_sub, oidc_realm_roles
            FROM user_api_keys
            WHERE purpose = 'personal' AND oidc_realm_roles IS NOT NULL
            ORDER BY owner_sub, created_at DESC
        ) k
        WHERE k.owner_sub = e.created_by AND e.created_by_roles IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column('evaluations', 'created_by_roles')
