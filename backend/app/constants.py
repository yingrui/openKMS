"""Application constants."""

from enum import StrEnum


class DocumentStatus(StrEnum):
    """Document processing lifecycle status."""

    UPLOADED = "uploaded"
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class DocumentLifecycleStatus(StrEnum):
    """Policy / record lifecycle (distinct from processing DocumentStatus)."""

    DRAFT = "draft"
    IN_FORCE = "in_force"
    SUPERSEDED = "superseded"
    WITHDRAWN = "withdrawn"


class DocumentRelationType(StrEnum):
    """Directed edge: source_document -> target_document."""

    SUPERSEDES = "supersedes"
    AMENDS = "amends"
    IMPLEMENTS = "implements"
    SEE_ALSO = "see_also"
