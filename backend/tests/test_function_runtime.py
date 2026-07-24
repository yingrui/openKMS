"""Tests for OFS runtime HTTP client."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ontology.function_runtime import FunctionExecutionError, execute_in_ofs


def test_execute_in_ofs_ok() -> None:
    async def _run() -> None:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "ok", "output": {"count": 1}}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        with patch("app.services.ontology.function_runtime.httpx.AsyncClient", return_value=mock_client):
            output, err, duration = await execute_in_ofs(
                source_code="pass",
                input_payload={"a": 1},
                api_name="hello",
                version=1,
                entrypoint="execute",
                caller_token="tok",
            )

        assert output == {"count": 1}
        assert err is None
        assert duration >= 0
        body = mock_client.post.call_args.kwargs["json"]
        assert body["entrypoint"] == "execute"
        assert body["call_depth"] == 0

    asyncio.run(_run())


def test_execute_in_ofs_user_error() -> None:
    async def _run() -> None:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "error", "error": "boom"}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        with patch("app.services.ontology.function_runtime.httpx.AsyncClient", return_value=mock_client):
            output, err, _ = await execute_in_ofs(
                source_code="pass",
                input_payload={},
                api_name="hello",
                version=1,
                caller_token="tok",
            )

        assert output is None
        assert err == "boom"

    asyncio.run(_run())


def test_execute_in_ofs_http_error() -> None:
    async def _run() -> None:
        mock_resp = MagicMock()
        mock_resp.status_code = 503
        mock_resp.text = "unavailable"
        mock_resp.json.side_effect = ValueError()

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        with patch("app.services.ontology.function_runtime.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(FunctionExecutionError, match="unavailable"):
                await execute_in_ofs(
                    source_code="pass",
                    input_payload={},
                    api_name="hello",
                    version=1,
                    caller_token="tok",
                )

    asyncio.run(_run())


def test_execute_in_ofs_call_depth_exceeded() -> None:
    async def _run() -> None:
        with pytest.raises(FunctionExecutionError, match="call depth exceeded"):
            await execute_in_ofs(
                source_code="pass",
                input_payload={},
                api_name="hello",
                version=1,
                caller_token="tok",
                call_depth=5,
            )

    asyncio.run(_run())
