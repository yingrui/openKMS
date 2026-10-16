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

# One page-size convention for list endpoints, and the timeout for browsing a table's rows
# (a read that hangs is worse than one that fails). Both are enforced server-side, not just asked
# for by the API schema.
DEFAULT_PAGE_SIZE = 100
MAX_PAGE_SIZE = 500
ROWS_TIMEOUT_MS = 10_000
