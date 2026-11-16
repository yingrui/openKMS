"""period is a labelled filter; no metric time mode

Revision ID: 6bd196880493
Revises: 1b50e0ac73f4
Create Date: 2026-11-16 19:08:54.989141

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6bd196880493'
down_revision: Union[str, Sequence[str], None] = '1b50e0ac73f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """A metric has no "time mode": the period is a run argument, and time is a field role.

    `time_mode` had three values that each duplicated something else — `period` restated the metric's
    `time_dimension`, `snapshot` refused a past period only because the period column could not be filtered,
    and `none` meant "no field". A rule now declares `{kind: filter, field: cycle, role: period}`: the same
    field and value as any filter, plus an interval derived from the field's calendar.

    Existing rules are converted: `resolve_period` maps each rule's `period` argument to a filter with
    `role: period` (using the metric's `time_dimension`), and drops period arguments that resolve to nothing.
    """
    op.drop_column("metric_definitions", "time_mode")
    op.execute(
        """
        UPDATE metric_rules
        SET run_params = jsonb_set(
            run_params,
            '{arguments}',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        CASE
                            WHEN arg -> 'kind' = '"period"' THEN jsonb_strip_nulls(
                                jsonb_build_object(
                                    'key', arg -> 'key',
                                    'kind', 'filter',
                                    'field', COALESCE(arg -> 'binding' ->> 'field', metric_definitions.time_dimension),
                                    'role', 'period'
                                )
                            )
                            ELSE arg
                        END
                    )
                    FROM jsonb_array_elements(COALESCE(run_params -> 'arguments', '[]'::jsonb)) AS arg
                ),
                '[]'::jsonb
            )
        )
        FROM metric_definitions
        WHERE metric_rules.metric_id = metric_definitions.id
          AND run_params -> 'arguments' IS NOT NULL
        """
    )
    # A period argument that resolved to no field cannot be a period any more.
    op.execute(
        """
        UPDATE metric_rules
        SET run_params = jsonb_set(
            run_params,
            '{arguments}',
            COALESCE(
                (
                    SELECT jsonb_agg(arg)
                    FROM jsonb_array_elements(run_params -> 'arguments') AS arg
                    WHERE NOT (arg -> 'role' = '"period"' AND arg -> 'field' IS NULL)
                ),
                '[]'::jsonb
            )
        )
        WHERE run_params -> 'arguments' IS NOT NULL
        """
    )


def downgrade() -> None:
    op.add_column(
        "metric_definitions",
        sa.Column("time_mode", sa.String(length=16), nullable=False, server_default="none"),
    )
    op.execute(
        """
        UPDATE metric_rules
        SET run_params = jsonb_set(
            run_params,
            '{arguments}',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        CASE
                            WHEN arg -> 'role' = '"period"' THEN jsonb_build_object(
                                'key', arg -> 'key',
                                'kind', 'period',
                                'binding', jsonb_build_object(
                                    'source', 'field',
                                    'field', arg -> 'field',
                                    'offset', 0
                                )
                            )
                            ELSE arg
                        END
                    )
                    FROM jsonb_array_elements(COALESCE(run_params -> 'arguments', '[]'::jsonb)) AS arg
                ),
                '[]'::jsonb
            )
        )
        WHERE run_params -> 'arguments' IS NOT NULL
        """
    )
