"""Update Baidu pipeline description for BOS file_url staging.

Revision ID: u0v1w2x3y4z5
Revises: t9u0v1w2x3y4
Create Date: 2026-05-29
"""

from typing import Sequence, Union

from alembic import op

revision: str = "u0v1w2x3y4z5"
down_revision: Union[str, None] = "t9u0v1w2x3y4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE pipelines
        SET description = 'Parse documents via Baidu PaddleOCR-VL API (BOS presigned file_url)'
        WHERE id = 'pipeline_baidu_doc_parse'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE pipelines
        SET description = 'Parse documents via Baidu PaddleOCR-VL API (file_data upload)'
        WHERE id = 'pipeline_baidu_doc_parse'
        """
    )
