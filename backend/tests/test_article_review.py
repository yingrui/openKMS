"""Tests for article review helpers."""

from __future__ import annotations

from app.services.articles.article_review import (
    ArticleReviewLLMOutput,
    ReviewCriterionScore,
    _build_review_prompt,
    _normalize_criteria,
    _result_from_output,
)


def test_normalize_criteria_falls_back_to_defaults() -> None:
    out = _normalize_criteria(None)
    assert len(out) == 5
    assert out[0]["id"] == "completeness"


def test_result_from_output_maps_labels() -> None:
    normalized = [{"id": "clarity", "label": "Clarity", "description": ""}]
    data = ArticleReviewLLMOutput(
        overall_score=0.82,
        pass_=True,
        summary="Good article.",
        criteria=[ReviewCriterionScore(id="clarity", score=4, notes="Clear prose.")],
        suggestions=["Add references"],
    )
    result = _result_from_output(data, normalized)
    assert result["overall_score"] == 0.82
    assert result["pass"] is True
    assert result["criteria"][0]["label"] == "Clarity"
    assert result["suggestions"] == ["Add references"]


def test_build_review_prompt_includes_criteria_ids() -> None:
    normalized = _normalize_criteria(None)
    prompt = _build_review_prompt(title="Test", markdown="# Hello", normalized=normalized)
    assert "completeness" in prompt
    assert "Article body:" in prompt
