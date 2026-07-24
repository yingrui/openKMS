"""Ontology Function templates and static validation."""

from __future__ import annotations

import ast
import re

DEFAULT_FUNCTION_SOURCE = '''"""Ontology Function — edit and Run to preview."""
from openkms_functions import Client, function


@function
def execute(input: dict, client: Client) -> dict:
    """Return a JSON-serializable dict."""
    return {"ok": True, "message": "Hello from openKMS Function"}
'''

_ALLOWED_TOP_LEVEL_IMPORTS = frozenset({"openkms_functions", "openkms_ontology_sdk", "typing", "datetime", "json", "math", "re", "decimal"})


def _is_function_decorator(dec: ast.expr) -> bool:
    if isinstance(dec, ast.Name) and dec.id == "function":
        return True
    if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Name) and dec.func.id == "function":
        return True
    return False


def _has_function_decorator(node: ast.FunctionDef) -> bool:
    return any(_is_function_decorator(dec) for dec in node.decorator_list)


def _literal_api_name(node: ast.expr) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Attribute) and node.attr == "api_name":
        # client(helloGreeting) style marker from openkms_ontology_sdk
        if isinstance(node.value, ast.Name):
            return None  # resolve via Name below when used as uses=[helloGreeting]
        return None
    if isinstance(node, ast.Name):
        return node.id
    return None


def _uses_from_decorator(dec: ast.expr) -> list[str]:
    """Extract api_name strings from @function(uses=[...]) when statically known."""
    if not isinstance(dec, ast.Call):
        return []
    uses_node: ast.expr | None = None
    for kw in dec.keywords:
        if kw.arg == "uses":
            uses_node = kw.value
            break
    if uses_node is None and len(dec.args) >= 1:
        # @function(api_name) positional — not uses
        return []
    if uses_node is None:
        return []
    if not isinstance(uses_node, (ast.List, ast.Tuple)):
        return []
    names: list[str] = []
    for elt in uses_node.elts:
        if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
            names.append(elt.value)
        elif isinstance(elt, ast.Name):
            names.append(elt.id)
        elif isinstance(elt, ast.Attribute) and isinstance(elt.value, ast.Name) and elt.attr == "api_name":
            names.append(elt.value.id)
    return names


def extract_function_uses(source_code: str, *, entrypoint: str = "execute") -> list[str]:
    """Return declared uses=[] dependencies for the entrypoint (static AST)."""
    try:
        tree = ast.parse(source_code)
    except SyntaxError:
        return []
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef):
            continue
        if node.name != entrypoint and not (entrypoint == "execute" and node.name == "execute"):
            continue
        for dec in node.decorator_list:
            if _is_function_decorator(dec):
                return _uses_from_decorator(dec)
    # Fallback: any @function with uses
    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            for dec in node.decorator_list:
                if _is_function_decorator(dec):
                    found = _uses_from_decorator(dec)
                    if found:
                        return found
    return []


def validate_function_source(source_code: str, *, entrypoint: str = "execute") -> tuple[bool, list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        tree = ast.parse(source_code)
    except SyntaxError as e:
        return False, [f"Syntax error: {e}"], warnings

    decorated: list[str] = []
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
        elif isinstance(node, ast.FunctionDef):
            if _has_function_decorator(node):
                decorated.append(node.name)
            if node.name == "execute":
                has_execute = True
                if not _has_function_decorator(node):
                    warnings.append("Legacy execute() without @function; prefer @function decorator")

    if entrypoint in decorated or (entrypoint == "execute" and has_execute):
        pass
    elif decorated:
        if entrypoint not in decorated:
            errors.append(f"Entrypoint {entrypoint!r} not found; decorated functions: {', '.join(decorated)}")
    elif not has_execute:
        errors.append(f"Missing entrypoint {entrypoint!r} (@function or def execute)")

    if re.search(r"\b(import\s+requests|from\s+requests)", source_code):
        errors.append("Direct HTTP via requests is not allowed; use client from openkms_functions")

    return len(errors) == 0, errors, warnings
