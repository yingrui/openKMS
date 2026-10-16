"""A report's presentation is a `view`, not a `chart`.

Revision ID: d1c2b3a4e5f6
Revises: c9a1b2c3d4e5
Create Date: 2026-10-16

A dashboard is not four line charts: half of one is single numbers and rankings. The field that said
"how to read this report's result" was called `chart`, which only ever described one of the three
shapes, so it becomes `view` with a `kind`:

* `{"kind": "chart",     "type": "line"|"bar", "x", "y", "series"}`  — a trend (what it always was)
* `{"kind": "metric",    "column", "label"}`                          — one number
* `{"kind": "bar_list",  "column", "label_column"}`                  — a ranking
* no `view` at all                                                    — the table

Existing documents are reshaped in place: `chart: {type, x, y, series}` → `view: {kind: "chart", …}`.
Nothing but presentation is touched — the source, query and stored result stay as they are.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d1c2b3a4e5f6"
down_revision: Union[str, Sequence[str], None] = "c9a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "explorer_dashboards"

#: Every report that still carries a bare `chart` gets the equivalent `view` (kind `chart`).
_TO_VIEW = """
UPDATE {table} SET reports = (
    SELECT COALESCE(jsonb_agg(
        CASE
          WHEN elem ? 'chart' AND jsonb_typeof(elem -> 'chart') = 'object'
            THEN (elem - 'chart') || jsonb_build_object('view', (elem -> 'chart') || jsonb_build_object('kind', 'chart'))
          WHEN elem ? 'chart'
            THEN elem - 'chart'
          ELSE elem
        END
    ), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(reports, '[]'::jsonb)) AS elem
) WHERE reports IS NOT NULL
"""

#: Back to the old shape: only a chart can be expressed, so a metric/ranking becomes a table.
_TO_CHART = """
UPDATE {table} SET reports = (
    SELECT COALESCE(jsonb_agg(
        CASE
          WHEN elem -> 'view' ->> 'kind' = 'chart'
            THEN (elem - 'view') || jsonb_build_object(
                   'chart',
                   (elem -> 'view') - 'kind'
                 )
          ELSE elem - 'view'
        END
    ), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(reports, '[]'::jsonb)) AS elem
) WHERE reports IS NOT NULL
"""


def _has_table() -> bool:
    return _TABLE in set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if not _has_table():
        return
    op.get_bind().execute(sa.text(_TO_VIEW.format(table=_TABLE)))


def downgrade() -> None:
    if not _has_table():
        return
    op.get_bind().execute(sa.text(_TO_CHART.format(table=_TABLE)))
