"""A pipeline command template may ask for `{extraction_args}`, never for the flags themselves.

`{extraction_model_name}` / `{extraction_schema}` render empty whenever the channel has no extraction
config, so a template that spells the flags out hands the CLI `--extraction-schema` with no value and
every document run fails with exit 1 — the shape of a real report:
`--extract-metadata requires --document-id and --extraction-schema`.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.pipeline import (
    DEFAULT_PIPELINE_COMMAND,
    EXTRACTION_FLAG_LITERALS,
    PipelineCreate,
    PipelineUpdate,
)

BASE = "openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input {input}"


@pytest.mark.parametrize("flag", EXTRACTION_FLAG_LITERALS)
def test_a_template_may_not_hardcode_an_extraction_flag(flag):
    with pytest.raises(ValidationError, match="must not hardcode"):
        PipelineCreate(name="p", command=f"{BASE} {flag} {{{{x}}}}")


@pytest.mark.parametrize("flag", EXTRACTION_FLAG_LITERALS)
def test_a_patch_may_not_hardcode_an_extraction_flag(flag):
    with pytest.raises(ValidationError, match="must not hardcode"):
        PipelineUpdate(command=f"{BASE} {flag}")


def test_the_supported_shape_is_accepted():
    PipelineCreate(name="p", command=DEFAULT_PIPELINE_COMMAND)
    PipelineUpdate(command=DEFAULT_PIPELINE_COMMAND)
    PipelineUpdate()  # nothing to check
    PipelineUpdate(command=None)


def test_the_reported_command_is_rejected():
    reported = (
        "openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input {input} "
        "--s3-prefix {s3_prefix} --document-id {document_id} --extract-metadata "
        "--extraction-model-name {extraction_model_name} --extraction-schema {extraction_schema}"
    )
    with pytest.raises(ValidationError):
        PipelineUpdate(command=reported)


def test_the_endpoint_stops_advertising_the_raw_placeholders():
    """They are still rendered for templates that predate `{extraction_args}`, but not offered as the
    way to enable extraction — advertising them is how the broken template got written."""
    from app.jobs.tasks import TEMPLATE_VARIABLES

    assert "extraction_args" in TEMPLATE_VARIABLES
    assert "extraction_model_name" not in TEMPLATE_VARIABLES
    assert "extraction_schema" not in TEMPLATE_VARIABLES
