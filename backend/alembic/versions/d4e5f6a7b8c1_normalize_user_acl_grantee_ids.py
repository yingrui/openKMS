"""Normalize user ACL grantee_id stored as username to canonical subject.

Revision ID: d4e5f6a7b8c1
Revises: c3d4e5f6a7b0
Create Date: 2026-06-01

Owner grants saved with username (e.g. OIDC preferred_username) did not match JWT sub
at permission check time. Map local usernames to user id and OIDC display names to sub.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c1"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # OIDC subs first — usernames that match user_api_keys must not become local users.id.
    op.execute(
        sa.text(
            """
            UPDATE resource_acl_entries AS rae
            SET grantee_id = sub.owner_sub
            FROM (
                SELECT DISTINCT ON (lower(display_username))
                    lower(display_username) AS uname,
                    owner_sub
                FROM user_api_keys
                WHERE display_username <> ''
                ORDER BY lower(display_username), created_at DESC
            ) AS sub
            WHERE rae.grantee_type = 'user'
              AND rae.grantee_id IS NOT NULL
              AND lower(rae.grantee_id) = sub.uname
              AND rae.grantee_id <> sub.owner_sub
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE resource_acl_entries AS rae
            SET grantee_id = u.id
            FROM users AS u
            WHERE rae.grantee_type = 'user'
              AND rae.grantee_id IS NOT NULL
              AND lower(rae.grantee_id) = lower(u.username)
              AND rae.grantee_id <> u.id
            """
        )
    )


def downgrade() -> None:
    pass
