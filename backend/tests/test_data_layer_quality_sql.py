"""A `sql` quality rule: the shape checks, the placeholders, and the one-number contract.

The execution itself is `run_readonly` (read-only transaction + statement timeout), which is covered
where it lives; what is new here is the rule's envelope, and that is pure, so it is tested directly.
"""
from decimal import Decimal

import pytest

from app.services.data_layer.quality import (
    MAX_RULE_SQL,
    QualityError,
    normalize_rule_sql,
    render_rule_sql,
    verdict_from_sql,
)


class TestShape:
    def test_accepts_a_select_and_drops_the_trailing_semicolon(self):
        assert normalize_rule_sql("SELECT count(*) FROM {{table}};") == "SELECT count(*) FROM {{table}}"

    def test_accepts_a_cte(self):
        sql = "WITH bad AS (SELECT 1 FROM {{table}}) SELECT count(*) FROM bad"
        assert normalize_rule_sql(sql) == sql

    @pytest.mark.parametrize(
        "sql, message",
        [
            ("", "needs a query"),
            ("   ;  ", "needs a query"),
            ("DELETE FROM {{table}}", "must be a SELECT"),
            ("UPDATE {{table}} SET x = 1", "must be a SELECT"),
            ("SELECT 1 FROM {{table}}; SELECT 2", "single statement"),
            ("SELECT 1", "must read {{table}}"),
        ],
    )
    def test_refuses_what_is_not_a_rule(self, sql, message):
        with pytest.raises(QualityError, match=message):
            normalize_rule_sql(sql)

    def test_refuses_a_script(self):
        with pytest.raises(QualityError, match="under"):
            normalize_rule_sql("SELECT 1 FROM {{table}} WHERE " + "x" * MAX_RULE_SQL)


class TestPlaceholders:
    def test_fills_the_table_and_quotes_the_column(self):
        assert (
            render_rule_sql("SELECT count(*) FROM {{table}} WHERE {{column}} > 1", '"s"."t"', "pe_ttm")
            == 'SELECT count(*) FROM "s"."t" WHERE "pe_ttm" > 1'
        )

    def test_without_a_column_the_placeholder_is_null_not_a_crash(self):
        assert render_rule_sql("SELECT {{column}} FROM {{table}}", '"s"."t"', None) == 'SELECT NULL FROM "s"."t"'

    def test_an_invalid_column_is_null_too(self):
        # `column_name` is validated where it is used; a bad one must not reach the SQL text.
        assert render_rule_sql("SELECT {{column}} FROM {{table}}", '"s"."t"', 'x"; DROP') == 'SELECT NULL FROM "s"."t"'


class TestVerdict:
    def test_zero_is_a_pass_and_a_positive_count_is_the_failure(self):
        assert verdict_from_sql(1, [0]) == 0
        assert verdict_from_sql(1, [5]) == 5

    @pytest.mark.parametrize("value", ["42", 42.0, Decimal("3")])
    def test_reads_a_number_whatever_the_driver_returns(self, value):
        assert verdict_from_sql(1, [value]) == int(float(value))

    @pytest.mark.parametrize("shape", [(2, [1, 2]), (1, []), (1, [1, 2])])
    def test_refuses_anything_but_one_value_in_one_column(self, shape):
        with pytest.raises(QualityError, match="exactly one row"):
            verdict_from_sql(*shape)

    def test_two_columns_with_the_same_name_are_still_two_columns(self):
        # The case that escaped: a dict of the result collapsed `count, count` into one key.
        with pytest.raises(QualityError, match="exactly one row"):
            verdict_from_sql(2, [1007340])

    @pytest.mark.parametrize("value", [None, True, "abc"])
    def test_refuses_a_non_number(self, value):
        with pytest.raises(QualityError):
            verdict_from_sql(1, [value])


class TestRunWrapsDatabaseErrors:
    """A bad query is a bad rule: `QualityError` (HTTP 400 + a recorded `error` run), never a 500.

    This escaped once — the SQL branch returned before the branch-wide `except` — so the check is a
    test, not a comment.
    """

    def test_a_database_error_becomes_a_quality_error(self, monkeypatch):
        import asyncio
        from types import SimpleNamespace

        from app.models.dataset import Dataset
        from app.models.quality_rule import QualityRule
        from app.services.data_layer import quality as mod

        def boom(*_a, **_k):
            raise RuntimeError('column "high" does not exist')

        monkeypatch.setattr(mod, "run_readonly_scalar", boom)

        dataset = Dataset(
            id="ds", data_source_id="src", schema_name="tushare", table_name="daily_basic",
            display_name="Daily basic", description=None, domain=None, tags=[],
            business_definition=None, primary_key_columns=[], unique_keys=[], ai_context=None,
            is_editable=False,
        )
        ds = SimpleNamespace(kind="postgresql")
        db = SimpleNamespace(get=lambda *_a, **_k: _returns(ds))
        rule = QualityRule(
            id="r", dataset_id="ds", name="n", rule_type="sql", column_name=None,
            config={"sql": "SELECT count(*) FROM {{table}}"}, severity="warning", enabled=True,
        )

        with pytest.raises(QualityError, match="Rule execution failed"):
            asyncio.run(mod.run_rule(db, dataset, rule))


def _returns(value):
    async def _inner():
        return value
    return _inner()
