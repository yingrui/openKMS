"""fields: keep only real overrides in `dimension`

Revision ID: dm1dimensionclean
Revises: dc1timeformat
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "dm1dimensionclean"
down_revision = "dc1timeformat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """`{"is_time": true}` agrees with the column, so it is not an override — say nothing instead.

    Once the time role comes from the column's `time_format`, a field's `dimension` only carries a *statement*:
    this model treats the column differently. A row that repeats the column's own answer makes it impossible to
    tell an override from a leftover, so those rows are cleared. `{"is_time": false}` stays: that is the audit
    timestamp staying out of the time axis.
    """
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE semantic_model_fields SET dimension = NULL "
            "WHERE dimension = CAST(:agree AS jsonb)"
        ),
        {"agree": '{"is_time": true}'},
    )


def downgrade() -> None:
    # The information removed was redundant; nothing to restore.
    pass
