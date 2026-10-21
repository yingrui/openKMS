"""Let a saved link name any object, not only a queue row.

`link_instances` pointed both endpoints at `object_instances` — the Action/REST *write queue*.
A dataset-backed object never has a queue row, so every link to one was rejected by the database
no matter what the API allowed: the scenario "change belongs to a turtle Portfolio" could not be
stored at all.

The graph is the read path and the identity source (`__rid` for hand-created types, the business
key for dataset-backed ones), so the table records the two object ids and stops claiming a foreign
key it cannot guarantee. Deleting an object now removes the links that name it, so a later bulk
index cannot resurrect the edge.

Revision ID: d9e0f1a2b3c4
Revises: 40750727b377
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "40750727b377"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("link_instances_source_object_id_fkey", "link_instances", type_="foreignkey")
    op.drop_constraint("link_instances_target_object_id_fkey", "link_instances", type_="foreignkey")


def downgrade() -> None:
    # Rows naming a dataset-backed object would violate the restored keys; they are exactly what
    # this migration allows, so the rollback deletes them rather than failing.
    op.execute(
        """
        DELETE FROM link_instances li
        WHERE NOT EXISTS (SELECT 1 FROM object_instances oi WHERE oi.id = li.source_object_id)
           OR NOT EXISTS (SELECT 1 FROM object_instances oi WHERE oi.id = li.target_object_id)
        """
    )
    op.create_foreign_key(
        "link_instances_source_object_id_fkey",
        "link_instances",
        "object_instances",
        ["source_object_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "link_instances_target_object_id_fkey",
        "link_instances",
        "object_instances",
        ["target_object_id"],
        ["id"],
        ondelete="CASCADE",
    )
