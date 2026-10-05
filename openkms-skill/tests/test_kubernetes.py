"""kubernetes CLI ↔ HTTP smoke tests."""
from __future__ import annotations

import argparse
from pathlib import Path

import pytest


def _ns(**kw):
    defaults = dict(yes=True, dry_run=False)
    defaults.update(kw)
    return argparse.Namespace(**defaults)


def test_kubernetes_clusters_list(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/kubernetes-clusters")] = (200, {"items": [], "total": 0})
    from openkms.commands.kubernetes import cmd_clusters_list

    cmd_clusters_list(_ns(limit=None, offset=None))
    assert recorded[-1].url.path == "/api/kubernetes-clusters"


def test_kubernetes_apply_yes(mock_api, tmp_path: Path):
    recorded, responses = mock_api
    responses[("POST", "/api/kubernetes-clusters/c1/apply")] = (
        200,
        {"items": [{"kind": "Service", "name": "web", "namespace": "default", "action": "created"}]},
    )
    manifest = tmp_path / "svc.yaml"
    manifest.write_text(
        "apiVersion: v1\nkind: Service\nmetadata:\n  name: web\nspec:\n  ports:\n    - port: 80\n",
        encoding="utf-8",
    )
    from openkms.commands.kubernetes import cmd_apply

    cmd_apply(_ns(cluster_id="c1", file=str(manifest), namespace="default"))
    assert recorded[-1].url.path == "/api/kubernetes-clusters/c1/apply"


def test_kubernetes_register_app(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/app-builder/apps")] = (201, {"id": "oa-1", "template_id": "module"})
    from openkms.commands.kubernetes import cmd_register_app

    cmd_register_app(
        _ns(
            cluster_id="c1",
            namespace="default",
            service="web",
            port=80,
            name="Web",
            api_name="webApp",
            path=None,
            description=None,
        )
    )
    assert recorded[-1].url.path == "/api/app-builder/apps"


def test_kubernetes_apply_missing_file():
    from openkms.commands.kubernetes import cmd_apply

    with pytest.raises(SystemExit) as exc:
        cmd_apply(_ns(cluster_id="c1", file="/no/such.yaml", namespace=None))
    assert exc.value.code == 1
