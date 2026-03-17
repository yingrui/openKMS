"""rename_description_to_definition_glossary_terms

Revision ID: b2322304a207
Revises: m9n0o1p2q3r4
Create Date: 2026-03-17 16:22:53.729168

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2322304a207'
down_revision: Union[str, Sequence[str], None] = 'm9n0o1p2q3r4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "glossary_terms",
        "description",
        new_column_name="definition",
    )


def downgrade() -> None:
    op.alter_column(
        "glossary_terms",
        "definition",
        new_column_name="description",
    )
