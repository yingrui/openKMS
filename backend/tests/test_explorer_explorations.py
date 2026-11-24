"""Saved explorations: what may be stored, and which layout an exploration opens with."""

from __future__ import annotations

import pytest

from app.services.explorer.explorations import (
    ExplorationError,
    effective_layout,
    normalize_layout,
    validate_filters,
    validate_visibility,
)


def test_conditions_accept_the_url_grammar_and_become_dicts():
    assert validate_filters(["region:eq:华东", "@allocatesTo/cycle:eq:2026-W46"]) == [
        {"prop": "region", "op": "eq", "value": "华东"},
        {"prop": "cycle", "op": "eq", "value": "2026-W46", "via": "allocatesTo"},
    ]


def test_conditions_can_be_dicts_too_so_the_api_and_the_url_agree():
    assert validate_filters([{"prop": "status", "op": "in", "value": ["active"]}]) == [
        {"prop": "status", "op": "in", "value": ["active"]}
    ]


def test_a_condition_the_reader_could_not_run_is_refused_here():
    with pytest.raises(ExplorationError):
        validate_filters(["region:like:华东"])
    with pytest.raises(ExplorationError):
        validate_filters([{"op": "eq", "value": "x"}])


def test_layout_carries_exactly_four_things():
    layout = normalize_layout(
        {
            "charts": [{"prop": "region"}, "rating"],
            "columns": ["distributor_id"],
            "sorts": [{"prop": "exposure", "desc": True}],
            "perspective": "results",
        }
    )
    assert layout == {
        "charts": [{"prop": "region"}, {"prop": "rating"}],
        "columns": ["distributor_id"],
        "sorts": [{"prop": "exposure", "desc": True}],
        "perspective": "results",
    }


def test_an_unknown_layout_key_or_perspective_is_a_400_not_a_silent_drop():
    with pytest.raises(ExplorationError):
        normalize_layout({"charts": [], "colour": "red"})
    with pytest.raises(ExplorationError):
        normalize_layout({"perspective": "graph"})


def test_visibility_is_one_of_two_words():
    assert validate_visibility(None) == "private"
    assert validate_visibility("shared") == "shared"
    with pytest.raises(ExplorationError):
        validate_visibility("public")


class _Row:
    def __init__(self, owner_sub: str, layout: dict):
        self.owner_sub = owner_sub
        self.layout = layout


class _Session:
    def __init__(self, rows):
        self._rows = rows

    async def execute(self, _query):
        rows = self._rows

        class _Result:
            def scalars(self):
                return self

            def all(self):
                return rows

        return _Result()


def test_a_personal_layout_wins_over_the_global_one():
    import asyncio

    session = _Session([_Row("", {"charts": [{"prop": "global"}]}), _Row("u1", {"charts": [{"prop": "mine"}]})])
    layout, source = asyncio.run(effective_layout(session, "t1", "u1"))
    assert source == "personal"
    assert layout == {"charts": [{"prop": "mine"}]}

    layout, source = asyncio.run(effective_layout(session, "t1", "someone-else"))
    assert source == "global"
    assert layout == {"charts": [{"prop": "global"}]}


def test_without_any_layout_the_caller_falls_back_to_the_type_itself():
    import asyncio

    layout, source = asyncio.run(effective_layout(_Session([]), "t1", "u1"))
    assert (layout, source) == ({}, "builtin")


def test_a_chart_can_carry_a_metric_and_a_split():
    layout = normalize_layout(
        {
            "charts": [
                {"prop": "region"},
                {"prop": "region", "split": "tier"},
                {"prop": "region", "metric": "avg", "measure": "lead_time_weeks"},
            ]
        }
    )
    assert layout["charts"] == [
        {"prop": "region"},
        {"prop": "region", "split": "tier"},
        {"prop": "region", "metric": "avg", "measure": "lead_time_weeks"},
    ]


def test_a_metric_without_a_measure_is_refused_not_ignored():
    with pytest.raises(ExplorationError):
        normalize_layout({"charts": [{"prop": "region", "metric": "avg"}]})
    with pytest.raises(ExplorationError):
        normalize_layout({"charts": [{"prop": "region", "metric": "median", "measure": "x"}]})


def test_the_results_table_columns_are_part_of_the_layout():
    layout = normalize_layout({"columns": ["region", " tier "], "charts": [{"prop": "region"}]})
    assert layout["columns"] == ["region", "tier"]
    with pytest.raises(ExplorationError):
        normalize_layout({"columns": "region"})
    with pytest.raises(ExplorationError):
        normalize_layout({"columns": [""]})
