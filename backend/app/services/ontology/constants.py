"""Shared constants for ontology functions runtime."""

from __future__ import annotations

OFS_HTTP_BUFFER_SECONDS = 5
OFS_ERROR_TEXT_LIMIT = 2000

FUNCTION_ID_PREFIX = "fn-"
VERSION_ID_PREFIX = "fnv-"
EXECUTION_ID_PREFIX = "exec-"
ACTION_TYPE_ID_PREFIX = "at-"
ACTION_LOG_ID_PREFIX = "al-"

ID_HEX_LENGTH = 12
EXECUTION_ID_HEX_LENGTH = 16

MAX_FUNCTION_CALL_DEPTH = 5
CALL_DEPTH_HEADER = "X-OpenKMS-Function-Call-Depth"
CALL_STACK_HEADER = "X-OpenKMS-Function-Call-Stack"
