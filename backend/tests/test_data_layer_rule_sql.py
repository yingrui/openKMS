"""Every rule is one SQL query: the generators, and how a result becomes a verdict.

Pure, so every branch is a test without a database. What is *not* here — the read-only transaction and
the statement timeout — is the runner's, tested where it lives.
"""
from decimal import Decimal

import pytest

from app.services.data_layer.rule_sql import (
    MAX_RULE_SQL,
    QualityError,
    build_rule_query,
    interpret,
    normalize_rule_sql,
    render_rule_sql,
)

TABLE = '"tushare"."daily_basic"'


class TestGenerators:
    def test_not_null_counts_nulls(self):
        q = build_rule_query("not_null", table=TABLE, column="ts_code", config={})
        assert "count(*) AS checked" in q.sql
        assert 'count(*) FILTER (WHERE "ts_code" IS NULL) AS failed' in q.sql
        assert q.shape == "rows"

    def test_unique_ignores_nulls(self):
        q = build_rule_query("unique", table=TABLE, column="ts_code", config={})
        assert 'count(*) FILTER (WHERE "ts_code" IS NOT NULL) AS checked' in q.sql
        assert 'COUNT(DISTINCT "ts_code")' in q.sql.replace("count", "COUNT")

    def test_range_binds_its_bounds_instead_of_interpolating_them(self):
        q = build_rule_query("range", table=TABLE, column="pe_ttm", config={"min": 0.1, "max": 300})
        assert "BETWEEN" not in q.sql          # the bounds are a predicate, not a literal
        assert ":min" in q.sql and ":max" in q.sql
        assert q.params == {"min": 0.1, "max": 300}

    def test_range_with_one_bound_only(self):
        q = build_rule_query("range", table=TABLE, column="pe_ttm", config={"min": 0.1})
        assert ":min" in q.sql and ":max" not in q.sql
        assert q.params == {"min": 0.1}

    def test_referential_queries_the_other_table(self):
        q = build_rule_query(
            "referential",
            table=TABLE,
            column="ts_code",
            config={"ref_column": "ts_code"},
            ref_table='"tushare"."stock_basic"',
        )
        assert 'NOT EXISTS (SELECT 1 FROM "tushare"."stock_basic" r' in q.sql
        assert 'r."ts_code" = t."ts_code"' in q.sql

    def test_freshness_is_date_arithmetic_like_the_python_it_replaced(self):
        q = build_rule_query("freshness", table=TABLE, column="trade_date", config={"max_age_days": 30})
        assert "current_date - :max_age" in q.sql
        assert "AS latest" in q.sql
        assert q.shape == "freshness"
        assert q.params == {"max_age": 30}
        # The threshold is part of what a run records: a date alone cannot explain the verdict.
        assert q.detail == {"max_age_days": 30}

    @pytest.mark.parametrize("expect", ["zero", "nonzero"])
    def test_sql_rule_carries_what_its_number_means(self, expect):
        q = build_rule_query(
            "sql",
            table=TABLE,
            column=None,
            config={"sql": "SELECT count(*) FROM {{table}}", "expect": expect},
        )
        assert q.expect == expect

    def test_sql_rule_defaults_to_counting_violations(self):
        q = build_rule_query("sql", table=TABLE, column=None, config={"sql": "SELECT count(*) FROM {{table}}"})
        assert q.expect == "zero"

    def test_an_unknown_expect_is_refused(self):
        with pytest.raises(QualityError, match="expect"):
            build_rule_query(
                "sql",
                table=TABLE,
                column=None,
                config={"sql": "SELECT count(*) FROM {{table}}", "expect": "sometimes"},
            )

    def test_sql_rule_is_rendered_and_kept_to_one_statement(self):
        q = build_rule_query(
            "sql", table=TABLE, column="pe_ttm", config={"sql": "SELECT count(*) FROM {{table}} WHERE {{column}} > 100"}
        )
        assert q.sql == 'SELECT count(*) FROM "tushare"."daily_basic" WHERE "pe_ttm" > 100'
        assert q.shape == "number"

    @pytest.mark.parametrize(
        "rule_type, column, config, message",
        [
            ("not_null", None, {}, "column is required"),
            ("range", "pe_ttm", {}, "needs a min or a max"),
            ("range", None, {"min": 1}, "column is required"),
            ("referential", "ts_code", {"ref_column": "x"}, "needs a target dataset"),
            ("freshness", None, {"max_age_days": 1}, "column is required"),
            ("nonsense", None, {}, "Unknown rule type"),
        ],
    )
    def test_a_rule_that_cannot_be_a_query_says_so(self, rule_type, column, config, message):
        with pytest.raises(QualityError, match=message):
            build_rule_query(rule_type, table=TABLE, column=column, config=config)


class TestAuthorSql:
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

    def test_quotes_the_column_and_leaves_an_absent_one_as_null(self):
        assert render_rule_sql("SELECT {{column}} FROM {{table}}", TABLE, "pe_ttm") == (
            'SELECT "pe_ttm" FROM "tushare"."daily_basic"'
        )
        assert render_rule_sql("SELECT {{column}} FROM {{table}}", TABLE, None) == (
            'SELECT NULL FROM "tushare"."daily_basic"'
        )


class TestInterpret:
    def test_a_coverage_number_is_a_verdict_in_the_other_direction(self):
        # "Are there rows for today?" — the absence is the violation, so 0 fails and >0 passes.
        found = interpret("number", ["count"], [[5]], expect="nonzero")
        assert found["status"] == "passed"
        assert found["failed_count"] == 0
        assert found["detail"] == {"value": 5, "expect": "nonzero"}

        missing = interpret("number", ["count"], [[0]], expect="nonzero")
        assert missing["status"] == "failed"
        assert missing["failed_count"] == 1          # one verdict: nothing was found
        assert missing["detail"] == {"value": 0, "expect": "nonzero"}

    def test_the_default_direction_still_reads_zero_as_a_pass(self):
        assert interpret("number", ["count"], [[0]])["detail"] == {"value": 0, "expect": "zero"}

    def test_a_number_is_a_verdict(self):
        assert interpret("number", ["count"], [[0]])["status"] == "passed"
        failed = interpret("number", ["count"], [[5]])
        assert failed["status"] == "failed"
        assert failed["failed_count"] == 5
        # An arbitrary query does not say how many rows it looked at; 0 would be a lie.
        assert failed["checked_count"] is None

    def test_two_columns_with_the_same_name_are_still_two_columns(self):
        # The case that escaped once: a dict of the result collapsed `count, count` into one key.
        with pytest.raises(QualityError, match="exactly one row with one number"):
            interpret("number", ["count", "count"], [[1007340, 1007340]])

    @pytest.mark.parametrize("value", [None, True, "abc"])
    def test_a_number_that_is_not_one(self, value):
        with pytest.raises(QualityError):
            interpret("number", ["count"], [[value]])

    @pytest.mark.parametrize("value", ["42", 42.0, Decimal("3")])
    def test_reads_a_number_whatever_the_driver_returns(self, value):
        assert interpret("number", ["count"], [[value]])["failed_count"] == int(float(value))

    def test_rows_shape_reads_checked_and_failed_by_name(self):
        result = interpret("rows", ["checked", "failed"], [[725_192, 51_425]])
        assert result == {
            "status": "failed",
            "checked_count": 725_192,
            "failed_count": 51_425,
            "detail": {},
        }

    def test_freshness_carries_the_date_it_saw(self):
        result = interpret("freshness", ["checked", "failed", "latest"], [[1, 0, "2026-10-09"]])
        assert result["status"] == "passed"
        assert result["detail"] == {"latest": "2026-10-09"}

    def test_an_empty_table_is_a_verdict_not_an_absence(self):
        assert interpret("freshness", ["checked", "failed", "latest"], [[1, 1, None]])["failed_count"] == 1

    def test_a_rule_query_must_answer_once(self):
        with pytest.raises(QualityError, match="exactly one row"):
            interpret("rows", ["checked", "failed"], [])
        with pytest.raises(QualityError, match="exactly one row"):
            interpret("rows", ["checked", "failed"], [[1, 0], [2, 0]])

    def test_a_rows_query_must_name_its_failed_column(self):
        with pytest.raises(QualityError, match="must return a `failed` column"):
            interpret("rows", ["checked", "n"], [[1, 0]])


class TestRunWrapsDatabaseErrors:
    """A bad query is a bad rule: `QualityError` (400 + a recorded `error` run), never a 500.

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

        monkeypatch.setattr(mod, "run_readonly_names", boom)

        dataset = Dataset(
            id="ds", data_source_id="src", schema_name="tushare", table_name="daily_basic",
            display_name="Daily basic", description=None, domain=None, tags=[],
            business_definition=None, primary_key_columns=[], unique_keys=[], ai_context=None,
            is_editable=False,
        )
        async def _get(*_args, **_kwargs):
            return SimpleNamespace(kind="postgresql")

        db = SimpleNamespace(get=_get)
        rule = QualityRule(
            id="r", dataset_id="ds", name="n", rule_type="sql", column_name=None,
            config={"sql": "SELECT count(*) FROM {{table}}"}, severity="warning", enabled=True,
        )

        with pytest.raises(QualityError, match="Rule execution failed"):
            asyncio.run(mod.run_rule(db, dataset, rule))

