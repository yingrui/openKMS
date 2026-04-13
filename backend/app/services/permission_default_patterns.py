"""Default frontend/backend pattern lists per permission key (migrations + docs).

Used to seed or repair ``security_permissions`` so strict pattern enforcement
covers the SPA and API surface. Keys must match ``OPERATION_KEY_HINTS``."""

from __future__ import annotations

from app.services.permission_catalog import (
    PERM_ALL,
    PERM_CHANNELS_READ,
    PERM_CHANNELS_WRITE,
    PERM_CONSOLE_ACCESS,
    PERM_CONSOLE_DATASETS,
    PERM_CONSOLE_DATA_SOURCES,
    PERM_CONSOLE_FEATURE_TOGGLES,
    PERM_CONSOLE_GROUPS,
    PERM_CONSOLE_LINK_TYPES,
    PERM_CONSOLE_OBJECT_TYPES,
    PERM_CONSOLE_PERMISSIONS,
    PERM_CONSOLE_SETTINGS,
    PERM_CONSOLE_USERS,
    PERM_DOCUMENTS_READ,
    PERM_DOCUMENTS_WRITE,
    PERM_EVAL_READ,
    PERM_EVAL_WRITE,
    PERM_KB_READ,
    PERM_KB_WRITE,
    PERM_WIKIS_READ,
    PERM_WIKIS_WRITE,
    PERM_ONTOLOGY_READ,
    PERM_ONTOLOGY_WRITE,
)

# (frontend_route_patterns, backend_api_patterns)
DEFAULT_PATTERNS_BY_KEY: dict[str, tuple[list[str], list[str]]] = {
    PERM_ALL: (
        ["/", "/*"],
        ["/*"],
    ),
    PERM_CONSOLE_ACCESS: (
        [
            "/console",
            "/pipelines",
            "/pipelines/*",
            "/jobs",
            "/jobs/*",
            "/models",
            "/models/*",
        ],
        [
            "/api/models/*",
            "/api/pipelines/*",
            "/api/jobs/*",
            "/api/providers/*",
        ],
    ),
    PERM_CONSOLE_USERS: (
        ["/console", "/console/users"],
        ["/api/admin/users/*"],
    ),
    PERM_CONSOLE_FEATURE_TOGGLES: (
        ["/console", "/console/feature-toggles"],
        ["PUT /api/feature-toggles"],
    ),
    PERM_CONSOLE_DATA_SOURCES: (
        ["/console", "/console/data-sources"],
        ["/api/data-sources/*"],
    ),
    PERM_CONSOLE_DATASETS: (
        ["/console", "/ontology/datasets", "/ontology/datasets/*"],
        ["/api/datasets/*"],
    ),
    PERM_CONSOLE_OBJECT_TYPES: (
        ["/console", "/ontology/object-types"],
        [
            "POST /api/object-types",
            "PUT /api/object-types",
            "PUT /api/object-types/*",
            "DELETE /api/object-types/*",
            "POST /api/object-types/index-to-neo4j",
            "POST /api/object-types/*/objects",
            "PUT /api/object-types/*/objects/*",
            "DELETE /api/object-types/*/objects/*",
        ],
    ),
    PERM_CONSOLE_LINK_TYPES: (
        ["/console", "/ontology/link-types"],
        [
            "POST /api/link-types",
            "PUT /api/link-types",
            "PUT /api/link-types/*",
            "DELETE /api/link-types/*",
            "POST /api/link-types/index-to-neo4j",
            "POST /api/link-types/*/links",
            "DELETE /api/link-types/*/links/*",
        ],
    ),
    PERM_CONSOLE_SETTINGS: (
        ["/console", "/console/settings"],
        [],
    ),
    PERM_CONSOLE_GROUPS: (
        [
            "/console",
            "/console/data-security/groups",
            "/console/data-security/groups/*",
            "/console/data-security/data-resources",
            "/console/data-security/data-resources/*",
        ],
        ["/api/admin/groups/*", "/api/admin/data-resources", "/api/admin/data-resources/*"],
    ),
    PERM_CONSOLE_PERMISSIONS: (
        ["/console", "/console/permission-management"],
        [
            "/api/admin/security-roles/*",
            "/api/admin/security-permissions/*",
            "/api/admin/permission-reference",
        ],
    ),
    PERM_DOCUMENTS_READ: (
        ["/documents", "/documents/*"],
        ["GET /api/documents/*", "HEAD /api/documents/*"],
    ),
    PERM_DOCUMENTS_WRITE: (
        ["/documents", "/documents/*"],
        [
            "POST /api/documents/*",
            "PUT /api/documents/*",
            "PATCH /api/documents/*",
            "DELETE /api/documents/*",
        ],
    ),
    PERM_CHANNELS_READ: (
        ["/documents", "/documents/*"],
        ["GET /api/document-channels/*", "HEAD /api/document-channels/*"],
    ),
    PERM_CHANNELS_WRITE: (
        ["/documents", "/documents/*"],
        [
            "POST /api/document-channels",
            "POST /api/document-channels/*",
            "PUT /api/document-channels/*",
            "PATCH /api/document-channels/*",
            "DELETE /api/document-channels/*",
            "POST /api/document-channels/merge",
        ],
    ),
    PERM_KB_READ: (
        ["/knowledge-bases", "/knowledge-bases/*", "/glossaries", "/glossaries/*"],
        ["GET /api/knowledge-bases/*", "HEAD /api/knowledge-bases/*", "GET /api/glossaries/*", "HEAD /api/glossaries/*"],
    ),
    PERM_KB_WRITE: (
        ["/knowledge-bases", "/knowledge-bases/*", "/glossaries", "/glossaries/*"],
        [
            "POST /api/knowledge-bases/*",
            "PUT /api/knowledge-bases/*",
            "PATCH /api/knowledge-bases/*",
            "DELETE /api/knowledge-bases/*",
            "POST /api/glossaries/*",
            "PUT /api/glossaries/*",
            "PATCH /api/glossaries/*",
            "DELETE /api/glossaries/*",
        ],
    ),
    PERM_WIKIS_READ: (
        ["/wikis", "/wikis/*"],
        [
            "GET /api/wiki-spaces",
            "GET /api/wiki-spaces/*",
            "HEAD /api/wiki-spaces",
            "HEAD /api/wiki-spaces/*",
        ],
    ),
    PERM_WIKIS_WRITE: (
        ["/wikis", "/wikis/*"],
        [
            "POST /api/wiki-spaces",
            "POST /api/wiki-spaces/*",
            "PUT /api/wiki-spaces/*",
            "PATCH /api/wiki-spaces/*",
            "DELETE /api/wiki-spaces/*",
        ],
    ),
    PERM_EVAL_READ: (
        ["/evaluation-datasets", "/evaluation-datasets/*"],
        ["GET /api/evaluation-datasets/*", "HEAD /api/evaluation-datasets/*"],
    ),
    PERM_EVAL_WRITE: (
        ["/evaluation-datasets", "/evaluation-datasets/*"],
        [
            "POST /api/evaluation-datasets/*",
            "PUT /api/evaluation-datasets/*",
            "PATCH /api/evaluation-datasets/*",
            "DELETE /api/evaluation-datasets/*",
        ],
    ),
    PERM_ONTOLOGY_READ: (
        [
            "/ontology",
            "/ontology/datasets",
            "/ontology/datasets/*",
            "/ontology/object-types",
            "/ontology/link-types",
            "/objects",
            "/objects/*",
            "/links",
            "/links/*",
            "/object-explorer",
        ],
        [
            "GET /api/object-types/*",
            "HEAD /api/object-types/*",
            "GET /api/link-types/*",
            "HEAD /api/link-types/*",
            "GET /api/datasets",
            "GET /api/datasets/*",
            "HEAD /api/datasets/*",
            "GET /api/ontology/*",
            "HEAD /api/ontology/*",
            "POST /api/ontology/explore",
        ],
    ),
    PERM_ONTOLOGY_WRITE: (
        [
            "/ontology",
            "/ontology/datasets",
            "/ontology/datasets/*",
            "/ontology/object-types",
            "/ontology/link-types",
            "/objects",
            "/objects/*",
            "/links",
            "/links/*",
            "/object-explorer",
        ],
        [
            "POST /api/datasets",
            "PUT /api/datasets/*",
            "DELETE /api/datasets/*",
            "POST /api/object-types",
            "PUT /api/object-types",
            "PUT /api/object-types/*",
            "DELETE /api/object-types/*",
            "POST /api/object-types/index-to-neo4j",
            "POST /api/object-types/*/objects",
            "PUT /api/object-types/*/objects/*",
            "DELETE /api/object-types/*/objects/*",
            "POST /api/link-types",
            "PUT /api/link-types",
            "PUT /api/link-types/*",
            "DELETE /api/link-types/*",
            "POST /api/link-types/index-to-neo4j",
            "POST /api/link-types/*/links",
            "DELETE /api/link-types/*/links/*",
        ],
    ),
}


def default_patterns_for_key(key: str) -> tuple[list[str], list[str]]:
    if key in DEFAULT_PATTERNS_BY_KEY:
        fe, be = DEFAULT_PATTERNS_BY_KEY[key]
        return list(fe), list(be)
    return [], []
