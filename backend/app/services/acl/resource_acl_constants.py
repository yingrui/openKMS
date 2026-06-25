"""Resource ACL types and permission bits."""

from __future__ import annotations

# Permission bits (combine with bitwise OR)
PERM_READ = 1
PERM_WRITE = 2
PERM_MANAGE = 4

PERM_ALL_DATA = PERM_READ | PERM_WRITE | PERM_MANAGE

# Securable resource kinds (sharing API / admin). Instance types use container ACL only.
RT_DOCUMENT_CHANNEL = "document_channel"
RT_DOCUMENT = "document"  # legacy rows only; not in SECURABLE_RESOURCE_TYPES
RT_ARTICLE_CHANNEL = "article_channel"
RT_ARTICLE = "article"  # legacy rows only
RT_MEDIA_CHANNEL = "media_channel"
RT_MEDIA_ASSET = "media_asset"  # legacy rows only; assets use channel ACL
RT_WIKI_SPACE = "wiki_space"
RT_WIKI_PAGE = "wiki_page"  # legacy rows only; pages use wiki_space ACL
RT_KNOWLEDGE_BASE = "knowledge_base"
RT_EVALUATION = "evaluation"
RT_DATASET = "dataset"
RT_OBJECT_TYPE = "object_type"
RT_LINK_TYPE = "link_type"
RT_GLOSSARY = "glossary"
RT_PROJECT = "project"

SECURABLE_RESOURCE_TYPES = frozenset(
    {
        RT_DOCUMENT_CHANNEL,
        RT_ARTICLE_CHANNEL,
        RT_MEDIA_CHANNEL,
        RT_WIKI_SPACE,
        RT_KNOWLEDGE_BASE,
        RT_EVALUATION,
        RT_DATASET,
        RT_OBJECT_TYPE,
        RT_LINK_TYPE,
        RT_GLOSSARY,
        RT_PROJECT,
    }
)

CONTAINER_TYPES = frozenset({RT_DOCUMENT_CHANNEL, RT_ARTICLE_CHANNEL, RT_MEDIA_CHANNEL, RT_WIKI_SPACE})

GRANTEE_USER = "user"
GRANTEE_GROUP = "group"
GRANTEE_AUTHENTICATED = "authenticated"

GRANTEE_TYPES = frozenset({GRANTEE_USER, GRANTEE_GROUP, GRANTEE_AUTHENTICATED})

def perm_satisfies(have: int, need: int) -> bool:
    if have & PERM_MANAGE:
        return True
    return (have & need) == need


def perm_label(bits: int) -> str:
    parts: list[str] = []
    if bits & PERM_READ:
        parts.append("r")
    if bits & PERM_WRITE:
        parts.append("w")
    if bits & PERM_MANAGE:
        parts.append("m")
    return "".join(parts) or "-"


def parse_perm_string(s: str) -> int:
    s = (s or "").lower()
    bits = 0
    if "r" in s:
        bits |= PERM_READ
    if "w" in s:
        bits |= PERM_WRITE
    if "m" in s:
        bits |= PERM_MANAGE
    return bits
