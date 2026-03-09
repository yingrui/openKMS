"""update_pipeline_command_template

Revision ID: b4e2c7d9f1a3
Revises: a3f1b2c4d5e6
Create Date: 2026-03-09 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b4e2c7d9f1a3'
down_revision: Union[str, None] = 'a3f1b2c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_COMMAND = "openkms-cli pipeline run"
NEW_COMMAND = "openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input {input} --s3-prefix {s3_prefix}"


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE pipelines
        SET command = '{NEW_COMMAND}'
        WHERE id = 'pipeline_paddleocr'
          AND command = '{OLD_COMMAND}'
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        UPDATE pipelines
        SET command = '{OLD_COMMAND}'
        WHERE id = 'pipeline_paddleocr'
          AND command = '{NEW_COMMAND}'
        """
    )
