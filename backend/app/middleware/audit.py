"""Record every mutation, whoever made it — agent, person or script.

Two things make this work for *any* feature rather than one:

- it is **pure ASGI**, wrapping `send`, so it sees the status and the response body of every route without
  a handler participating;
- the **subject** is resolved generically — the path when the id is there (`/api/stories/{id}`), and
  otherwise the `id` of the JSON object the route returned (`POST /api/stories` → the new story). No feature
  is named here, and a new one needs no change: it is `POST /api/whatever` returning `{"id": …}`.

Bodies are buffered only for `application/json` responses under 32 KB. Streams (SSE, downloads) are left
alone, and **request** bodies are never read — they carry secrets.
"""
from __future__ import annotations

import json
from typing import Any

from app.services.audit import MUTATING, NOT_AUDITED, record_audit_event

#: A response larger than this is not an object with an id; stop buffering rather than hold it in memory.
MAX_CAPTURE = 32 * 1024


class AuditMiddleware:
    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if (
            scope.get("type") != "http"
            or scope.get("method") not in MUTATING
            or scope.get("path") in NOT_AUDITED
        ):
            await self.app(scope, receive, send)
            return

        status: int | None = None
        is_json = False
        captured = bytearray()
        overflow = False

        async def send_wrapper(message: dict) -> None:
            nonlocal status, is_json, overflow
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = {k.lower(): v for k, v in message.get("headers", [])}
                is_json = headers.get(b"content-type", b"").startswith(b"application/json")
            elif message["type"] == "http.response.body" and is_json and not overflow:
                chunk = message.get("body", b"")
                if len(captured) + len(chunk) <= MAX_CAPTURE:
                    captured.extend(chunk)
                else:
                    overflow = True
                    captured.clear()
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            await self._record(scope, 500, detail={"error": type(exc).__name__})
            raise  # a crash is in the log and still crashes
        await self._record(scope, status or 500, body=bytes(captured) if is_json else b"")

    @staticmethod
    async def _record(
        scope: dict, status_code: int, *, body: bytes = b"", detail: dict | None = None
    ) -> None:
        state = scope.get("state") or {}
        payload = state.get("openkms_jwt_payload") or {}

        # The subject a route agreed to, if a handler set one; otherwise the id it returned.
        response_id: str | None = None
        response_label: str | None = None
        if body:
            try:
                parsed = json.loads(body)
            except ValueError:
                parsed = None
            if isinstance(parsed, dict):
                if isinstance(parsed.get("id"), str):
                    response_id = parsed["id"]
                # A name is what a reader recognises; the id only says which row.
                # A human label first, a machine name last: "审计验证函数" is what a reader recognises,
                # `audit_probe_fn` is what a grep finds.
                for key in ("display_name", "name", "title", "label", "api_name"):
                    if isinstance(parsed.get(key), str) and parsed[key].strip():
                        response_label = parsed[key].strip()
                        break

        await record_audit_event(
            method=scope["method"],
            path=scope.get("path", ""),
            status_code=status_code,
            actor_sub=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
            actor_name=(
                payload.get("username")
                or payload.get("email")
                or payload.get("preferred_username")
                or None
            ),
            auth_mode=payload.get("auth_mode") if isinstance(payload.get("auth_mode"), str) else None,
            response_id=response_id,
            # A handler that destroys something knows its name; nothing in a 204 does.
            response_label=(state.get("audit_label") if isinstance(state.get("audit_label"), str) else None)
            or response_label,
            detail=detail,
        )
