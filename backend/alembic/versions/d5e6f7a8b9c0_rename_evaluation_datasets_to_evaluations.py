"""Rename evaluation_datasets → evaluations; items, runs, junction; ABAC + toggles.

Revision ID: d5e6f7a8b9c0
Revises: a0b1c2d3e4f5
Create Date: 2026-05-18

"""
from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, None] = "a0b1c2d3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _refresh_eval_permission_patterns(conn) -> None:
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    for key in ("evaluation:read", "evaluation:write"):
        fe, be = default_patterns_for_key(key)
        conn.execute(
            sa.text(
                """
                UPDATE security_permissions SET
                  frontend_route_patterns = CAST(:fe AS jsonb),
                  backend_api_patterns = CAST(:be AS jsonb)
                WHERE key = :k
                """
            ),
            {"fe": json.dumps(fe), "be": json.dumps(be), "k": key},
        )


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("UPDATE feature_toggles SET key = 'evaluations' WHERE key = 'evaluationDatasets'"))

    conn.execute(
        sa.text(
            """
            UPDATE data_resources
            SET resource_kind = 'evaluation',
                attributes = (attributes - 'evaluation_dataset_id')
                  || jsonb_build_object('evaluation_id', attributes->>'evaluation_dataset_id')
            WHERE resource_kind = 'evaluation_dataset'
              AND attributes ? 'evaluation_dataset_id'
            """
        )
    )

    # Drop indexes that embed old table/column names (recreate after renames).
    for stmt in (
        "DROP INDEX IF EXISTS ix_evaluation_run_items_dataset_item_id",
        "DROP INDEX IF EXISTS ix_evaluation_run_items_evaluation_run_id",
        "DROP INDEX IF EXISTS ix_evaluation_runs_evaluation_dataset_id",
        "DROP INDEX IF EXISTS ix_evaluation_runs_dataset_created",
        "DROP INDEX IF EXISTS ix_evaluation_runs_knowledge_base_id",
        "DROP INDEX IF EXISTS ix_evaluation_datasets_wiki_space_id",
        "DROP INDEX IF EXISTS ix_evaluation_datasets_knowledge_base_id",
        "DROP INDEX IF EXISTS ix_evaluation_dataset_items_evaluation_dataset_id",
    ):
        conn.execute(sa.text(stmt))

    op.rename_table("access_group_evaluation_datasets", "access_group_evaluations")
    op.execute("ALTER TABLE access_group_evaluations RENAME COLUMN evaluation_dataset_id TO evaluation_id")

    op.execute("ALTER TABLE evaluation_runs RENAME COLUMN evaluation_dataset_id TO evaluation_id")

    op.execute("ALTER TABLE evaluation_datasets RENAME TO evaluations")

    op.rename_table("evaluation_dataset_items", "evaluation_items")
    op.execute("ALTER TABLE evaluation_items RENAME COLUMN evaluation_dataset_id TO evaluation_id")

    op.execute("ALTER TABLE evaluation_run_items RENAME COLUMN evaluation_dataset_item_id TO evaluation_item_id")

    op.create_index("ix_evaluation_runs_evaluation_id", "evaluation_runs", ["evaluation_id"], unique=False)
    op.create_index(
        "ix_evaluation_runs_evaluation_created",
        "evaluation_runs",
        ["evaluation_id", "created_at"],
        unique=False,
    )
    op.create_index("ix_evaluation_runs_knowledge_base_id", "evaluation_runs", ["knowledge_base_id"], unique=False)
    op.create_index(
        "ix_evaluation_run_items_evaluation_item_id",
        "evaluation_run_items",
        ["evaluation_item_id"],
        unique=False,
    )
    op.create_index(
        "ix_evaluation_run_items_evaluation_run_id", "evaluation_run_items", ["evaluation_run_id"], unique=False
    )
    op.create_index("ix_evaluations_knowledge_base_id", "evaluations", ["knowledge_base_id"], unique=False)
    op.create_index("ix_evaluations_wiki_space_id", "evaluations", ["wiki_space_id"], unique=False)
    op.create_index("ix_evaluation_items_evaluation_id", "evaluation_items", ["evaluation_id"], unique=False)

    _refresh_eval_permission_patterns(conn)


def downgrade() -> None:
    conn = op.get_bind()

    # Restore permission patterns to pre-rename SPA/API paths.
    if "security_permissions" in sa.inspect(conn).get_table_names():
        old_read_fe = ["/evaluation-datasets", "/evaluation-datasets/*"]
        old_read_be = ["GET /api/evaluation-datasets/*", "HEAD /api/evaluation-datasets/*"]
        old_write_fe = ["/evaluation-datasets", "/evaluation-datasets/*"]
        old_write_be = [
            "POST /api/evaluation-datasets/*",
            "PUT /api/evaluation-datasets/*",
            "PATCH /api/evaluation-datasets/*",
            "DELETE /api/evaluation-datasets/*",
        ]
        conn.execute(
            sa.text(
                """
                UPDATE security_permissions SET
                  frontend_route_patterns = CAST(:fe AS jsonb),
                  backend_api_patterns = CAST(:be AS jsonb)
                WHERE key = 'evaluation:read'
                """
            ),
            {"fe": json.dumps(old_read_fe), "be": json.dumps(old_read_be)},
        )
        conn.execute(
            sa.text(
                """
                UPDATE security_permissions SET
                  frontend_route_patterns = CAST(:fe AS jsonb),
                  backend_api_patterns = CAST(:be AS jsonb)
                WHERE key = 'evaluation:write'
                """
            ),
            {"fe": json.dumps(old_write_fe), "be": json.dumps(old_write_be)},
        )

    op.drop_index("ix_evaluation_items_evaluation_id", table_name="evaluation_items")
    op.drop_index("ix_evaluations_wiki_space_id", table_name="evaluations")
    op.drop_index("ix_evaluations_knowledge_base_id", table_name="evaluations")
    op.drop_index("ix_evaluation_run_items_evaluation_run_id", table_name="evaluation_run_items")
    op.drop_index("ix_evaluation_run_items_evaluation_item_id", table_name="evaluation_run_items")
    op.drop_index("ix_evaluation_runs_knowledge_base_id", table_name="evaluation_runs")
    op.drop_index("ix_evaluation_runs_evaluation_created", table_name="evaluation_runs")
    op.drop_index("ix_evaluation_runs_evaluation_id", table_name="evaluation_runs")

    op.execute("ALTER TABLE evaluation_run_items RENAME COLUMN evaluation_item_id TO evaluation_dataset_item_id")
    op.rename_table("evaluation_items", "evaluation_dataset_items")
    op.execute("ALTER TABLE evaluation_dataset_items RENAME COLUMN evaluation_id TO evaluation_dataset_id")

    op.execute("ALTER TABLE evaluations RENAME TO evaluation_datasets")

    op.execute("ALTER TABLE evaluation_runs RENAME COLUMN evaluation_id TO evaluation_dataset_id")

    op.execute("ALTER TABLE access_group_evaluations RENAME COLUMN evaluation_id TO evaluation_dataset_id")
    op.rename_table("access_group_evaluations", "access_group_evaluation_datasets")

    op.create_index(
        "ix_evaluation_dataset_items_evaluation_dataset_id",
        "evaluation_dataset_items",
        ["evaluation_dataset_id"],
        unique=False,
    )
    op.create_index(
        "ix_evaluation_datasets_knowledge_base_id", "evaluation_datasets", ["knowledge_base_id"], unique=False
    )
    op.create_index(
        "ix_evaluation_datasets_wiki_space_id", "evaluation_datasets", ["wiki_space_id"], unique=False
    )
    op.create_index(
        "ix_evaluation_run_items_dataset_item_id",
        "evaluation_run_items",
        ["evaluation_dataset_item_id"],
        unique=False,
    )
    op.create_index(
        "ix_evaluation_run_items_evaluation_run_id", "evaluation_run_items", ["evaluation_run_id"], unique=False
    )
    op.create_index(
        "ix_evaluation_runs_dataset_created",
        "evaluation_runs",
        ["evaluation_dataset_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_evaluation_runs_evaluation_dataset_id", "evaluation_runs", ["evaluation_dataset_id"], unique=False
    )
    op.create_index(
        "ix_evaluation_runs_knowledge_base_id", "evaluation_runs", ["knowledge_base_id"], unique=False
    )

    conn.execute(
        sa.text(
            """
            UPDATE data_resources
            SET resource_kind = 'evaluation_dataset',
                attributes = (attributes - 'evaluation_id')
                  || jsonb_build_object('evaluation_dataset_id', attributes->>'evaluation_id')
            WHERE resource_kind = 'evaluation'
              AND attributes ? 'evaluation_id'
            """
        )
    )

    conn.execute(sa.text("UPDATE feature_toggles SET key = 'evaluationDatasets' WHERE key = 'evaluations'"))
