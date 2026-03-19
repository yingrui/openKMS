"""Application constants."""

from enum import StrEnum


class DocumentStatus(StrEnum):
    """Document processing lifecycle status."""

    UPLOADED = "uploaded"
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
