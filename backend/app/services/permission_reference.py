"""Reference data for admins configuring ``security_permissions`` (routes + APIs)."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

# Mirrors frontend/src/App.tsx — use path patterns suitable for permission matrix / Details UI.
FRONTEND_FEATURES: list[dict[str, Any]] = [
    {"path_pattern": "/", "label": "Home", "section": "Main", "note": "Knowledge operations hub when signed in"},
    {
        "path_pattern": "/knowledge-map",
        "label": "Knowledge Map",
        "section": "Main",
        "note": "Feature toggle: taxonomy; permission taxonomy:read/write",
    },
    {
        "path_pattern": "/knowledge-map/*",
        "label": "Knowledge Map subtree",
        "section": "Main",
        "note": "Feature toggle: taxonomy",
    },
    {
        "path_pattern": "/taxonomy",
        "label": "Knowledge Map (legacy URL)",
        "section": "Main",
        "note": "Redirects to /knowledge-map; same toggle and taxonomy:read/write",
    },
    {
        "path_pattern": "/taxonomy/*",
        "label": "Knowledge Map legacy subtree",
        "section": "Main",
        "note": "Redirects to /knowledge-map; feature toggle: taxonomy",
    },
    {"path_pattern": "/profile", "label": "User profile", "section": "Main", "note": None},
    {"path_pattern": "/documents", "label": "Documents index", "section": "Documents", "note": None},
    {"path_pattern": "/documents/*", "label": "Documents subtree (channels, view)", "section": "Documents", "note": "Covers channels, channel settings, document view"},
    {"path_pattern": "/articles", "label": "Articles", "section": "Content", "note": "Feature toggle: articles"},
    {"path_pattern": "/articles/*", "label": "Article detail", "section": "Content", "note": "Feature toggle: articles"},
    {"path_pattern": "/knowledge-bases", "label": "Knowledge bases list", "section": "Content", "note": "Feature toggle: knowledgeBases"},
    {"path_pattern": "/knowledge-bases/*", "label": "Knowledge base detail", "section": "Content", "note": "Feature toggle: knowledgeBases"},
    {"path_pattern": "/wikis", "label": "Wiki spaces list", "section": "Content", "note": "Feature toggle: wikiSpaces"},
    {"path_pattern": "/wikis/*", "label": "Wiki space / pages", "section": "Content", "note": "Feature toggle: wikiSpaces"},
    {"path_pattern": "/evaluation-datasets", "label": "Evaluation datasets", "section": "Content", "note": "Feature toggle: evaluationDatasets"},
    {"path_pattern": "/evaluation-datasets/*", "label": "Evaluation dataset detail", "section": "Content", "note": "Feature toggle: evaluationDatasets"},
    {"path_pattern": "/glossaries", "label": "Glossaries", "section": "Content", "note": None},
    {"path_pattern": "/glossaries/*", "label": "Glossary detail", "section": "Content", "note": None},
    {"path_pattern": "/pipelines", "label": "Pipelines", "section": "Automation", "note": None},
    {"path_pattern": "/jobs", "label": "Jobs", "section": "Automation", "note": None},
    {"path_pattern": "/jobs/*", "label": "Job detail", "section": "Automation", "note": None},
    {"path_pattern": "/models", "label": "Models", "section": "Automation", "note": None},
    {"path_pattern": "/models/*", "label": "Model detail", "section": "Automation", "note": None},
    {"path_pattern": "/ontology", "label": "Ontology overview", "section": "Objects & links", "note": "Feature toggle: objectsAndLinks"},
    {"path_pattern": "/ontology/datasets", "label": "Ontology · Datasets", "section": "Objects & links", "note": "console:datasets or ontology:read/write"},
    {"path_pattern": "/ontology/datasets/*", "label": "Ontology · Dataset detail", "section": "Objects & links", "note": "console:datasets or ontology:read/write"},
    {"path_pattern": "/ontology/object-types", "label": "Ontology · Object types (schema)", "section": "Objects & links", "note": "console:object_types or ontology:write"},
    {"path_pattern": "/ontology/link-types", "label": "Ontology · Link types (schema)", "section": "Objects & links", "note": "console:link_types or ontology:write"},
    {"path_pattern": "/objects", "label": "Objects list", "section": "Objects & links", "note": "Feature toggle: objectsAndLinks"},
    {"path_pattern": "/objects/*", "label": "Object type / instances", "section": "Objects & links", "note": "Feature toggle: objectsAndLinks"},
    {"path_pattern": "/links", "label": "Links list", "section": "Objects & links", "note": "Feature toggle: objectsAndLinks"},
    {"path_pattern": "/links/*", "label": "Link type / instances", "section": "Objects & links", "note": "Feature toggle: objectsAndLinks"},
    {"path_pattern": "/object-explorer", "label": "Object explorer", "section": "Objects & links", "note": "Feature toggle: objectsAndLinks"},
    {"path_pattern": "/login", "label": "Login", "section": "Auth", "note": None},
    {"path_pattern": "/signup", "label": "Signup (local)", "section": "Auth", "note": None},
    {"path_pattern": "/auth/*", "label": "OIDC callback / silent renew", "section": "Auth", "note": None},
    {"path_pattern": "/console", "label": "Console overview", "section": "Console", "note": "Requires a console:* or all permission"},
    {"path_pattern": "/console/*", "label": "Console (all sub-routes)", "section": "Console", "note": "Granular console pages below"},
    {"path_pattern": "/console/permission-management", "label": "Console · Permissions", "section": "Console", "note": "console:permissions"},
    {"path_pattern": "/console/data-security/groups", "label": "Console · Access groups", "section": "Console", "note": "console:groups"},
    {"path_pattern": "/console/data-security/groups/*", "label": "Console · Group data access", "section": "Console", "note": "console:groups"},
    {"path_pattern": "/console/data-security/data-resources", "label": "Console · Data resources", "section": "Console", "note": "console:groups"},
    {"path_pattern": "/console/data-security/data-resources/*", "label": "Console · Data resource detail", "section": "Console", "note": "console:groups"},
    {"path_pattern": "/console/users", "label": "Console · Users", "section": "Console", "note": "console:users"},
    {"path_pattern": "/console/feature-toggles", "label": "Console · Feature toggles", "section": "Console", "note": "console:feature_toggles"},
    {"path_pattern": "/console/data-sources", "label": "Console · Data sources", "section": "Console", "note": "console:data_sources"},
    {"path_pattern": "/console/settings", "label": "Console · Settings", "section": "Console", "note": "console:settings"},
]


def list_frontend_features() -> list[dict[str, Any]]:
    """Stable copy of FRONTEND_FEATURES for API responses."""
    return [dict(x) for x in FRONTEND_FEATURES]


_HTTP_METHODS = frozenset({"get", "post", "put", "patch", "delete", "head", "options"})


def list_api_operations(app: FastAPI) -> list[dict[str, Any]]:
    """Flatten OpenAPI paths into rows for permission pattern hints."""
    schema = app.openapi()
    paths = schema.get("paths") or {}
    out: list[dict[str, Any]] = []
    for path in sorted(paths.keys()):
        item = paths[path] or {}
        if not isinstance(item, dict):
            continue
        for method, op in item.items():
            m = method.lower()
            if m not in _HTTP_METHODS or not isinstance(op, dict):
                continue
            out.append(
                {
                    "method": m.upper(),
                    "path": path,
                    "summary": (op.get("summary") or "").strip(),
                    "tags": list(op.get("tags") or []) if isinstance(op.get("tags"), list) else [],
                }
            )
    return out
