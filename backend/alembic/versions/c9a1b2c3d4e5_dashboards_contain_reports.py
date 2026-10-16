"""Dashboards contain reports: rename, and move the source into each report.

Revision ID: c9a1b2c3d4e5
Revises: b3c4d5e6f7a8
Create Date: 2026-10-16

The model was inverted: the saved document was called a *report* and its tiles *blocks*, while each
tile is a **report** and the document is a **dashboard**. Renaming is not cosmetic here — it is what
made "one source per document" look reasonable, when a dashboard's reports each own their source
(that is how a dashboard puts a model metric beside a raw-dataset check).

* ``explorer_reports`` → ``explorer_dashboards``, column ``blocks`` → ``reports``
* each report gains the source the dashboard carried (``source_kind`` / ``dataset_id`` /
  ``semantic_model_id``), then the dashboard-level columns are dropped — no data is lost: every
  report of a dashboard read that same source before
* the API path moved to ``/api/explorer-dashboards``, so the two permission keys' patterns are
  re-applied (a Python-only change never updates existing rows)
"""

from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.permissions.permission_catalog import PERM_EXPLORER_READ, PERM_EXPLORER_WRITE

revision: str = "c9a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD_TABLE = "explorer_reports"
_NEW_TABLE = "explorer_dashboards"
_SOURCE_COLUMNS = ("source_kind", "dataset_id", "semantic_model_id")

#: Give every report the source its dashboard carried, unless it already declares one.
_INHERIT_SOURCE = """
UPDATE {table} SET reports = (
    SELECT COALESCE(jsonb_agg(
        CASE WHEN elem ? 'source_kind' THEN elem ELSE elem || jsonb_build_object(
            'source_kind', source_kind,
            'dataset_id', dataset_id,
            'semantic_model_id', semantic_model_id
        ) END
    ), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(reports, '[]'::jsonb)) AS elem
) WHERE reports IS NOT NULL
"""

#: The reverse: a dashboard takes the source of its first report back (the model allowed only one).
_LIFT_SOURCE = """
UPDATE {table} SET
    source_kind = COALESCE(reports -> 0 ->> 'source_kind', 'dataset'),
    dataset_id = reports -> 0 ->> 'dataset_id',
    semantic_model_id = reports -> 0 ->> 'semantic_model_id',
    reports = (
        SELECT COALESCE(jsonb_agg(elem - 'source_kind' - 'dataset_id' - 'semantic_model_id'), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(reports, '[]'::jsonb)) AS elem
    )
WHERE reports IS NOT NULL
"""


def _refresh_explorer_patterns(conn: sa.engine.Connection) -> None:
    from app.services.permissions.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    hints = {h.key: h for h in OPERATION_KEY_HINTS}
    for key in (PERM_EXPLORER_READ, PERM_EXPLORER_WRITE):
        hint = hints.get(key)
        if hint is None:
            continue
        fe, be = default_patterns_for_key(key)
        conn.execute(
            sa.text(
                """
                UPDATE security_permissions SET
                  label = :label,
                  description = :desc,
                  frontend_route_patterns = CAST(:fe AS jsonb),
                  backend_api_patterns = CAST(:be AS jsonb)
                WHERE key = :k
                """
            ),
            {
                "label": hint.label,
                "desc": hint.description,
                "fe": json.dumps(list(fe)),
                "be": json.dumps(list(be)),
                "k": key,
            },
        )


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = set(insp.get_table_names())
    if _OLD_TABLE in tables:
        op.rename_table(_OLD_TABLE, _NEW_TABLE)
        insp = sa.inspect(conn)
    if _NEW_TABLE not in set(insp.get_table_names()):
        return

    columns = {c["name"] for c in insp.get_columns(_NEW_TABLE)}
    if "blocks" in columns:
        op.alter_column(_NEW_TABLE, "blocks", new_column_name="reports")
        columns.discard("blocks")
        columns.add("reports")
    if "reports" in columns:
        conn.execute(sa.text(_INHERIT_SOURCE.format(table=_NEW_TABLE)))
    for column in _SOURCE_COLUMNS:
        if column in columns:
            op.drop_column(_NEW_TABLE, column)

    if "security_permissions" in set(insp.get_table_names()):
        _refresh_explorer_patterns(conn)


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if _NEW_TABLE not in set(insp.get_table_names()):
        return

    columns = {c["name"] for c in insp.get_columns(_NEW_TABLE)}
    if "source_kind" not in columns:
        op.add_column(
            _NEW_TABLE,
            sa.Column("source_kind", sa.String(16), nullable=False, server_default="dataset"),
        )
    if "dataset_id" not in columns:
        op.add_column(_NEW_TABLE, sa.Column("dataset_id", sa.String(64), nullable=True))
    if "semantic_model_id" not in columns:
        op.add_column(_NEW_TABLE, sa.Column("semantic_model_id", sa.String(64), nullable=True))
    if "reports" in columns:
        conn.execute(sa.text(_LIFT_SOURCE.format(table=_NEW_TABLE)))
        op.alter_column(_NEW_TABLE, "reports", new_column_name="blocks")

    op.rename_table(_NEW_TABLE, _OLD_TABLE)

    insp = sa.inspect(conn)
    if "security_permissions" in set(insp.get_table_names()):
        _refresh_explorer_patterns(conn)

