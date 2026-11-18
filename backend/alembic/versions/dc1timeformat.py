"""dataset columns: time_format

Revision ID: dc1timeformat
Revises: jo1fromunique
"""

from __future__ import annotations

import json

import sqlalchemy as sa

from alembic import op

revision = "dc1timeformat"
down_revision = "jo1fromunique"
branch_labels = None
depends_on = None


#: The format each retired `period_kind` implied, so the value moves to the column without changing meaning.
_FORMAT_FOR_KIND = {
    "day": "%Y-%m-%d",
    "week": "%G-W%V",
    "month": "%Y-%m",
    "quarter": "%Y-Q%n",
    "year": "%Y",
}


def upgrade() -> None:
    op.add_column("dataset_columns", sa.Column("time_format", sa.String(64), nullable=True))

    # Move the calendar to the column (a fact about the value) and leave the field with its override only.
    # A column reached by several fields keeps the first calendar that is not `custom`.
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, dataset_id, column_name, dimension FROM semantic_model_fields "
            "WHERE column_name IS NOT NULL AND dimension IS NOT NULL"
        )
    ).fetchall()
    for field_id, dataset_id, column_name, dimension in rows:
        dimension = dimension or {}
        kind = dimension.get("period_kind")
        time_format = dimension.get("period_format") or _FORMAT_FOR_KIND.get(str(kind or ""))
        if time_format:
            existing = conn.execute(
                sa.text(
                    "SELECT time_format FROM dataset_columns "
                    "WHERE dataset_id = :d AND column_name = :c"
                ),
                {"d": dataset_id, "c": column_name},
            ).scalar()
            if not existing:
                conn.execute(
                    sa.text(
                        "UPDATE dataset_columns SET time_format = :f "
                        "WHERE dataset_id = :d AND column_name = :c"
                    ),
                    {"f": time_format, "d": dataset_id, "c": column_name},
                )
                if conn.execute(
                    sa.text(
                        "SELECT 1 FROM dataset_columns WHERE dataset_id = :d AND column_name = :c"
                    ),
                    {"d": dataset_id, "c": column_name},
                ).first() is None:
                    conn.execute(
                        sa.text(
                            "INSERT INTO dataset_columns (id, dataset_id, column_name, time_format) "
                            "VALUES (:id, :d, :c, :f)"
                        ),
                        {"id": f"col-{field_id}", "d": dataset_id, "c": column_name, "f": time_format},
                    )
        # The field keeps only what is still a field-level statement.
        if isinstance(dimension.get("is_time"), bool):
            conn.execute(
                sa.text("UPDATE semantic_model_fields SET dimension = CAST(:dim AS jsonb) WHERE id = :id"),
                {"dim": json.dumps({"is_time": dimension["is_time"]}), "id": field_id},
            )
        else:
            conn.execute(
                sa.text("UPDATE semantic_model_fields SET dimension = NULL WHERE id = :id"),
                {"id": field_id},
            )


def downgrade() -> None:
    op.drop_column("dataset_columns", "time_format")
