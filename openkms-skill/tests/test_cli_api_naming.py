"""A CLI group is named after the route it wraps.

`kb` wrapped `/api/knowledge-bases`, `apps` wrapped `/api/chamber`, and `rules` wrapped
`/api/metric-rules` — groups whose names could not be guessed from the API they call. The cost is paid by
whoever reads the CLI help and then has to search for the route, and by whoever reads the route and cannot
guess the command. The same reasoning moved two sub-resources under their parent: FAQs are
`knowledge-bases faqs`, runs are `evaluations runs`, because that is where the routes put them.

So the mapping is written down here: every top-level group declares the route prefix it speaks to, and the
module that implements it must contain that prefix. A rename on either side fails, and a new group cannot be
added without answering the question.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMMANDS = ROOT / "scripts" / "openkms" / "commands"

#: group → the `/api/…` prefix its commands call.
NAMED_AFTER_ROUTE: dict[str, str] = {
    "article-channels": "article-channels",
    "articles": "articles",
    "chamber": "chamber",
    "comments": "comments",
    "connectors": "connectors",
    "data-sources": "data-sources",
    "datasets": "datasets",
    "document-channels": "document-channels",
    "documents": "documents",
    "evaluations": "evaluations",
    "glossaries": "glossaries",
    "jobs": "jobs",
    "knowledge-bases": "knowledge-bases",
    "knowledge-map": "knowledge-map",
    "kubernetes": "kubernetes-clusters",
    "media": "media",
    "media-channels": "media-channels",
    "metric-events": "metric-events",
    "metric-rules": "metric-rules",
    "metrics": "metrics",
    "ontology": "ontology",
    "pipelines": "pipelines",
    "search": "search",
    "semantic-models": "semantic-models",
    "stories": "stories",
    "wiki": "wiki-spaces",
    "wiki-spaces": "wiki-spaces",
    "workforce": "workforce",
}

#: Groups that are not a resource with its own prefix, and why.
DELIBERATELY_NOT_A_ROUTE: dict[str, str] = {
    "api": "reads /openapi.json — the route table itself",
    "audit": "/api/console/audit-events — the console's log, reached through `console`",
    "ping": "/api/auth/me — an identity smoke test, not a resource list",
}

#: group → module file holding its commands.
MODULE: dict[str, str] = {
    "chamber": "apps.py",
    "evaluations": "evaluation.py",
    "knowledge-bases": "kb.py",
    "kubernetes": "kubernetes.py",
    "media-channels": "media.py",
    "metric-events": "rules.py",
    "metric-rules": "rules.py",
    "wiki": "wiki.py",
}


def registered_groups() -> list[str]:
    sys.path.insert(0, str(ROOT / "scripts"))
    from openkms.commands import register

    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd")
    register(sub)
    return sorted(sub.choices)


def module_for(group: str) -> Path:
    return COMMANDS / MODULE.get(group, group.replace("-", "_") + ".py")


def test_every_group_is_either_a_route_name_or_explained():
    groups = registered_groups()
    unexplained = [g for g in groups if g not in NAMED_AFTER_ROUTE and g not in DELIBERATELY_NOT_A_ROUTE]
    assert not unexplained, (
        "these CLI groups name neither an /api prefix nor a reason: "
        f"{unexplained} — add them to NAMED_AFTER_ROUTE or DELIBERATELY_NOT_A_ROUTE"
    )
    stale = [g for g in NAMED_AFTER_ROUTE if g not in groups]
    assert not stale, f"mapping names groups that no longer exist: {stale}"


def test_a_route_named_group_actually_calls_that_route():
    """The name is a promise: the module must contain the prefix it claims."""
    missing: list[str] = []
    for group, prefix in NAMED_AFTER_ROUTE.items():
        module = module_for(group)
        assert module.exists(), f"{group} → {module.name} does not exist"
        if f'/api/{prefix}' not in module.read_text():
            missing.append(f"{group} → /api/{prefix} (not in {module.name})")
    assert not missing, f"a group's name does not match the route it calls: {missing}"


def test_abbreviated_names_are_gone():
    """`kb`, `kb-faq` and `apps` were the three names that could not be guessed from the API."""
    retired = {
        "kb": "knowledge-bases",
        "kb-faq": "knowledge-bases faqs",
        "apps": "chamber",
        "evaluation-runs": "evaluations runs",
    }
    groups = set(registered_groups())
    back = sorted(name for name in retired if name in groups)
    assert not back, f"retired group names came back: {back} — use {[retired[n] for n in back]}"
