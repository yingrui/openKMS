"""repair_pipeline_command_extraction_flags

A command template that spells out `--extract-metadata --extraction-model-name … --extraction-schema …`
fails every run whose channel has no extraction model, because both placeholders render empty and the
CLI gets a flag with no value (`Pipeline exited with code 1: --extract-metadata requires --document-id
and --extraction-schema`). The supported template asks for `{extraction_args}`, which renders the whole
block or nothing; the API now rejects the literal flags (see `EXTRACTION_FLAG_LITERALS`).

This rewrites the one known-broken shape to the supported one and leaves every other command untouched.

Revision ID: c5d7e9f1a3b4
Revises: b4a3c2d1e0f9
Create Date: 2026-11-12
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c5d7e9f1a3b4"
down_revision: Union[str, None] = "b4a3c2d1e0f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BROKEN = (
    "--extract-metadata --extraction-model-name {extraction_model_name} "
    "--extraction-schema {extraction_schema}"
)
SUPPORTED = "--api-url {api_url}{extraction_args}"


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE pipelines
        SET command = replace(command, '{BROKEN}', '{SUPPORTED}')
        WHERE command LIKE '%{BROKEN}%'
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        UPDATE pipelines
        SET command = replace(command, '{SUPPORTED}', '{BROKEN}')
        WHERE command LIKE '%{SUPPORTED}%'
        """
    )
