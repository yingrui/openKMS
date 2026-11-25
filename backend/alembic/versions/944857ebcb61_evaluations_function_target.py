"""evaluations can target a function, and carry JSON cases

An Evaluation was one target only — a knowledge base — and its items were text. Measuring a Function needs the other
target (a function, measured at its published version) and JSON in and out.

`knowledge_base_id` becomes nullable for that; a partial uniqueness/validation rule is enforced in the service, not in
the schema, because Postgres cannot express "exactly one of two nullable FKs" without a trigger.

Revision ID: 944857ebcb61
Revises: b372f5321237
Create Date: 2026-11-23 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "944857ebcb61"
down_revision: Union[str, Sequence[str], None] = "b372f5321237"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("evaluations", "knowledge_base_id", existing_type=sa.String(length=64), nullable=True)
    op.add_column("evaluations", sa.Column("function_id", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_evaluations_function_id"), "evaluations", ["function_id"])
    op.create_foreign_key(
        "evaluations_function_id_fkey",
        "evaluations",
        "ontology_functions",
        ["function_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column(
        "evaluation_items",
        sa.Column("input_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "evaluation_items",
        sa.Column("expected_output", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("evaluation_items", "expected_output")
    op.drop_column("evaluation_items", "input_payload")
    op.drop_constraint("evaluations_function_id_fkey", "evaluations", type_="foreignkey")
    op.drop_index(op.f("ix_evaluations_function_id"), table_name="evaluations")
    op.drop_column("evaluations", "function_id")
    op.alter_column("evaluations", "knowledge_base_id", existing_type=sa.String(length=64), nullable=False)
