"""user_preferences_ui_locale

Revision ID: b0af327086c6
Revises: p9q0r1s2t3u4
Create Date: 2026-05-07 18:45:41.631680

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b0af327086c6'
down_revision: Union[str, Sequence[str], None] = 'p9q0r1s2t3u4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_preferences',
        sa.Column('subject_sub', sa.String(length=255), nullable=False),
        sa.Column('ui_locale', sa.String(length=16), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('subject_sub'),
    )


def downgrade() -> None:
    op.drop_table('user_preferences')
