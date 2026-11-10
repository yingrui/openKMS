"""The deterministic half of data-query evaluation: shape, not numbers."""
from app.services.workspace.evaluations.data_query_judge import (
    extract_sql_features,
    judge_query_features,
    match_sources_to_queries,
)


def source(sql: str, model_id: str = "m1", metric: str | None = None) -> dict:
    return {"model_id": model_id, "metric": metric, "sql": sql}


class TestExtractSqlFeatures:
    def test_tables_are_schema_qualified_and_bare(self):
        feats = extract_sql_features('SELECT * FROM "tushare"."daily_basic" d JOIN "tushare"."trade_calendar" c ON d.trade_date = c.cal_date')
        assert "tushare.daily_basic" in feats["tables"]
        assert "tushare.trade_calendar" in feats["tables"]

    def test_columns_from_the_select_list(self):
        feats = extract_sql_features('SELECT industry, count(*) AS n, sum(mkt_cap) FROM "tushare"."daily_basic"')
        assert {"industry", "n", "mkt_cap"} <= feats["columns"]

    def test_group_by(self):
        feats = extract_sql_features('SELECT industry, count(*) FROM "tushare"."daily_basic" GROUP BY industry, trade_date')
        assert {"industry", "trade_date"} <= feats["group_by"]

    def test_a_literal_that_names_a_table_is_not_a_table(self):
        feats = extract_sql_features("SELECT 'tushare.daily_basic' AS note, count(*) AS n FROM \"tushare\".\"daily_basic\"")
        assert feats["tables"] == {"tushare.daily_basic"}


class TestJudgeQueryFeatures:
    def test_right_model_metric_and_shape_passes(self):
        expected = {"model_id": "m1", "metric": "rev_by_industry", "sql": {"tables": ["tushare.daily_basic"], "group_by": ["industry"]}}
        actual = source('SELECT industry, count(*) FROM "tushare"."daily_basic" GROUP BY industry', metric="rev_by_industry")
        verdict = judge_query_features(expected, actual)
        assert verdict["passed"] is True, verdict["reasons"]

    def test_wrong_model_fails_with_a_reason(self):
        expected = {"model_id": "m1"}
        verdict = judge_query_features(expected, source("SELECT 1", model_id="m2"))
        assert verdict["passed"] is False
        assert any("m2" in r for r in verdict["reasons"])

    def test_missing_table_fails_and_names_it(self):
        expected = {"model_id": "m1", "sql": {"tables": ["tushare.trade_calendar"]}}
        verdict = judge_query_features(expected, source('SELECT * FROM "tushare"."daily_basic"'))
        assert verdict["passed"] is False
        assert any("trade_calendar" in r for r in verdict["reasons"])

    def test_a_forbidden_column_fails(self):
        expected = {"model_id": "m1", "sql": {"forbid": ["pe_ttm"]}}
        verdict = judge_query_features(expected, source('SELECT pe_ttm, count(*) FROM "tushare"."daily_basic"'))
        assert verdict["passed"] is False
        assert any("pe_ttm" in r for r in verdict["reasons"])

    def test_the_model_id_is_itself_a_check(self):
        # a data-query evaluation that only pins the model passes when the cited model matches
        verdict = judge_query_features({"model_id": "m1"}, source("SELECT 1", model_id="m1"))
        assert verdict["passed"] is True


class TestMatchSourcesToQueries:
    def test_every_expected_query_must_be_covered(self):
        expected = [
            {"model_id": "m1", "sql": {"tables": ["tushare.daily_basic"]}},
            {"model_id": "m1", "sql": {"tables": ["tushare.trade_calendar"]}},
        ]
        sources = [source('SELECT * FROM "tushare"."daily_basic"')]
        result = match_sources_to_queries(expected, sources)
        assert result["passed"] is False
        assert result["coverage"] == 0.5

    def test_two_queries_two_sources(self):
        expected = [
            {"model_id": "m1", "sql": {"tables": ["tushare.daily_basic"]}},
            {"model_id": "m1", "sql": {"tables": ["tushare.trade_calendar"]}},
        ]
        sources = [
            source('SELECT * FROM "tushare"."daily_basic"'),
            source('SELECT * FROM "tushare"."trade_calendar"'),
        ]
        result = match_sources_to_queries(expected, sources)
        assert result["passed"] is True
        assert result["coverage"] == 1.0

    def test_an_extra_source_is_reported_not_failing(self):
        expected = [{"model_id": "m1", "sql": {"tables": ["tushare.daily_basic"]}}]
        sources = [
            source('SELECT * FROM "tushare"."daily_basic"'),
            source('SELECT * FROM "tushare"."index_daily"'),  # extra, unrelated
        ]
        result = match_sources_to_queries(expected, sources)
        assert result["passed"] is True
        assert len(result["extra_sources"]) == 1
        assert result["extra_sources"][0]["source_index"] == 1


class TestOneSourceCoversSeveralQueries:
    """A subquery SQL that answers two expected queries covers both."""

    def test_two_expected_queries_one_source(self):
        expected = [
            {"model_id": "m1", "sql": {"tables": ["tushare.stock_basic"]}},
            {"model_id": "m1", "sql": {"tables": ["tushare.trade_calendar"]}},
        ]
        sources = [
            source(
                "SELECT (SELECT count(*) FROM tushare.stock_basic) AS s, "
                "(SELECT count(*) FROM tushare.trade_calendar) AS c"
            )
        ]
        result = match_sources_to_queries(expected, sources)
        assert result["passed"] is True
        assert result["coverage"] == 1.0
        assert len(result["extra_sources"]) == 0


class TestRawSqlExpectationDefersToTheLlm:
    """An expected query written as raw SQL is not decided structurally — it returns `needs_llm`."""

    def test_a_string_sql_expectation_needs_the_llm(self):
        verdict = judge_query_features(
            {"model_id": "m1", "sql": "SELECT industry, count(*) FROM tushare.stock_basic GROUP BY industry"},
            source("SELECT industry, count(*) AS n FROM tushare.stock_basic GROUP BY industry"),
        )
        assert verdict["needs_llm"] is True
        assert verdict["passed"] is None
        assert verdict["expected_sql"].startswith("SELECT industry")

    def test_pending_llm_is_reported_and_never_a_pass(self):
        expected = [{"model_id": "m1", "sql": "SELECT count(*) FROM tushare.stock_basic"}]
        result = match_sources_to_queries(expected, [source("SELECT count(*) FROM tushare.stock_basic")])
        assert result["passed"] is False  # not until the LLM says so
        assert len(result["pending_llm"]) == 1
        assert len(result["matched"]) == 0
