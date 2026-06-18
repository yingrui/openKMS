"""Stable operation-permission key strings for require_permission and role sync.

Human-facing labels and route patterns live in ``security_permissions`` (PostgreSQL).
Built-in hints (below) help admins create catalog rows whose keys match ``require_permission`` checks.
"""

from __future__ import annotations

from dataclasses import dataclass

# Super-permission: grants every operation check (stored on roles like any other key).
PERM_ALL = "all"

PERM_CONSOLE_ACCESS = "console:access"
PERM_CONSOLE_USERS = "console:users"
PERM_CONSOLE_FEATURE_TOGGLES = "console:feature_toggles"
PERM_CONSOLE_DATA_SOURCES = "console:data_sources"
PERM_CONSOLE_DATASETS = "console:datasets"
PERM_CONSOLE_OBJECT_TYPES = "console:object_types"
PERM_CONSOLE_LINK_TYPES = "console:link_types"
PERM_CONSOLE_SETTINGS = "console:settings"
PERM_CONSOLE_STORAGE = "console:storage"
PERM_CONSOLE_GROUPS = "console:groups"
PERM_CONSOLE_PERMISSIONS = "console:permissions"

PERM_DOCUMENTS_READ = "documents:read"
PERM_DOCUMENTS_WRITE = "documents:write"
PERM_ARTICLES_READ = "articles:read"
PERM_ARTICLES_WRITE = "articles:write"
PERM_MEDIA_READ = "media:read"
PERM_MEDIA_WRITE = "media:write"
PERM_CHANNELS_READ = "channels:read"
PERM_CHANNELS_WRITE = "channels:write"
PERM_KB_READ = "knowledge_bases:read"
PERM_KB_WRITE = "knowledge_bases:write"
PERM_WIKIS_READ = "wikis:read"
PERM_WIKIS_WRITE = "wikis:write"
PERM_EVAL_READ = "evaluation:read"
PERM_EVAL_WRITE = "evaluation:write"
PERM_ONTOLOGY_READ = "ontology:read"
PERM_ONTOLOGY_WRITE = "ontology:write"
PERM_KNOWLEDGE_MAP_READ = "knowledge_map:read"
PERM_KNOWLEDGE_MAP_WRITE = "knowledge_map:write"
PERM_CONNECTORS_READ = "connectors:read"
PERM_CONNECTORS_WRITE = "connectors:write"
PERM_PROJECTS_READ = "projects:read"
PERM_PROJECTS_WRITE = "projects:write"

DEFAULT_MEMBER_PERMISSIONS: frozenset[str] = frozenset({PERM_ALL})

ADMIN_ROLE_NAME = "admin"
MEMBER_ROLE_NAME = "member"


@dataclass(frozen=True, slots=True)
class OperationKeyHint:
    """Canonical operation key with copy for permission-reference / onboarding UI."""

    key: str
    label: str
    description: str
    category: str


# Ordered: must match every PERM_* used in require_permission (except reserved role names).
OPERATION_KEY_HINTS: tuple[OperationKeyHint, ...] = (
    OperationKeyHint(
        PERM_ALL,
        "All operations (full access)",
        "Satisfies every permission check. Use sparingly; prefer granular keys for delegated roles.",
        "core",
    ),
    OperationKeyHint(
        PERM_CONSOLE_ACCESS,
        "Open Console",
        "SPA shell under /console; client also treats any console:* as enough to open Console.",
        "console",
    ),
    OperationKeyHint(
        PERM_CONSOLE_USERS,
        "Manage users",
        "Local user CRUD under /api/admin/users.",
        "console",
    ),
    OperationKeyHint(
        PERM_CONSOLE_FEATURE_TOGGLES,
        "Manage feature toggles",
        "PUT /api/feature-toggles (GET is allowed for any authenticated user).",
        "console",
    ),
    OperationKeyHint(
        PERM_CONSOLE_DATA_SOURCES,
        "Manage data sources",
        "CRUD /api/data-sources and related admin actions.",
        "console",
    ),
    OperationKeyHint(
        PERM_CONSOLE_DATASETS,
        "Manage datasets",
        "Register PostgreSQL tables, CRUD /api/datasets, and dataset sharing (includes from-source table picker).",
        "console",
    ),
    OperationKeyHint(
        PERM_CONSOLE_OBJECT_TYPES,
        "Manage object types",
        "Admin CRUD and indexing on /api/object-types where enforced.",
        "console",
    ),
    OperationKeyHint(
        PERM_CONSOLE_LINK_TYPES,
        "Manage link types",
        "Admin CRUD and indexing on /api/link-types where enforced.",
        "console",
    ),
    OperationKeyHint(
        PERM_CONSOLE_SETTINGS,
        "System settings",
        "Reserved for console settings; wire-up may be partial.",
        "console",
    ),
    OperationKeyHint(
        PERM_CONSOLE_STORAGE,
        "Object storage manager",
        "Browse and move objects in the configured S3/MinIO bucket (metadata only; no download).",
        "console",
    ),
    OperationKeyHint(
        PERM_CONSOLE_GROUPS,
        "Manage access groups and data security",
        "Groups, members, scopes under /api/admin/groups.",
        "console",
    ),
    OperationKeyHint(
        PERM_CONSOLE_PERMISSIONS,
        "Manage roles and permissions",
        "Security roles and permission matrix under /api/admin/security-roles.",
        "console",
    ),
    OperationKeyHint(
        PERM_DOCUMENTS_READ,
        "View documents",
        "Document and channel browsing; data scopes may further limit visibility.",
        "content",
    ),
    OperationKeyHint(
        PERM_DOCUMENTS_WRITE,
        "Create and edit documents",
        "Uploads, edits, parsing; data scopes may apply.",
        "content",
    ),
    OperationKeyHint(
        PERM_ARTICLES_READ,
        "View articles",
        "Article channels, article list and detail, file redirects; data scopes may apply.",
        "content",
    ),
    OperationKeyHint(
        PERM_ARTICLES_WRITE,
        "Create and edit articles",
        "Article CRUD, markdown, attachments, versions; data scopes may apply.",
        "content",
    ),
    OperationKeyHint(
        PERM_MEDIA_READ,
        "View media library",
        "Media channels, asset list and detail, file redirects; data scopes may apply.",
        "content",
    ),
    OperationKeyHint(
        PERM_MEDIA_WRITE,
        "Create and edit media",
        "Upload, edit, delete media assets and manage channel content; data scopes may apply.",
        "content",
    ),
    OperationKeyHint(
        PERM_CHANNELS_READ,
        "View channels",
        "Channel list and documents under channels.",
        "content",
    ),
    OperationKeyHint(
        PERM_CHANNELS_WRITE,
        "Manage channels",
        "Create channels and channel settings.",
        "content",
    ),
    OperationKeyHint(
        PERM_CONNECTORS_READ,
        "View connectors",
        "List connector kinds and configured integrations (read-only).",
        "content",
    ),
    OperationKeyHint(
        PERM_CONNECTORS_WRITE,
        "Manage connectors",
        "Create, update, and delete integrations; set inputs, outputs, extra settings, and encrypted secrets.",
        "content",
    ),
    OperationKeyHint(
        PERM_KB_READ,
        "View knowledge bases",
        "Knowledge base UI and read APIs.",
        "content",
    ),
    OperationKeyHint(
        PERM_KB_WRITE,
        "Manage knowledge bases",
        "Create and edit knowledge bases and related resources.",
        "content",
    ),
    OperationKeyHint(
        PERM_WIKIS_READ,
        "View wiki spaces",
        "Wiki spaces, pages, and file downloads.",
        "content",
    ),
    OperationKeyHint(
        PERM_WIKIS_WRITE,
        "Manage wiki spaces",
        "Create and edit wiki spaces, pages, and uploads.",
        "content",
    ),
    OperationKeyHint(
        PERM_EVAL_READ,
        "View evaluation datasets",
        "Evaluation dataset UI and read APIs.",
        "content",
    ),
    OperationKeyHint(
        PERM_EVAL_WRITE,
        "Manage evaluation datasets",
        "Create datasets, items, and runs.",
        "content",
    ),
    OperationKeyHint(
        PERM_ONTOLOGY_READ,
        "View ontology, objects, links",
        "View datasets (list, rows, metadata), ontology explorer, objects, links, read APIs.",
        "ontology",
    ),
    OperationKeyHint(
        PERM_ONTOLOGY_WRITE,
        "Manage ontology instances",
        "Create/update object instances and relationships where applicable.",
        "ontology",
    ),
    OperationKeyHint(
        PERM_KNOWLEDGE_MAP_READ,
        "View Knowledge Map",
        "Knowledge Map tree, resource links, and home hub read APIs.",
        "content",
    ),
    OperationKeyHint(
        PERM_KNOWLEDGE_MAP_WRITE,
        "Manage Knowledge Map",
        "Create, update, delete map terms (nodes) and attach channels or wiki spaces.",
        "content",
    ),
    OperationKeyHint(
        PERM_PROJECTS_READ,
        "View agents",
        "List projects and skills, read workspace files, and use agent chat.",
        "agents",
    ),
    OperationKeyHint(
        PERM_PROJECTS_WRITE,
        "Manage agents",
        "Create/update projects and skills, upload files, run agent tools, and git operations.",
        "agents",
    ),
)


def list_operation_key_hints() -> list[dict[str, str]]:
    """Serialize hints for GET /api/admin/permission-reference."""
    return [
        {"key": h.key, "label": h.label, "description": h.description, "category": h.category}
        for h in OPERATION_KEY_HINTS
    ]
