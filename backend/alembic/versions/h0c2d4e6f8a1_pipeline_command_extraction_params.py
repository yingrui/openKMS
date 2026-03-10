"""pipeline_command_extraction_params

Revision ID: h0c2d4e6f8a1
Revises: g9b1c3d4e5f6
Create Date: 2026-03-10

Updates pipeline command template to include document_id, api_url, extraction_args.
extraction_args expands to --extract-metadata --extraction-model-name X --extraction-schema Y when channel has extraction config.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "h0c2d4e6f8a1"
down_revision: Union[str, None] = "g9b1c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_COMMAND = (
    "openkms-cli pipeline run --pipeline-name paddleocr-doc-parse "
    "--input {input} --s3-prefix {s3_prefix}"
)
NEW_COMMAND = (
    "openkms-cli pipeline run --pipeline-name paddleocr-doc-parse "
    "--input {input} --s3-prefix {s3_prefix} --document-id {document_id} "
    "--api-url {api_url}{extraction_args}"
)


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
