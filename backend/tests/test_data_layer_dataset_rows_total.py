"""How a dataset page answers "how many rows": never by walking a huge table."""

from __future__ import annotations

import pytest

from app.constants import EXACT_COUNT_MAX_ROWS
from app.services.data.data_layer.dataset_rows import choose_total_source


@pytest.mark.parametrize(
    "estimate, has_filters, expected",
    [
        # Small table: an exact count is free, so never approximate it.
        (3, False, "exact"),
        (3, True, "exact"),
        (EXACT_COUNT_MAX_ROWS - 1, False, "exact"),
        # Big table, no filter: the planner's reltuples (~0.5ms for 66M rows).
        (EXACT_COUNT_MAX_ROWS, False, "estimate"),
        (65_923_846, False, "estimate"),
        # Big table with a filter: count, but the filter usually reaches an index.
        (EXACT_COUNT_MAX_ROWS, True, "bounded"),
        (65_923_846, True, "bounded"),
        # Never analysed (reltuples = -1 → None): try to count, on the short leash.
        (None, False, "bounded"),
        (None, True, "bounded"),
    ],
)
def test_the_total_source_follows_table_size(estimate, has_filters, expected):
    assert choose_total_source(estimate, has_filters) == expected


def test_an_empty_estimate_is_unknown_not_zero():
    """reltuples = 0 after a TRUNCATE is a real answer; -1 is "never analysed" and becomes None."""
    assert choose_total_source(0, False) == "exact"
