"""Evidence labelling: every source kept, each marked used or consulted."""
import pytest

from qa_agent.evidence import CONSULTED, USED, ground, label_sources
from qa_agent.schemas import SourceItem


def _query(rows, sql="SELECT 1", model_id="m1") -> SourceItem:
    return SourceItem(
        id="catalog:query:0",
        source_type="semantic_model",
        content="Catalog query · 2 rows",
        score=1.0,
        data_query={"mode": "sql", "model_id": model_id, "sql": sql, "rows": rows, "row_count": len(rows)},
    )


def _chunk() -> SourceItem:
    return SourceItem(id="chunk:1", source_type="document", content="some prose", score=0.7)


class TestLabelling:
    def test_a_source_the_answer_used_is_marked_used(self):
        labels = label_sources([_query([{"n": 1203}])], "半导体行业共有 1203 只股票。")
        assert labels[0].usage == USED
        assert labels[0].traceable_numbers == 1

    def test_a_source_that_merely_ran_is_consulted_and_kept(self):
        labels = label_sources([_query([{"n": 1203}])], "这个模型没有营收数据。")
        assert labels[0].usage == CONSULTED
        assert len(labels) == 1  # kept: the intermediate query is part of the audit trail

    def test_non_catalog_sources_carry_no_label(self):
        # a RAG chunk has no rows to trace to; inventing a label for it would be worse than saying nothing
        labels = label_sources([_chunk()], "随便什么 123")
        assert labels[0].usage is None
        assert labels[0].traceable_numbers is None

    def test_one_used_one_consulted_both_survive(self):
        sources = [_query([{"n": 1203}], sql="A"), _query([{"n": 42}], sql="B")]
        labels = label_sources(sources, "共有 1203 只股票。")
        assert [s.usage for s in labels] == [USED, CONSULTED]
        assert [s.data_query["sql"] for s in labels] == ["A", "B"]

    def test_a_label_does_not_mutate_the_input(self):
        original = _query([{"n": 1203}])
        label_sources([original], "共有 1203 只股票。")
        assert original.usage is None


class TestGrounding:
    def test_numbers_across_several_sources(self):
        sources = [_query([{"n": 1203}]), _query([{"d": 250}])]
        report = ground(sources, "共有 1203 只股票，250 个交易日。")
        assert (report.traceable, report.total, report.ratio) == (2, 2, 1.0)

    def test_an_invented_number_lowers_the_ratio(self):
        report = ground([_query([{"n": 1203}])], "共有 1203 只股票，同比增长 12%。")
        assert report.ratio == 0.5
        assert report.untraced == [12.0]

    def test_an_answer_without_numbers_is_not_penalised(self):
        assert ground([_query([{"n": 1}])], "这个模型没有营收数据。").ratio == 1.0

    def test_no_sources_but_numbers_is_zero(self):
        report = ground([], "共有 1203 只股票。")
        assert report.ratio == 0.0
        assert report.traceable == 0 and report.total == 1
