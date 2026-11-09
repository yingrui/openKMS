"""Supported polymorphic targets for content comments."""

from __future__ import annotations

COMMENT_RT_ARTICLE = "article"
COMMENT_RT_DOCUMENT = "document"
COMMENT_RT_KNOWLEDGE_BASE = "knowledge_base"
COMMENT_RT_WIKI_SPACE = "wiki_space"
COMMENT_RT_PROJECT = "project"

COMMENT_RESOURCE_TYPES = frozenset(
    {
        COMMENT_RT_ARTICLE,
        COMMENT_RT_DOCUMENT,
        COMMENT_RT_KNOWLEDGE_BASE,
        COMMENT_RT_WIKI_SPACE,
        COMMENT_RT_PROJECT,
    }
)
