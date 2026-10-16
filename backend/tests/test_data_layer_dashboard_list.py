"""The dashboards list is a summary: readable reports counted, sources named, never their rows."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.api.dashboards import _summary
from app.services.data_layer.dashboards import SOURCE_DATASET, SOURCE_SEMANTIC_MODEL

NOW = datetime(2026, 10, 16, tzinfo=timezone.utc)


def _dashboard(reports: list[dict] | None) -> SimpleNamespace:
    return SimpleNamespace(
        id="dash1",
        name="估值体检",
        question=None,
        status="ready",
        reports=reports,
        created_by_name="agent",
        created_at=NOW,
        updated_at=NOW,
    )


REPORTS = [
    {"title": "model", "source_kind": SOURCE_SEMANTIC_MODEL, "semantic_model_id": "m1", "rows": [{"v": 1}]},
    {"title": "dataset", "source_kind": SOURCE_DATASET, "dataset_id": "d1", "rows": [{"v": 2}]},
    {"title": "same dataset again", "source_kind": SOURCE_DATASET, "dataset_id": "d1", "rows": [{"v": 3}]},
]


def test_a_list_entry_counts_readable_reports_and_dedupes_sources():
    summary = _summary(_dashboard(REPORTS), None)
    assert summary.report_count == 3
    assert [(s.kind, s.id) for s in summary.sources] == [
        (SOURCE_SEMANTIC_MODEL, "m1"),
        (SOURCE_DATASET, "d1"),
    ]


def test_reports_whose_source_is_out_of_reach_are_not_counted_or_named():
    summary = _summary(_dashboard(REPORTS), readable={"other"})
    # the model report has no per-resource ACL; both dataset reports read a dataset we may not see
    assert summary.report_count == 1
    assert [(s.kind, s.id) for s in summary.sources] == [(SOURCE_SEMANTIC_MODEL, "m1")]


def test_the_summary_carries_no_rows():
    summary = _summary(_dashboard(REPORTS), None)
    assert not hasattr(summary, "reports")
    assert "rows" not in summary.model_dump_json()


def test_an_empty_dashboard_is_listed_with_no_sources():
    summary = _summary(_dashboard(None), None)
    assert summary.report_count == 0 and summary.sources == []
