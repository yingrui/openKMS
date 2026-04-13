"""Tests for data resource validation and entity matchers."""

import pytest
from fastapi import HTTPException

from app.models.data_resource import DataResource
from app.models.evaluation_dataset import EvaluationDataset
from app.models.knowledge_base import KnowledgeBase
from app.services.data_resource_policy import (
    KIND_DOCUMENT,
    KIND_EVALUATION_DATASET,
    KIND_KNOWLEDGE_BASE,
    validate_data_resource_payload,
    knowledge_base_matches_resource,
    evaluation_dataset_matches_resource,
)


def test_validate_document_metadata_key_ok():
    validate_data_resource_payload(
        KIND_DOCUMENT,
        {"metadata.tenant": "acme"},
        anchor_channel_id=None,
        anchor_knowledge_base_id=None,
    )


def test_validate_document_rejects_unknown_key():
    with pytest.raises(HTTPException) as ei:
        validate_data_resource_payload(
            KIND_DOCUMENT,
            {"foo": "bar"},
            anchor_channel_id=None,
            anchor_knowledge_base_id=None,
        )
    assert ei.value.status_code == 400


def test_validate_document_requires_some_scope():
    with pytest.raises(HTTPException):
        validate_data_resource_payload(KIND_DOCUMENT, {}, None, None)


def test_validate_kb_requires_selector():
    with pytest.raises(HTTPException):
        validate_data_resource_payload(KIND_KNOWLEDGE_BASE, {}, None, None)


def test_kb_anchor_match():
    kb = KnowledgeBase(id="kb1", name="X", description=None)  # type: ignore[arg-type]
    dr = DataResource(
        id="r1",
        name="r",
        description=None,
        resource_kind=KIND_KNOWLEDGE_BASE,
        attributes={},
        anchor_channel_id=None,
        anchor_knowledge_base_id="kb1",
    )
    assert knowledge_base_matches_resource(kb, dr) is True


def test_kb_name_attr():
    kb = KnowledgeBase(id="kb1", name="Sales", description=None)  # type: ignore[arg-type]
    dr = DataResource(
        id="r1",
        name="r",
        description=None,
        resource_kind=KIND_KNOWLEDGE_BASE,
        attributes={"name": "Sales"},
        anchor_channel_id=None,
        anchor_knowledge_base_id=None,
    )
    assert knowledge_base_matches_resource(kb, dr) is True


def test_eval_dataset_match():
    row = EvaluationDataset(id="e1", name="e", knowledge_base_id="kb", description=None)  # type: ignore[arg-type]
    dr = DataResource(
        id="r1",
        name="r",
        description=None,
        resource_kind=KIND_EVALUATION_DATASET,
        attributes={"evaluation_dataset_id": "e1"},
        anchor_channel_id=None,
        anchor_knowledge_base_id=None,
    )
    assert evaluation_dataset_matches_resource(row, dr) is True
