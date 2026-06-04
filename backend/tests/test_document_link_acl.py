"""KB / wiki document link checks use channel read on add."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.document_scope import require_document_by_id_read


def test_require_document_by_id_read_denied_when_channel_inaccessible():
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "alice"}
    db = AsyncMock()
    db.get = AsyncMock(return_value=MagicMock(id="doc-1", channel_id="ch-x"))

    async def _run():
        with patch(
            "app.services.document_scope.document_visible_via_channel",
            new_callable=AsyncMock,
            return_value=False,
        ):
            with pytest.raises(HTTPException) as exc:
                await require_document_by_id_read(db, request, "doc-1")
            assert exc.value.status_code == 404

    asyncio.run(_run())
