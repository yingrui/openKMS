"""Add created_by and created_by_name to projects with owner backfill

Revision ID: 054da7b54495
Revises: n8o9p0q1r2s3
Create Date: 2026-06-25 19:57:21.796045

"""
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '054da7b54495'
down_revision: Union[str, Sequence[str], None] = 'n8o9p0q1r2s3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('created_by', sa.String(length=512), nullable=True))
    op.add_column('projects', sa.Column('created_by_name', sa.String(length=256), nullable=True))
    op.create_index(op.f('ix_projects_created_by'), 'projects', ['created_by'], unique=False)

    t_projects = sa.table('projects',
        sa.column('id', sa.String(64)),
        sa.column('user_sub', sa.String(256)),
        sa.column('created_by', sa.String(512)),
    )
    t_acl = sa.table('resource_acl_entries',
        sa.column('id', sa.String(64)),
        sa.column('resource_type', sa.String(64)),
        sa.column('resource_id', sa.String(64)),
        sa.column('grantee_type', sa.String(32)),
        sa.column('grantee_id', sa.String(512)),
        sa.column('permissions', sa.Integer()),
    )

    conn = op.get_bind()
    rows = conn.execute(
        sa.select(t_projects.c.id, t_projects.c.user_sub)
        .where(t_projects.c.created_by.is_(None))
    ).fetchall()

    for row in rows:
        project_id, user_sub = row
        conn.execute(
            t_projects.update()
            .where(t_projects.c.id == project_id)
            .values(created_by=user_sub)
        )
        acl_id = f"acl_{uuid4().hex[:12]}"
        conn.execute(
            t_acl.insert().values(
                id=acl_id,
                resource_type='project',
                resource_id=project_id,
                grantee_type='user',
                grantee_id=user_sub,
                permissions=7,
            )
        )


def downgrade() -> None:
    op.drop_index(op.f('ix_projects_created_by'), table_name='projects')
    op.drop_column('projects', 'created_by_name')
    op.drop_column('projects', 'created_by')
