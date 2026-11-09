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
#: Browsing a big table must not pay for an exact row count: past this many rows an unfiltered
#: page reports the planner's estimate, and a filtered one counts under this shorter leash.
EXACT_COUNT_MAX_ROWS = 200_000
COUNT_TIMEOUT_MS = 3_000

#: Column names that make a file sliceable by date. One list: the upload path, the read path and the API's note about a
#: version all have to agree on what "the date column" means, and a second copy is how they drift.
DATE_COLUMN_CANDIDATES = ("trade_date", "date", "dt", "as_of_date", "asof", "timestamp")
