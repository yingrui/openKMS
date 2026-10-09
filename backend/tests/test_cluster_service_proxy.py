import httpx
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api import auth
from app.services.kubernetes import cluster_service_proxy as proxy
from app.services.kubernetes.cluster_service_proxy import join_proxy_path, service_proxy_resource_path


def test_service_proxy_resource_path():
    assert service_proxy_resource_path("ns", "web", 8080, "") == (
        "/api/v1/namespaces/ns/services/web:8080/proxy/"
    )
    assert service_proxy_resource_path("ns", "web", 8080, "/index.html") == (
        "/api/v1/namespaces/ns/services/web:8080/proxy/index.html"
    )


def test_join_proxy_path():
    assert join_proxy_path("/app", "assets/x.js") == "app/assets/x.js"
    assert join_proxy_path(None, "x") == "x"
    assert join_proxy_path("/app", "") == "app"


def _request(headers: dict[str, str], session: dict) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/app-builder/apps/a/proxy/",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "session": session,
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_session_only_auth_ignores_hosted_app_bearer(monkeypatch):
    monkeypatch.setattr(auth, "_verify_token_for_mode", lambda token: {"sub": "u1", "tok": token})
    req = _request({"Authorization": "Bearer app-token"}, {"access_token": "openkms-session"})
    token = await auth.authenticate_request(req, db=None, session_only=True)
    assert token == "openkms-session"


@pytest.mark.asyncio
async def test_session_only_auth_requires_session(monkeypatch):
    monkeypatch.setattr(auth, "_verify_token_for_mode", lambda token: {"sub": "u1"})
    req = _request({"Authorization": "Bearer app-token"}, {})
    with pytest.raises(HTTPException) as exc:
        await auth.authenticate_request(req, db=None, session_only=True)
    assert exc.value.status_code == 401


def test_service_direct_base_url():
    assert (
        proxy.service_direct_base_url("stock", "frontend", 3200)
        == "http://frontend.stock.svc.cluster.local:3200"
    )


@pytest.mark.parametrize("service", ["evil.com#", "a/b", "Frontend", ""])
def test_service_direct_base_url_rejects_unsafe_names(service):
    with pytest.raises(ValueError):
        proxy.service_direct_base_url("stock", service, 3200)


def test_identity_headers_percent_encode_and_admin_flag():
    out = proxy.identity_headers(
        {
            "sub": "u-1",
            "preferred_username": "yingrui",
            "name": "应睿",
            "email": "a@b.c",
            "realm_access": {"roles": ["admin"]},
        }
    )
    assert out == {
        "X-Openkms-User-Id": "u-1",
        "X-Openkms-Username": "yingrui",
        "X-Openkms-User-Name": "%E5%BA%94%E7%9D%BF",
        "X-Openkms-User-Email": "a%40b.c",
        "X-Openkms-User-Admin": "true",
    }
    assert proxy.identity_headers({"sub": "u-2"}) == {
        "X-Openkms-User-Id": "u-2",
        "X-Openkms-User-Admin": "false",
    }


def test_direct_request_headers_drops_credentials_and_spoofed_identity():
    out = proxy.direct_request_headers(
        [
            ("Authorization", "Bearer openkms-or-stale"),
            ("Cookie", "session=openkms"),
            ("X-Openkms-User-Id", "attacker"),
            ("Host", "localhost:5173"),
            ("Content-Type", "application/json"),
            ("Content-Length", "12"),
            ("Accept", "application/json"),
        ],
        {"X-Openkms-User-Id": "u-1"},
    )
    assert out == {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Openkms-User-Id": "u-1",
    }


@pytest.mark.asyncio
async def test_proxy_service_direct_forwards_raw_body_and_identity(monkeypatch):
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["cookie"] = request.headers.get("cookie")
        seen["user"] = request.headers.get("x-openkms-user-id")
        seen["body"] = request.content
        return httpx.Response(200, json={"ok": True}, headers={"Set-Cookie": "x=1"})

    real_client = httpx.AsyncClient

    def fake_client(**kwargs):
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(proxy.httpx, "AsyncClient", fake_client)
    status, headers, payload = await proxy.proxy_service_direct_async(
        "http://frontend.stock.svc.cluster.local:3200",
        method="POST",
        extra_path="api/portfolios",
        query=[("next", "/")],
        body=b'{"name":"p1"}',
        headers=[
            ("Authorization", "Bearer stale"),
            ("Cookie", "session=openkms"),
            ("X-Openkms-User-Id", "attacker"),
            ("Content-Type", "application/json"),
        ],
        identity={"X-Openkms-User-Id": "u-1"},
    )
    assert status == 200
    assert payload == b'{"ok":true}'
    assert "set-cookie" not in {k.lower() for k in headers}
    assert seen["url"] == "http://frontend.stock.svc.cluster.local:3200/api/portfolios?next=%2F"
    assert seen["auth"] is None
    assert seen["cookie"] is None
    assert seen["user"] == "u-1"
    assert seen["body"] == b'{"name":"p1"}'
