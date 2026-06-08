"""Tests for Zhipu search response normalization."""

from app.services.connector_search.zhipu import _normalize_zhipu_response

SAMPLE_RAW = {
    "created": 1780888049,
    "id": "20260608110727c10b1846eadc4ab2",
    "request_id": "req-abc",
    "search_intent": [
        {"intent": "SEARCH_ALWAYS", "keywords": "高考 成绩", "query": "高考"}
    ],
    "search_result": [
        {
            "content": "snippet",
            "icon": "",
            "link": "https://example.com/a",
            "media": "Example",
            "publish_date": "2026-06-01",
            "refer": "ref_1",
            "title": "Title A",
        }
    ],
}


def test_normalize_maps_search_result_to_results():
    out = _normalize_zhipu_response(SAMPLE_RAW, "高考")
    assert out["query"] == "高考"
    assert len(out["results"]) == 1
    assert out["results"][0]["title"] == "Title A"
    assert out["results"][0]["refer"] == "ref_1"
    assert out["search_intent"][0]["intent"] == "SEARCH_ALWAYS"
    assert out["provider"]["id"] == "20260608110727c10b1846eadc4ab2"
    assert out["provider"]["created"] == 1780888049
    assert out["provider"]["request_id"] == "req-abc"
