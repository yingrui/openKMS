"""Chamber `apps` CLI ↔ HTTP smoke tests.

The command group had no route tests, so a rename on the backend (`/api/app-builder/apps`
→ `/api/chamber/apps`) only surfaced when someone ran the CLI against a live server.
"""
from __future__ import annotations

import argparse
import json

import pytest


def _ns(**kw):
    defaults = dict(yes=True, dry_run=False)
    defaults.update(kw)
    return argparse.Namespace(**defaults)


def test_apps_list(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/chamber/apps")] = (200, [{"id": "oa-1", "template_id": "module"}])
    from openkms.commands.apps import cmd_list

    cmd_list(_ns())
    assert recorded[-1].method == "GET"
    assert recorded[-1].url.path == "/api/chamber/apps"


def test_apps_get(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/chamber/apps/oa-1")] = (200, {"id": "oa-1"})
    from openkms.commands.apps import cmd_get

    cmd_get(_ns(id="oa-1"))
    assert recorded[-1].url.path == "/api/chamber/apps/oa-1"


def test_apps_create_sends_module_binding(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/chamber/apps")] = (201, {"id": "oa-2", "template_id": "module"})
    from openkms.commands.apps import cmd_create

    cmd_create(
        _ns(
            name="Web",
            api_name="webApp",
            description=None,
            bindings_json='{"k8s":{"cluster_id":"c1","namespace":"ns","service":"web","port":80}}',
        )
    )
    assert recorded[-1].url.path == "/api/chamber/apps"
    body = json.loads(recorded[-1].read())
    assert body["template_id"] == "module"
    assert body["bindings"]["k8s"]["service"] == "web"


def test_apps_patch(mock_api):
    recorded, responses = mock_api
    responses[("PATCH", "/api/chamber/apps/oa-1")] = (200, {"id": "oa-1"})
    from openkms.commands.apps import cmd_patch

    cmd_patch(_ns(id="oa-1", name="Renamed", description=None, bindings_json=None))
    assert recorded[-1].method == "PATCH"
    assert recorded[-1].url.path == "/api/chamber/apps/oa-1"


def test_apps_publish(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/chamber/apps/oa-1/publish")] = (200, {"id": "oa-1"})
    from openkms.commands.apps import cmd_publish

    cmd_publish(_ns(id="oa-1"))
    assert recorded[-1].url.path == "/api/chamber/apps/oa-1/publish"


def test_apps_delete(mock_api):
    recorded, responses = mock_api
    responses[("DELETE", "/api/chamber/apps/oa-1")] = (204, None)
    from openkms.commands.apps import cmd_delete

    cmd_delete(_ns(id="oa-1"))
    assert recorded[-1].method == "DELETE"
    assert recorded[-1].url.path == "/api/chamber/apps/oa-1"


def test_apps_create_rejects_non_object_bindings(mock_api):
    from openkms.commands.apps import cmd_create

    with pytest.raises(SystemExit):
        cmd_create(_ns(name="Web", api_name="webApp", description=None, bindings_json="[]"))
