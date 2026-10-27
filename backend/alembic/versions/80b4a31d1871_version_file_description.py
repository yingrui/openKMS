"""Give a version file a description — the note that used to be composed in two places.

Revision ID: 80b4a31d1871
Revises: d1f2a3b4c5d6
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "80b4a31d1871"
down_revision: Union[str, Sequence[str], None] = "d1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DATE_COLUMNS = ("trade_date", "date", "dt", "as_of_date", "asof", "timestamp")


def upgrade() -> None:
    op.add_column("dataset_version_files", sa.Column("description", sa.String(512), nullable=True))

    # Backfill from what is already stored: the range and the version's recorded columns are enough, and the same
    # guess the upload path makes is applied here rather than invented twice.
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT version_id, name, date_from, date_to, columns
            FROM dataset_version_files
            WHERE date_from IS NOT NULL AND date_to IS NOT NULL
            """
        )
    ).all()
    for version_id, name, date_from, date_to, columns in rows:
        names = {c.get("name") for c in (columns or [])}
        column = next((c for c in DATE_COLUMNS if c in names), None)
        if column:
            conn.execute(
                sa.text(
                    "UPDATE dataset_version_files SET description = :d "
                    "WHERE version_id = :v AND name = :n"
                ),
                {"d": f"{column} {date_from} → {date_to}", "v": version_id, "n": name},
            )

def downgrade() -> None:
    op.drop_column("dataset_version_files", "description")
