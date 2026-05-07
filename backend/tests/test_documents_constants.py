"""Document status / lifecycle / relationship enums (see docs/features/documents.md, data-models)."""

from app.constants import DocumentLifecycleStatus, DocumentRelationType, DocumentStatus


def test_document_processing_status_values():
    """Pipeline states used by the document list and detail badges."""
    assert DocumentStatus.UPLOADED == "uploaded"
    assert DocumentStatus.PENDING == "pending"
    assert DocumentStatus.RUNNING == "running"
    assert DocumentStatus.COMPLETED == "completed"
    assert DocumentStatus.FAILED == "failed"


def test_document_lifecycle_status_values():
    """Policy lifecycle distinct from processing status."""
    assert DocumentLifecycleStatus.DRAFT == "draft"
    assert DocumentLifecycleStatus.IN_FORCE == "in_force"
    assert DocumentLifecycleStatus.SUPERSEDED == "superseded"
    assert DocumentLifecycleStatus.WITHDRAWN == "withdrawn"


def test_document_relation_types_match_api_and_articles():
    """Directed edges for document_relationships and article_relationships."""
    assert DocumentRelationType.SUPERSEDES == "supersedes"
    assert DocumentRelationType.AMENDS == "amends"
    assert DocumentRelationType.IMPLEMENTS == "implements"
    assert DocumentRelationType.SEE_ALSO == "see_also"
