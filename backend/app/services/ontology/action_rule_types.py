"""Built-in ontology Action rule types (no Function required)."""

from __future__ import annotations

BUILTIN_OBJECT_RULE_TYPES = frozenset({"object_create", "object_modify", "object_delete"})
FUNCTION_RULE_TYPE = "function"


def is_builtin_object_rule(rule_type: str | None) -> bool:
    return rule_type in BUILTIN_OBJECT_RULE_TYPES


def is_function_rule(rule_type: str | None) -> bool:
    return (rule_type or FUNCTION_RULE_TYPE) == FUNCTION_RULE_TYPE


def normalize_rule_type(rule_type: str | None) -> str:
    rt = (rule_type or FUNCTION_RULE_TYPE).strip()
    if rt in BUILTIN_OBJECT_RULE_TYPES or rt == FUNCTION_RULE_TYPE:
        return rt
    raise ValueError(f"unsupported rule_type: {rule_type}")
