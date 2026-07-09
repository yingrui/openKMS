"""Add ontology functions, groups, and action types tables.

Revision ID: f7a8b9c0d1e2
Revises: 054da7b54495
Create Date: 2026-07-08
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "054da7b54495"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ontology_functions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("api_name", sa.String(128), nullable=False),
        sa.Column("display_name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source", sa.String(32), nullable=False, server_default="code"),
        sa.Column("object_type_id", sa.String(64), sa.ForeignKey("object_types.id", ondelete="SET NULL"), nullable=True),
        sa.Column("development_status", sa.String(32), nullable=False, server_default="experimental"),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("published_version_id", sa.String(64), nullable=True),
        sa.Column("web_api_config", postgresql.JSONB(), nullable=True),
        sa.Column("created_by", sa.String(512), nullable=True),
        sa.Column("created_by_name", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ontology_functions_api_name", "ontology_functions", ["api_name"], unique=True)
    op.create_index("ix_ontology_functions_object_type_id", "ontology_functions", ["object_type_id"])

    op.create_table(
        "ontology_function_versions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("function_id", sa.String(64), sa.ForeignKey("ontology_functions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("source_code", sa.Text(), nullable=False),
        sa.Column("input_schema", postgresql.JSONB(), nullable=True),
        sa.Column("output_schema", postgresql.JSONB(), nullable=True),
        sa.Column("entrypoint", sa.String(64), nullable=False, server_default="execute"),
        sa.Column("runtime", sa.String(32), nullable=False, server_default="python3"),
        sa.Column("validation_result", postgresql.JSONB(), nullable=True),
        sa.Column("created_by", sa.String(512), nullable=True),
        sa.Column("created_by_name", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ontology_function_versions_function_id", "ontology_function_versions", ["function_id"])

    op.create_foreign_key(
        "fk_ontology_functions_published_version",
        "ontology_functions",
        "ontology_function_versions",
        ["published_version_id"],
        ["id"],
        ondelete="SET NULL",
        use_alter=True,
    )

    op.create_table(
        "ontology_function_executions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("function_id", sa.String(64), sa.ForeignKey("ontology_functions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.String(64), sa.ForeignKey("ontology_function_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("caller_user_id", sa.String(512), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("input_payload", postgresql.JSONB(), nullable=True),
        sa.Column("output_payload", postgresql.JSONB(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ontology_function_executions_function_id", "ontology_function_executions", ["function_id"])
    op.create_index("ix_ontology_function_executions_version_id", "ontology_function_executions", ["version_id"])

    op.create_table(
        "ontology_groups",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("display_name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "ontology_group_object_types",
        sa.Column("group_id", sa.String(64), sa.ForeignKey("ontology_groups.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("object_type_id", sa.String(64), sa.ForeignKey("object_types.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "ontology_action_types",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("api_name", sa.String(128), nullable=False),
        sa.Column("display_name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("object_type_id", sa.String(64), sa.ForeignKey("object_types.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rule_type", sa.String(32), nullable=False, server_default="function"),
        sa.Column("function_id", sa.String(64), sa.ForeignKey("ontology_functions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("function_version", sa.Integer(), nullable=True),
        sa.Column("parameters", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("created_by", sa.String(512), nullable=True),
        sa.Column("created_by_name", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ontology_action_types_api_name", "ontology_action_types", ["api_name"], unique=True)

    op.create_table(
        "ontology_action_log",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("action_type_id", sa.String(64), sa.ForeignKey("ontology_action_types.id", ondelete="CASCADE"), nullable=False),
        sa.Column("object_id", sa.String(256), nullable=True),
        sa.Column("caller_user_id", sa.String(512), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("input_payload", postgresql.JSONB(), nullable=True),
        sa.Column("output_payload", postgresql.JSONB(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("ontology_action_log")
    op.drop_table("ontology_action_types")
    op.drop_table("ontology_group_object_types")
    op.drop_table("ontology_groups")
    op.drop_table("ontology_function_executions")
    op.drop_constraint("fk_ontology_functions_published_version", "ontology_functions", type_="foreignkey")
    op.drop_table("ontology_function_versions")
    op.drop_table("ontology_functions")
