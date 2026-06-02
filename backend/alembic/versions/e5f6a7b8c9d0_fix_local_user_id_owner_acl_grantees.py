"""Rewrite owner ACL grantee_id from local users.id to OIDC sub.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c1
Create Date: 2026-06-01

Migration d4e5f6a7b8c1 mapped usernames to local users.id before OIDC subs, leaving
owner grants keyed by legacy local ids. Map those rows (and channel created_by) to
user_api_keys.owner_sub when a matching OIDC identity exists.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OIDC_SUB_FOR_USER = """
    SELECT DISTINCT ON (u.id)
        u.id AS user_id,
        k.owner_sub
    FROM users AS u
    JOIN user_api_keys AS k ON (
        lower(k.display_username) = lower(u.username)
        OR (
            u.email IS NOT NULL
            AND u.email <> ''
            AND lower(k.display_email) = lower(u.email)
        )
    )
    ORDER BY u.id, k.created_at DESC
"""


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            f"""
            UPDATE resource_acl_entries AS rae
            SET grantee_id = map.owner_sub
            FROM ({_OIDC_SUB_FOR_USER}) AS map
            WHERE rae.grantee_type = 'user'
              AND rae.grantee_id = map.user_id
              AND rae.grantee_id <> map.owner_sub
            """
        )
    )
    for table in ("article_channels", "document_channels"):
        conn.execute(
            sa.text(
                f"""
                UPDATE {table} AS ch
                SET created_by = map.owner_sub
                FROM ({_OIDC_SUB_FOR_USER}) AS map
                WHERE ch.created_by = map.user_id
                  AND ch.created_by <> map.owner_sub
                """
            )
        )


def downgrade() -> None:
    pass
