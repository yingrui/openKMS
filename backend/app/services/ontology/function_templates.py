"""Ontology Function templates and static validation."""

from __future__ import annotations

import ast
import re

DEFAULT_FUNCTION_SOURCE = '''"""Ontology Function — edit execute() and Run to preview."""
from openkms_functions import ExecuteContext


def execute(input: dict, ctx: ExecuteContext) -> dict:
    """Return a JSON-serializable dict."""
    return {"ok": True, "message": "Hello from openKMS Function"}
'''

_ALLOWED_TOP_LEVEL_IMPORTS = frozenset({"openkms_functions", "typing", "datetime", "json", "math", "re", "decimal"})


def validate_function_source(source_code: str) -> tuple[bool, list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        tree = ast.parse(source_code)
    except SyntaxError as e:
        return False, [f"Syntax error: {e}"], warnings

    has_execute = False
    for node in tree.body:
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root not in _ALLOWED_TOP_LEVEL_IMPORTS:
                    errors.append(f"Import not allowed: {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                root = node.module.split(".")[0]
                if root not in _ALLOWED_TOP_LEVEL_IMPORTS:
                    errors.append(f"Import not allowed: {node.module}")
        elif isinstance(node, ast.FunctionDef) and node.name == "execute":
            has_execute = True

    if not has_execute:
        errors.append("Missing top-level execute(input, ctx) function")

    if re.search(r"\b(import\s+requests|from\s+requests)", source_code):
        errors.append("Direct HTTP via requests is not allowed; use ctx.ontology")

    return len(errors) == 0, errors, warnings
