"""Rename the module-app tables to Chamber.

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
Create Date: 2026-11-10
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "l3m4n5o6p7q8"
down_revision: Union[str, Sequence[str], None] = "k2l3m4n5o6p7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "ontology_apps" in tables:
        op.rename_table("ontology_apps", "chamber_apps")
    if "app_published_versions" in tables:
        op.rename_table("app_published_versions", "chamber_published_versions")
    op.execute("ALTER INDEX IF EXISTS ix_ontology_apps_api_name RENAME TO ix_chamber_apps_api_name")
    op.execute(
        "ALTER INDEX IF EXISTS ix_app_published_versions_app_id "
        "RENAME TO ix_chamber_published_versions_app_id"
    )


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "chamber_apps" in tables:
        op.rename_table("chamber_apps", "ontology_apps")
    if "chamber_published_versions" in tables:
        op.rename_table("chamber_published_versions", "app_published_versions")
    op.execute("ALTER INDEX IF EXISTS ix_chamber_apps_api_name RENAME TO ix_ontology_apps_api_name")
    op.execute(
        "ALTER INDEX IF EXISTS ix_chamber_published_versions_app_id "
        "RENAME TO ix_app_published_versions_app_id"
    )
