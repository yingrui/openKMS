"""Auth header is sent on every request; ping works end-to-end against the mock."""
from __future__ import annotations

import argparse


def test_ping_sends_auth_header(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/auth/me")] = (200, {"id": "u1", "username": "alice"})

    from openkms.commands.ping import cmd_ping
    cmd_ping(argparse.Namespace())

    req = recorded[-1]
    assert req.method == "GET"
    assert req.url.path == "/api/auth/me"
    assert req.headers["Authorization"] == "Bearer okms.test.secret"
