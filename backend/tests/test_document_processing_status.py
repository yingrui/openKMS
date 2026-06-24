"""Document processing status derived from procrastinate job rows."""

from __future__ import annotations

import pytest

from app.constants import DocumentStatus
from app.services.documents.document_processing_status import derive_document_processing_status


@pytest.mark.parametrize(
    ("current", "job_statuses", "expected"),
    [
        (DocumentStatus.RUNNING, ["failed"], DocumentStatus.FAILED),
        (DocumentStatus.PENDING, ["failed"], DocumentStatus.FAILED),
        (DocumentStatus.RUNNING, ["failed", "todo"], DocumentStatus.PENDING),
        (DocumentStatus.RUNNING, ["failed", "doing"], None),
        (DocumentStatus.RUNNING, ["failed", "succeeded"], DocumentStatus.COMPLETED),
        (DocumentStatus.FAILED, ["failed", "succeeded"], DocumentStatus.COMPLETED),
        (DocumentStatus.COMPLETED, ["failed"], None),
        (DocumentStatus.COMPLETED, ["failed", "succeeded"], None),
        (DocumentStatus.UPLOADED, [], None),
        (DocumentStatus.UPLOADED, ["todo"], DocumentStatus.PENDING),
        (DocumentStatus.UPLOADED, ["doing"], DocumentStatus.RUNNING),
        (DocumentStatus.PENDING, ["failed", "failed"], DocumentStatus.FAILED),
        (DocumentStatus.RUNNING, ["cancelled"], DocumentStatus.FAILED),
    ],
)
def test_derive_document_processing_status(current, job_statuses, expected):
    assert derive_document_processing_status(current, job_statuses) == expected
