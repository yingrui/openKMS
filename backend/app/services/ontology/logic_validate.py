"""What a flow must satisfy before it can run, and before a version can be saved.

A spec that fails here never reaches a model, which is the point: a broken flow is cheap to reject and expensive to
debug at execution time. The rules are the shape of the blocks — ids, branches, loop bodies, tools, inputs — plus the
output reference, which used to fall back to the last node when it named nothing.
"""

from __future__ import annotations

import re

SUPPORTED_NODE_KINDS = ("model", "action", "transform", "condition", "loop")
SUPPORTED_TOOL_KINDS = ("query_objects", "call_function", "apply_action", "calculator")
MAX_TOOL_LIMIT = 25
MAX_TOOLS_PER_NODE = 4
MAX_LOOP_ITERATIONS = 50
INPUT_TYPES = ("string", "number", "integer", "boolean", "object", "object_set")

def validate_flow_spec(spec: dict | None) -> list[str]:
    """Structural validation. Runs before a version is saved, so a broken flow never becomes callable."""
    if not isinstance(spec, dict):
        return ["flow_spec must be an object"]
    nodes = spec.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return ["flow_spec.nodes must be a non-empty list"]

    errors: list[str] = []
    seen: set[str] = set()
    for index, node in enumerate(nodes):
        where = f"nodes[{index}]"
        if not isinstance(node, dict):
            errors.append(f"{where} must be an object")
            continue
        node_id = str(node.get("id") or "").strip()
        if not node_id:
            errors.append(f"{where}.id is required")
        elif node_id in seen:
            errors.append(f"{where}.id '{node_id}' is duplicated")
        else:
            seen.add(node_id)
        kind = str(node.get("kind") or "")
        if kind not in SUPPORTED_NODE_KINDS:
            errors.append(
                f"{where}.kind '{kind}' is not supported yet (only {', '.join(SUPPORTED_NODE_KINDS)})"
            )
        if kind == "model" and not str(node.get("prompt") or "").strip():
            errors.append(f"{where}.prompt is required")
        if kind == "action":
            if not str(node.get("action_type") or "").strip():
                errors.append(f"{where}.action_type is required")
            params = node.get("params")
            if params is not None and not isinstance(params, dict):
                errors.append(f"{where}.params must be an object")
        if kind == "transform":
            template = node.get("template")
            if not isinstance(template, dict) or not template:
                errors.append(f"{where}.template must be a non-empty object")
        if kind == "condition":
            errors.extend(_validate_branches(node, where, seen))
        if kind == "loop":
            errors.extend(_validate_loop(node, where, seen))
        if kind != "condition":
            errors.extend(_validate_tools(node, where))

    output = spec.get("output")
    if output is not None and not isinstance(output, str):
        errors.append("flow_spec.output must be a reference string such as '{{n1}}'")
    elif isinstance(output, str) and output.strip():
        # A typo here used to fall back to the last node silently: the answer changed source and nothing said so.
        root = output.strip().strip("{} ").split(".")[0]
        if root not in seen:
            errors.append(f"flow_spec.output references '{root}', which is not a node id")

    errors.extend(_validate_inputs(spec.get("inputs")))
    return errors


def _validate_inputs(inputs: object) -> list[str]:
    if inputs is None:
        return []
    if not isinstance(inputs, list):
        return ["flow_spec.inputs must be a list"]
    errors: list[str] = []
    seen: set[str] = set()
    for index, item in enumerate(inputs):
        where = f"inputs[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{where} must be an object")
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            errors.append(f"{where}.name is required")
        elif name in seen:
            errors.append(f"{where}.name '{name}' is duplicated")
        else:
            seen.add(name)
        input_type = str(item.get("type") or "string")
        if input_type not in INPUT_TYPES:
            errors.append(f"{where}.type '{input_type}' is not one of {', '.join(INPUT_TYPES)}")
        object_type = str(item.get("object_type") or "").strip()
        if object_type and input_type not in ("object", "object_set"):
            errors.append(f"{where}.object_type only applies to an 'object' or 'object_set' input")
        if input_type in ("object", "object_set") and not object_type:
            # The run panel needs to know what to offer; a bare JSON blob asks the author to invent a shape.
            errors.append(f"{where}.object_type is required for an '{input_type}' input")
    return errors


def _validate_branches(node: dict, where: str, ids: set[str]) -> list[str]:
    """Branches are ordered: the first `when` that holds wins, and an empty `when` is the else branch.

    Same rule as AIP Logic in shape — every branch must actually do something, and only one branch can be the
    fallback. Nested nodes may be model or action, not another condition (one level, deliberately).
    """
    branches = node.get("branches")
    if not isinstance(branches, list) or not branches:
        return [f"{where}.branches must be a non-empty list"]
    errors: list[str] = []
    else_at: int | None = None
    for index, branch in enumerate(branches):
        at = f"{where}.branches[{index}]"
        if not isinstance(branch, dict):
            errors.append(f"{at} must be an object")
            continue
        when = str(branch.get("when") or "").strip()
        if not when:
            if else_at is not None:
                errors.append(f"{at}: only one branch may omit `when` (the fallback)")
            else_at = index
        nested = branch.get("nodes")
        if not isinstance(nested, list) or not nested:
            errors.append(f"{at}.nodes must be a non-empty list")
            continue
        for node_index, child in enumerate(nested):
            child_at = f"{at}.nodes[{node_index}]"
            if not isinstance(child, dict):
                errors.append(f"{child_at} must be an object")
                continue
            child_id = str(child.get("id") or "").strip()
            if not child_id:
                errors.append(f"{child_at}.id is required")
            elif child_id in ids:
                errors.append(f"{child_at}.id '{child_id}' is duplicated")
            else:
                ids.add(child_id)
            child_kind = str(child.get("kind") or "")
            if child_kind not in ("model", "action"):
                errors.append(f"{child_at}.kind must be 'model' or 'action' (no nested conditions)")
            if child_kind == "model" and not str(child.get("prompt") or "").strip():
                errors.append(f"{child_at}.prompt is required")
            if child_kind == "action" and not str(child.get("action_type") or "").strip():
                errors.append(f"{child_at}.action_type is required")
            if child_kind != "condition":
                errors.extend(_validate_tools(child, child_at))
    if else_at is not None and else_at != len(branches) - 1:
        errors.append(f"{where}.branches: the fallback branch must be last")
    return errors


def _validate_loop(node: dict, where: str, ids: set[str]) -> list[str]:
    """A loop needs a list, an element name, and a body of model/action nodes (no nested loops or conditions)."""
    errors: list[str] = []
    if not str(node.get("over") or "").strip():
        errors.append(f"{where}.over is required (a list, e.g. '{{{{n1.items}}}}')")
    element = str(node.get("as") or "").strip()
    if element and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", element):
        errors.append(f"{where}.as must be an identifier")
    concurrency = node.get("concurrency")
    if concurrency is not None and (
        not isinstance(concurrency, int) or not 1 <= concurrency <= MAX_LOOP_ITERATIONS
    ):
        errors.append(f"{where}.concurrency must be an integer between 1 and {MAX_LOOP_ITERATIONS}")

    body = node.get("nodes")
    if not isinstance(body, list) or not body:
        errors.append(f"{where}.nodes must be a non-empty list")
        return errors
    for index, child in enumerate(body):
        at = f"{where}.nodes[{index}]"
        if not isinstance(child, dict):
            errors.append(f"{at} must be an object")
            continue
        child_id = str(child.get("id") or "").strip()
        if not child_id:
            errors.append(f"{at}.id is required")
        elif child_id in ids:
            errors.append(f"{at}.id '{child_id}' is duplicated")
        else:
            ids.add(child_id)
        child_kind = str(child.get("kind") or "")
        if child_kind not in ("model", "action"):
            errors.append(f"{at}.kind must be 'model' or 'action' (no nested loops or conditions)")
        if child_kind == "model" and not str(child.get("prompt") or "").strip():
            errors.append(f"{at}.prompt is required")
        if child_kind == "action" and not str(child.get("action_type") or "").strip():
            errors.append(f"{at}.action_type is required")
        if child_kind in ("model", "action"):
            errors.extend(_validate_tools(child, at))
    return errors


def _validate_tools(node: dict, where: str) -> list[str]:
    tools = node.get("tools")
    if tools is None:
        return []
    if not isinstance(tools, list):
        return [f"{where}.tools must be a list"]
    if len(tools) > MAX_TOOLS_PER_NODE:
        return [f"{where}.tools allows at most {MAX_TOOLS_PER_NODE} tools"]
    errors: list[str] = []
    # Two tools with the same name cannot both be offered — pydantic-ai refuses at Agent construction, which would
    # surface as an unhandled error instead of a failing node. Catch it where the tools are declared.
    names: dict[str, int] = {}
    for index, tool in enumerate(tools):
        at = f"{where}.tools[{index}]"
        if not isinstance(tool, dict):
            errors.append(f"{at} must be an object")
            continue
        kind = str(tool.get("kind") or "")
        if kind not in SUPPORTED_TOOL_KINDS:
            errors.append(
                f"{at}.kind '{kind}' is not supported yet (only {', '.join(SUPPORTED_TOOL_KINDS)})"
            )
            continue
        target = str(tool.get("object_type") or tool.get("function") or tool.get("action_type") or "")
        tool_name = "calculator" if kind == "calculator" else f"{kind}_{target}"[:64]
        if tool_name in names:
            errors.append(f"{at}: duplicate tool '{tool_name}' (tools {names[tool_name] + 1} and {index + 1})")
        else:
            names[tool_name] = index
        if kind == "query_objects":
            if not str(tool.get("object_type") or "").strip():
                errors.append(f"{at}.object_type is required")
            limit = tool.get("limit")
            if limit is not None and (not isinstance(limit, int) or not 1 <= limit <= MAX_TOOL_LIMIT):
                errors.append(f"{at}.limit must be an integer between 1 and {MAX_TOOL_LIMIT}")
        if kind == "call_function" and not str(tool.get("function") or "").strip():
            errors.append(f"{at}.function is required (the api_name of a published function)")
        if kind == "apply_action" and not str(tool.get("action_type") or "").strip():
            errors.append(f"{at}.action_type is required (the api_name of an Action)")
    return errors
