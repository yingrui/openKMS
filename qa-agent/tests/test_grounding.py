"""The grounding ratio: which of an answer's numbers a cited result actually contains."""
import pytest

from qa_agent.grounding import normalize_numbers, traceable_numbers

ROWS = [
    {"stock_count": 5251, "industry": "银行", "avg_pe": 5.83},
    {"stock_count": 1203, "industry": "半导体", "avg_pe": 78.41},
]


class TestNormalizeNumbers:
    def test_int_and_float(self):
        assert normalize_numbers(5251) == {5251.0}
        assert normalize_numbers(5.83) == {5.83}

    def test_thousands_separators_and_chinese_scale(self):
        assert normalize_numbers("1,007,340") == {1007340.0}
        assert normalize_numbers("12.3亿") == {1230000000.0}
        assert normalize_numbers("4.5万") == {45000.0}
        assert normalize_numbers("1.2万亿") == {1200000000000.0}

    def test_percent_keeps_the_face_value(self):
        assert normalize_numbers("17.7%") == {17.7}

    def test_rows_and_nested_values(self):
        assert normalize_numbers(ROWS) == {5251.0, 5.83, 1203.0, 78.41}

    def test_bool_is_not_a_number(self):
        assert normalize_numbers(True) == set()


class TestTraceableNumbers:
    def test_a_stated_number_that_came_from_a_row_is_traced(self):
        result = traceable_numbers("一共有 5,251 只股票。", ROWS)
        assert result == {"traceable": 1, "total": 1, "ratio": 1.0, "untraced": []}

    def test_a_stated_number_nobody_returned_is_reported(self):
        result = traceable_numbers("一共有 6,000 只股票。", ROWS)
        assert result["ratio"] == 0.0
        assert result["untraced"] == [6000.0]

    def test_derived_figures_lower_the_ratio_rather_than_failing_it(self):
        # 5,251 traces; 12 (a computed growth rate) does not. The ratio reports both facts.
        result = traceable_numbers("5,251 只股票，同比增长 12%", ROWS)
        assert (result["traceable"], result["total"]) == (1, 2)
        assert result["ratio"] == 0.5

    def test_an_answer_without_numbers_is_not_penalised(self):
        assert traceable_numbers("该行业共有若干只股票。", ROWS)["ratio"] == 1.0

    def test_nothing_cited_and_numbers_stated_is_zero(self):
        result = traceable_numbers("一共有 5,251 只股票。", [])
        assert result["ratio"] == 0.0
        assert result["untraced"] == [5251.0]

    @pytest.mark.parametrize("answer", ["1007340", "1,007,340", "100.734万"])
    def test_the_same_value_written_three_ways_normalises_once(self, answer):
        assert traceable_numbers(answer, [{"n": 1007340}])["ratio"] == 1.0
