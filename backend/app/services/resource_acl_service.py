"""Hierarchical resource ACL: resolve effective permissions and list filters.

Implementation is split across acl_*.py modules; import from here for a stable public API.
"""

from __future__ import annotations

from app.services.acl_channel_filters import (
    accessible_article_channel_ids,
    accessible_document_channel_ids,
    readable_article_channel_ids,
    readable_document_channel_ids,
)
from app.services.acl_content_visibility import (
    article_passes_scoped_predicate,
    article_visible_via_channel,
    channel_allowed_for_article_write,
    channel_allowed_for_document_upload,
    document_passes_scoped_predicate,
    document_visible_via_channel,
    instance_visible,
    scoped_article_predicate,
    scoped_document_predicate,
    wiki_page_visible_via_space,
    wiki_page_writable_via_space,
)
from app.services.acl_context import (
    acl_check_required,
    resource_context_chain,
    resource_has_acl_restrictions,
)
from app.services.acl_identity import (
    canonicalize_group_member_subjects,
    list_owner_candidates,
    normalize_owner_grantee_id,
    normalize_user_grantee_id,
    resolve_subject_display,
    subject_aliases,
    user_grant_matches,
    user_group_ids,
)
from app.services.acl_resolve import (
    _authenticated_bits_from_chain,
    _effective_permissions_from_entries,
    check_resource_access,
    effective_permissions,
)
from app.services.acl_resource_filters import (
    accessible_resource_ids,
    effective_article_channel_ids,
    effective_channel_ids,
    effective_channel_ids_with_data_resources,
    effective_dataset_ids,
    effective_evaluation_ids,
    effective_knowledge_base_ids,
    effective_link_type_ids,
    effective_object_type_ids,
    effective_wiki_space_ids,
    readable_resource_ids,
)
from app.services.acl_scope import acl_applies, jwt_is_admin, scope_applies
from app.services.acl_store import bootstrap_owner_acl, list_acl_entries, replace_resource_acl
from app.services.acl_context import _acl_entries_for_resources

__all__ = [
    "_acl_entries_for_resources",
    "_authenticated_bits_from_chain",
    "_effective_permissions_from_entries",
    "accessible_article_channel_ids",
    "accessible_document_channel_ids",
    "accessible_resource_ids",
    "acl_applies",
    "acl_check_required",
    "article_passes_scoped_predicate",
    "article_visible_via_channel",
    "bootstrap_owner_acl",
    "canonicalize_group_member_subjects",
    "channel_allowed_for_article_write",
    "channel_allowed_for_document_upload",
    "check_resource_access",
    "document_passes_scoped_predicate",
    "document_visible_via_channel",
    "effective_article_channel_ids",
    "effective_channel_ids",
    "effective_channel_ids_with_data_resources",
    "effective_dataset_ids",
    "effective_evaluation_ids",
    "effective_knowledge_base_ids",
    "effective_link_type_ids",
    "effective_object_type_ids",
    "effective_permissions",
    "effective_wiki_space_ids",
    "instance_visible",
    "jwt_is_admin",
    "list_acl_entries",
    "list_owner_candidates",
    "normalize_owner_grantee_id",
    "normalize_user_grantee_id",
    "readable_article_channel_ids",
    "readable_document_channel_ids",
    "readable_resource_ids",
    "replace_resource_acl",
    "resolve_subject_display",
    "resource_context_chain",
    "resource_has_acl_restrictions",
    "scoped_article_predicate",
    "scoped_document_predicate",
    "scope_applies",
    "subject_aliases",
    "user_grant_matches",
    "user_group_ids",
    "wiki_page_visible_via_space",
    "wiki_page_writable_via_space",
]
