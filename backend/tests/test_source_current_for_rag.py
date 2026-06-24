"""Tests for document lifecycle helpers used in KB list/search filters."""
from datetime import datetime, timezone

from app.constants import DocumentLifecycleStatus
from app.models.document import Document
from app.services.documents.document_lifecycle import document_effective_for_rag


def _doc(**kwargs) -> Document:
    return Document(id="d1", channel_id="c1", name="test", **kwargs)


def test_legacy_document_current_for_rag():
    assert document_effective_for_rag(_doc(lifecycle_status=None)) is True


def test_superseded_not_current_for_rag():
    assert document_effective_for_rag(_doc(lifecycle_status=DocumentLifecycleStatus.SUPERSEDED.value)) is False


def test_in_force_within_window():
    now = datetime(2026, 6, 1, tzinfo=timezone.utc)
    assert document_effective_for_rag(
        _doc(
            lifecycle_status=DocumentLifecycleStatus.IN_FORCE.value,
            effective_from=datetime(2026, 1, 1, tzinfo=timezone.utc),
            effective_to=datetime(2026, 12, 31, tzinfo=timezone.utc),
        ),
        at=now,
    ) is True


def test_in_force_after_effective_to():
    now = datetime(2027, 1, 1, tzinfo=timezone.utc)
    assert document_effective_for_rag(
        _doc(
            lifecycle_status=DocumentLifecycleStatus.IN_FORCE.value,
            effective_to=datetime(2026, 12, 31, tzinfo=timezone.utc),
        ),
        at=now,
    ) is False
