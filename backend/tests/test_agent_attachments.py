"""Tests for agent session image attachments (multimodal turns)."""

import base64
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.services.agent import attachments as att

_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def test_attachment_key_is_scoped_to_conversation() -> None:
    key = att.attachment_key("conv-1", "att_0123456789ab", "image/png")
    assert key == "agent-attachments/conv-1/att_0123456789ab.png"


@pytest.mark.parametrize("attachment_id,mime", [("bad", "image/png"), ("att_0123456789ab", "application/pdf")])
def test_attachment_key_rejects_invalid_refs(attachment_id: str, mime: str) -> None:
    with pytest.raises(ValueError):
        att.attachment_key("conv-1", attachment_id, mime)


def test_check_attachment_size_allows_unknown_and_in_range() -> None:
    att.check_attachment_size(None)
    att.check_attachment_size(att.MAX_ATTACHMENT_BYTES)


def test_check_attachment_size_rejects_oversized() -> None:
    with pytest.raises(HTTPException) as err:
        att.check_attachment_size(att.MAX_ATTACHMENT_BYTES + 1)
    assert err.value.status_code == 400


@patch("app.services.agent.attachments.upload_object")
def test_save_attachment_uploads_and_returns_descriptor(upload) -> None:
    saved = att.save_attachment("conv-1", filename="shot.PNG", content_type=None, body=_PNG)
    assert saved["mime"] == "image/png"  # resolved from the extension when content type is absent
    assert saved["name"] == "shot.PNG"
    assert saved["size"] == len(_PNG)
    upload.assert_called_once_with(att.attachment_key("conv-1", saved["id"], "image/png"), _PNG, content_type="image/png")


@patch("app.services.agent.attachments.upload_object")
def test_save_attachment_rejects_non_image(upload) -> None:
    with pytest.raises(HTTPException) as err:
        att.save_attachment("conv-1", filename="notes.txt", content_type="text/plain", body=b"hi")
    assert err.value.status_code == 400
    upload.assert_not_called()


@patch("app.services.agent.attachments.object_exists", return_value=True)
def test_normalize_attachment_refs_requires_existing_object(_exists) -> None:
    refs = att.normalize_attachment_refs(
        [{"id": "att_0123456789ab", "name": "a.png", "mime": "image/png", "size": 3, "url": "ignored"}],
        conversation_id="conv-1",
    )
    assert refs == [{"id": "att_0123456789ab", "name": "a.png", "mime": "image/png", "size": 3}]


@patch("app.services.agent.attachments.object_exists", return_value=False)
def test_normalize_attachment_refs_rejects_missing_object(_exists) -> None:
    with pytest.raises(HTTPException) as err:
        att.normalize_attachment_refs(
            [{"id": "att_0123456789ab", "mime": "image/png"}], conversation_id="conv-1"
        )
    assert err.value.status_code == 400


@patch("app.services.agent.attachments.get_object", return_value=_PNG)
def test_human_content_builds_text_plus_image_blocks(_get) -> None:
    blocks = att.human_content_with_attachments(
        "conv-1", "what is this?", [{"id": "att_0123456789ab", "mime": "image/png"}]
    )
    assert [b["type"] for b in blocks] == ["text", "image_url"]
    assert blocks[0]["text"] == "what is this?"
    assert blocks[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_human_content_falls_back_to_text_without_attachments() -> None:
    assert att.human_content_with_attachments("conv-1", "hello", None) == "hello"
    assert att.human_content_with_attachments("conv-1", "hello", []) == "hello"


@patch("app.services.agent.attachments.get_object", side_effect=RuntimeError("gone"))
def test_human_content_skips_unreadable_image(_get) -> None:
    assert (
        att.human_content_with_attachments(
            "conv-1", "still works", [{"id": "att_0123456789ab", "mime": "image/png"}]
        )
        == "still works"
    )
