"""Logic functions — a flow of model calls, executed here rather than in the code sandbox.

The artifact is still a Function: same table, same versions, same publish step, same call surface. Only the body
differs — a `flow_spec` of nodes instead of `source_code` — so Actions, permissions and the SDK client keep working.

P1 executes a **linear chain of `model` nodes**. The other node kinds in `tmp/plan/function-logic.md` (`function`,
`action`, `transform`, `condition`, `loop`) are rejected with a message that says so, rather than half-working.

Three invariants this module is responsible for:

* the model never touches the ontology directly — it gets a prompt and returns data;
* each node has a token and time budget, and exceeding it is a **failure**, not a truncation (a truncated answer
  looks like a real one);
* every node leaves a trace entry — prompt as sent, tokens, duration — because a flow you cannot read is a flow you
  cannot tune.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

import httpx
from pydantic_ai import Agent, PromptedOutput, StructuredDict
from pydantic_ai.exceptions import ModelAPIError, UnexpectedModelBehavior
from pydantic_ai.usage import UsageLimitExceeded, UsageLimits

SUPPORTED_NODE_KINDS = ("model", "action", "transform", "condition", "loop")
SUPPORTED_TOOL_KINDS = ("query_objects", "call_function", "apply_action")
PROMPT_REF = re.compile(r"\{\{\s*([A-Za-z0-9_.]+)\s*\}\}")
DEFAULT_NODE_TIMEOUT_S = 60.0
DEFAULT_NODE_TOKEN_LIMIT = 8192
DEFAULT_TOOL_LIMIT = 5
MAX_TOOL_LIMIT = 25
MAX_TOOLS_PER_NODE = 4
#: A loop is a cost multiplier; this bounds it before anyone discovers the bill.
MAX_LOOP_ITERATIONS = 50
DEFAULT_LOOP_CONCURRENCY = 4
#: A tool-using node may go round the model a few times; more than this is a design problem, not a budget.
MAX_TOOL_STEPS = 4
MAX_TOOL_CALLS = 6

#: Input types a flow can declare. `object` is a JSON object the caller passes; the prompt reads its fields by path.
INPUT_TYPES = ("string", "number", "integer", "boolean", "object")


class FlowError(Exception):
    """A flow that cannot run (bad spec) or that failed while running."""


@dataclass
class FlowOutcome:
    status: str
    output: dict | None
    error: str | None
    duration_ms: int | None
    trace: dict[str, Any] = field(default_factory=dict)


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
        if object_type and input_type != "object":
            errors.append(f"{where}.object_type only applies to an 'object' input")
        if input_type == "object" and not object_type:
            # The run panel needs to know what to offer; a bare JSON blob asks the author to invent a shape.
            errors.append(f"{where}.object_type is required for an 'object' input")
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


def render_template(template: str, variables: dict[str, Any]) -> str:
    """Substitute `{{ dotted.path }}`. A missing path renders as an empty string but is reported separately."""

    def replace(match: re.Match[str]) -> str:
        value = _lookup(variables, match.group(1))
        if value is None:
            return ""
        return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)

    return PROMPT_REF.sub(replace, template)


def missing_references(template: str, variables: dict[str, Any]) -> list[str]:
    return [
        name
        for name in (m.group(1) for m in PROMPT_REF.finditer(template))
        if _lookup(variables, name) is None
    ]


def _lookup(variables: dict[str, Any], path: str) -> Any:
    current: Any = variables
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            return None
    return current


async def _run_loop(
    node: dict,
    *,
    variables: dict[str, Any],
    model_factory: ModelFactory,
    tool_runner: ToolRunner | None,
    schema_resolver: SchemaResolver | None,
    action_schema_resolver: ActionSchemaResolver | None,
    action_planner: ActionPlanner | None,
    node_timeout_s: float,
    node_token_limit: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Run the body once per element. Writes go one at a time so the edit batch keeps the caller's order."""
    element_name = str(node.get("as") or "item")
    items = _loop_items(node, variables)
    body = list(node.get("nodes") or [])
    has_action = any(isinstance(child, dict) and child.get("kind") == "action" for child in body)
    iterations: list[dict[str, Any]] = []

    async def one(index: int, element: Any) -> Any:
        scoped = {**variables, element_name: element, "index": index}
        nested: dict[str, Any] = {"nodes": []}
        result, _ = await _run_nodes(
            body,
            variables=scoped,
            model_factory=model_factory,
            tool_runner=tool_runner,
            schema_resolver=schema_resolver,
            action_schema_resolver=action_schema_resolver,
            action_planner=action_planner,
            node_timeout_s=node_timeout_s,
            node_token_limit=node_token_limit,
            trace=nested,
        )
        iterations.append({"index": index, "ok": True, "output": result, "nodes": nested["nodes"]})
        return result

    if has_action:
        results = [await one(index, element) for index, element in enumerate(items)]
    else:
        limit = int(node.get("concurrency") or DEFAULT_LOOP_CONCURRENCY)
        semaphore = asyncio.Semaphore(limit)

        async def guarded(index: int, element: Any) -> Any:
            async with semaphore:
                return await one(index, element)

        results = list(await asyncio.gather(*(guarded(index, element) for index, element in enumerate(items))))
        iterations.sort(key=lambda row: row["index"])

    edits = [edit for result in results if isinstance(result, dict) for edit in (result.get("edits") or [])]
    values = [result for result in results if not (isinstance(result, dict) and "edits" in result)]
    return ({"edits": edits} if edits else {"items": values}), iterations


def _loop_items(node: dict, variables: dict[str, Any]) -> list:
    """`over` may point at a list or render to one; either way it must be a list and it must be bounded."""
    rendered = render_template(str(node.get("over") or ""), variables)
    try:
        value = json.loads(rendered) if rendered.strip() else []
    except json.JSONDecodeError:
        raise FlowError(f"loop input is not a list: {rendered[:120]}") from None
    if not isinstance(value, list):
        raise FlowError(f"loop input is not a list: {rendered[:120]}")
    if len(value) > MAX_LOOP_ITERATIONS:
        raise FlowError(
            f"loop input has {len(value)} items; at most {MAX_LOOP_ITERATIONS} are allowed"
        )
    return value


def _truthy(rendered: str) -> bool:
    """A branch condition is truthy unless it renders to empty or an obvious no."""
    value = rendered.strip().lower()
    return value not in ("", "false", "0", "no", "null", "none")


def _pick_branch(node: dict, variables: dict[str, Any]) -> dict:
    for branch in node.get("branches") or []:
        if not isinstance(branch, dict):
            continue
        when = str(branch.get("when") or "").strip()
        if not when:
            return branch
        if _truthy(render_template(when, variables)):
            return branch
    raise FlowError("no branch matched and there is no fallback")


async def _run_nodes(
    nodes: list,
    *,
    variables: dict[str, Any],
    model_factory: ModelFactory,
    tool_runner: ToolRunner | None,
    schema_resolver: SchemaResolver | None,
    action_schema_resolver: ActionSchemaResolver | None,
    action_planner: ActionPlanner | None,
    node_timeout_s: float,
    node_token_limit: int,
    trace: dict[str, Any],
) -> tuple[Any, str]:
    """Run a list of nodes in order; returns the last output and its id. Used for the flow and for branch bodies.

    A failing node appends its own entry (with whatever tool calls it made) and raises a `FlowError` naming it, so the
    caller only has to decide what to do with the flow — not how to describe the failure again.
    """
    last_output: Any = None
    last_id = ""
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("id") or "")
        started = time.perf_counter()
        calls: list[dict[str, Any]] = []
        entry: dict[str, Any] = {"id": node_id, "kind": node.get("kind"), "tool_calls": calls}
        try:
            if node.get("kind") == "action":
                rendered_params = {
                    str(key): _render_value(value, variables)
                    for key, value in (node.get("params") or {}).items()
                }
                entry["params"] = rendered_params
                if action_planner is None:
                    raise FlowError("this flow has an action node but nothing can compose edits")
                edits = await action_planner(str(node.get("action_type") or ""), rendered_params)
                output = {"edits": edits}
            elif node.get("kind") == "transform":
                # Deterministic on purpose: no model call, no tokens, no variance.
                output = _render_value(node.get("template") or {}, variables)
            elif node.get("kind") == "loop":
                output, iterations = await _run_loop(
                    node,
                    variables=variables,
                    model_factory=model_factory,
                    tool_runner=tool_runner,
                    schema_resolver=schema_resolver,
                    action_schema_resolver=action_schema_resolver,
                    action_planner=action_planner,
                    node_timeout_s=node_timeout_s,
                    node_token_limit=node_token_limit,
                )
                entry["iterations"] = iterations
            elif node.get("kind") == "condition":
                branch = _pick_branch(node, variables)
                entry["branch"] = branch.get("when") or "(fallback)"
                nested: dict[str, Any] = {"nodes": []}
                output, _nested_id = await _run_nodes(
                    branch.get("nodes") or [],
                    variables=variables,
                    model_factory=model_factory,
                    tool_runner=tool_runner,
                    schema_resolver=schema_resolver,
                    action_schema_resolver=action_schema_resolver,
                    action_planner=action_planner,
                    node_timeout_s=node_timeout_s,
                    node_token_limit=node_token_limit,
                    trace=nested,
                )
                entry["nodes"] = nested["nodes"]
            else:
                prompt = render_template(str(node.get("prompt") or ""), variables)
                entry["prompt_sent"] = prompt
                entry["missing_references"] = missing_references(
                    str(node.get("prompt") or ""), variables
                )
                output, usage = await _run_model_node(
                    node,
                    prompt=prompt,
                    model_factory=model_factory,
                    tool_runner=tool_runner,
                    schema_resolver=schema_resolver,
                    action_schema_resolver=action_schema_resolver,
                    calls=calls,
                    timeout_s=node_timeout_s,
                    token_limit=node_token_limit,
                )
                entry["usage"] = usage
        except FlowError as e:
            entry.update({"ok": False, "error": str(e), "duration_ms": _ms(started)})
            trace["nodes"].append(entry)
            raise FlowError(f"{node_id}: {e}") from e

        entry.update({"ok": True, "output": output, "duration_ms": _ms(started)})
        trace["nodes"].append(entry)
        variables[node_id] = output
        last_output = output
        last_id = node_id
    return last_output, last_id



_INPUT_CHECKS: dict[str, tuple[type, ...]] = {
    "string": (str,),
    "number": (int, float),
    "integer": (int,),
    "boolean": (bool,),
    "object": (dict, list),
}


def _input_errors(inputs: object, payload: dict) -> list[str]:
    """Declared inputs are a contract: missing or mistyped is an error named after the input, not an empty render."""
    if not isinstance(inputs, list):
        return []
    errors: list[str] = []
    for item in inputs:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        if name not in payload:
            errors.append(f"input '{name}' is missing")
            continue
        expected = _INPUT_CHECKS.get(str(item.get("type") or "string"), (str,))
        value = payload[name]
        # bool is an int subclass in Python; `true` is not a number for a caller's purposes.
        if isinstance(value, bool) and expected is not _INPUT_CHECKS["boolean"]:
            errors.append(f"input '{name}' expected {item.get('type')} but got boolean")
        elif not isinstance(value, expected):
            errors.append(f"input '{name}' expected {item.get('type')} but got {type(value).__name__}")
    return errors


WHOLE_REFERENCE = re.compile(r"^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$")


def _render_value(value: Any, variables: dict[str, Any]) -> Any:
    """Params are strings with references, or literals of any JSON type.

    A value that is *only* a reference keeps the referenced value's type: `{"confirm": "{{n1.confirm}}"}` must pass a
    boolean to the action, not the string "true". Mixed text still renders as text.
    """
    if isinstance(value, str):
        whole = WHOLE_REFERENCE.match(value.strip())
        if whole:
            referenced = _lookup(variables, whole.group(1))
            if referenced is not None:
                return referenced
        return render_template(value, variables)
    if isinstance(value, dict):
        return {key: _render_value(item, variables) for key, item in value.items()}
    if isinstance(value, list):
        return [_render_value(item, variables) for item in value]
    return value


def _resolve_output(spec: dict, variables: dict[str, Any], last_node_id: str) -> dict | None:
    """`output` is a single reference; without one, the last node's output is the answer."""
    reference = spec.get("output")
    raw = _lookup(variables, reference.strip("{} ")) if isinstance(reference, str) else None
    if raw is None:
        raw = _lookup(variables, last_node_id)
    if raw is None:
        return None
    return raw if isinstance(raw, dict) else {"result": raw}


ModelFactory = Callable[[str | None], Awaitable[Any]]
#: `(tool, arguments) -> rows`. Injected so tests (and the dry run) do not need a live API; the real one calls
#: openKMS with the caller's token, which is what keeps permissions honest.
ToolRunner = Callable[[dict, dict], Awaitable[Any]]
#: `(action_type_api_name, params) -> edits`. Composes an edit batch; applying it is the Action path's job.
ActionPlanner = Callable[[str, dict], Awaitable[list[dict]]]
#: `(function_api_name) -> input_schema | None`. Lets a `call_function` tool describe its own parameters.
SchemaResolver = Callable[[str], Awaitable[dict | None]]
#: `(action_type_api_name) -> JSON schema of its parameters`. Lets an `apply_action` tool describe itself.
ActionSchemaResolver = Callable[[str], Awaitable[dict | None]]


async def run_flow(
    spec: dict | None,
    input_payload: dict,
    *,
    model_factory: ModelFactory,
    tool_runner: ToolRunner | None = None,
    schema_resolver: SchemaResolver | None = None,
    action_schema_resolver: ActionSchemaResolver | None = None,
    action_planner: ActionPlanner | None = None,
    node_timeout_s: float = DEFAULT_NODE_TIMEOUT_S,
    node_token_limit: int = DEFAULT_NODE_TOKEN_LIMIT,
) -> FlowOutcome:
    """Execute the flow. `model_factory` turns a node's `model_id` into a pydantic-ai model (tests inject a fake)."""
    errors = validate_flow_spec(spec)
    if errors:
        return FlowOutcome(status="error", output=None, error="; ".join(errors), duration_ms=None)

    assert spec is not None  # validate_flow_spec guarantees it
    input_errors = _input_errors(spec.get("inputs"), input_payload)
    if input_errors:
        return FlowOutcome(
            status="error",
            output=None,
            error="; ".join(input_errors),
            duration_ms=None,
            trace={"nodes": [], "inputs": input_payload},
        )

    trace: dict[str, Any] = {"nodes": []}
    variables: dict[str, Any] = {"input": input_payload}
    started = time.perf_counter()
    try:
        _, last_id = await _run_nodes(
            spec["nodes"],
            variables=variables,
            model_factory=model_factory,
            tool_runner=tool_runner,
            schema_resolver=schema_resolver,
            action_schema_resolver=action_schema_resolver,
            action_planner=action_planner,
            node_timeout_s=node_timeout_s,
            node_token_limit=node_token_limit,
            trace=trace,
        )
    except FlowError as e:
        return FlowOutcome(
            status="error", output=None, error=str(e), duration_ms=_ms(started), trace=trace
        )

    output = _resolve_output(spec, variables, last_id)
    trace["output"] = output
    return FlowOutcome(
        status="ok", output=output, error=None, duration_ms=_ms(started), trace=trace
    )



async def _run_model_node(
    node: dict,
    *,
    prompt: str,
    model_factory: ModelFactory,
    tool_runner: ToolRunner | None,
    schema_resolver: SchemaResolver | None,
    action_schema_resolver: ActionSchemaResolver | None,
    calls: list[dict[str, Any]],
    timeout_s: float,
    token_limit: int,
) -> tuple[Any, dict[str, Any]]:
    """One model call. The output schema decides whether we ask for structured data or plain text."""
    schema = node.get("output_schema")
    model = await model_factory(node.get("model_id"))
    output_type: Any = PromptedOutput(StructuredDict(schema)) if isinstance(schema, dict) else str
    system = str(node.get("system") or "").strip()
    tools = await _build_tools(
        node, tool_runner, schema_resolver, action_schema_resolver, calls
    )
    kwargs: dict[str, Any] = {"output_type": output_type}
    if tools:
        kwargs["tools"] = tools
    if system:
        kwargs["system_prompt"] = system
    agent = Agent(model, **kwargs)
    # A node with tools needs a few round trips; without tools one request is the whole budget. Either way a token
    # overrun is caught after the response and reported as a node failure — never as a truncated answer.
    limits = UsageLimits(
        request_limit=MAX_TOOL_STEPS if tools else 1,
        tool_calls_limit=MAX_TOOL_CALLS if tools else None,
        total_tokens_limit=_token_limit(node, token_limit),
    )
    try:
        result = await _with_timeout(agent.run(prompt, usage_limits=limits), timeout_s)
    except TimeoutError as e:
        raise FlowError(f"timed out after {timeout_s:.0f}s") from e
    except UnexpectedModelBehavior as e:
        # The model answered, but not in the shape the schema asked for. That is a failure, not a partial result.
        raise FlowError(f"output did not match output_schema: {e}") from e
    except (ModelAPIError, UsageLimitExceeded, httpx.HTTPError) as e:
        # Provider-side failures (auth, rate limit, connection, budget) belong to this node, not to the caller.
        raise FlowError(str(e) or e.__class__.__name__) from e

    usage = result.usage()
    return result.output, {
        "requests": usage.requests,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "total_tokens": usage.total_tokens,
    }


async def _build_tools(
    node: dict,
    tool_runner: ToolRunner | None,
    schema_resolver: SchemaResolver | None,
    action_schema_resolver: ActionSchemaResolver | None,
    calls: list[dict[str, Any]],
) -> list[Any]:
    """One pydantic-ai tool per configured tool. Every call is recorded, including the rows it returned."""
    from pydantic_ai.tools import Tool

    configured = node.get("tools")
    if not isinstance(configured, list) or not configured or tool_runner is None:
        return []

    tools: list[Any] = []
    for tool in configured:
        if not isinstance(tool, dict):
            continue
        if tool.get("kind") == "apply_action":
            action_type = str(tool.get("action_type") or "").strip()
            parameters = (
                await action_schema_resolver(action_type)
                if action_schema_resolver is not None
                else None
            ) or {"type": "object", "properties": {}, "additionalProperties": True}

            async def apply(
                _action_type: str = action_type, **arguments: Any
            ) -> str:
                started = time.perf_counter()
                entry: dict[str, Any] = {
                    "tool": "apply_action",
                    "action_type": _action_type,
                    "arguments": arguments,
                }
                try:
                    edits = await tool_runner(
                        {"kind": "apply_action", "action_type": _action_type}, arguments
                    )
                except FlowError as e:
                    entry.update({"ok": False, "error": str(e), "duration_ms": _ms(started)})
                    calls.append(entry)
                    raise
                entry.update({"ok": True, "edits": len(edits or []), "duration_ms": _ms(started)})
                calls.append(entry)
                # The edit batch travels out with the flow's output; nothing is written here.
                return json.dumps({"edits": edits}, ensure_ascii=False, default=str)

            tools.append(
                Tool.from_schema(
                    apply,
                    name=f"apply_{action_type}"[:64],
                    description=(
                        str(tool.get("description") or "").strip()
                        or f"Propose the ontology edit that '{action_type}' describes."
                    ),
                    json_schema=parameters,
                )
            )
            continue
        if tool.get("kind") == "call_function":
            function = str(tool.get("function") or "").strip()
            parameters = (
                await schema_resolver(function) if schema_resolver is not None else None
            ) or {"type": "object", "properties": {}, "additionalProperties": True}

            async def call(
                _function: str = function, **arguments: Any
            ) -> str:
                started = time.perf_counter()
                entry: dict[str, Any] = {
                    "tool": "call_function",
                    "function": _function,
                    "arguments": arguments,
                }
                try:
                    output = await tool_runner(
                        {"kind": "call_function", "function": _function}, arguments
                    )
                except FlowError as e:
                    entry.update({"ok": False, "error": str(e), "duration_ms": _ms(started)})
                    calls.append(entry)
                    raise
                entry.update({"ok": True, "duration_ms": _ms(started)})
                calls.append(entry)
                return json.dumps(output, ensure_ascii=False, default=str)

            tools.append(
                Tool.from_schema(
                    call,
                    name=f"call_{function}"[:64],
                    description=(
                        str(tool.get("description") or "").strip()
                        or f"Call the published function '{function}'. Pass its inputs as arguments."
                    ),
                    json_schema=parameters,
                )
            )
            continue
        if tool.get("kind") != "query_objects":
            continue
        object_type = str(tool.get("object_type") or "").strip()
        properties = [str(p) for p in (tool.get("properties") or []) if str(p).strip()]
        limit = int(tool.get("limit") or DEFAULT_TOOL_LIMIT)

        async def run(
            _object_type: str = object_type,
            _properties: list[str] = properties,
            _limit: int = limit,
            **arguments: Any,
        ) -> str:
            started = time.perf_counter()
            entry: dict[str, Any] = {
                "tool": "query_objects",
                "object_type": _object_type,
                "arguments": arguments,
            }
            try:
                rows = await tool_runner(
                    {"kind": "query_objects", "object_type": _object_type,
                     "properties": _properties, "limit": _limit},
                    arguments,
                )
            except FlowError as e:
                entry.update({"ok": False, "error": str(e), "duration_ms": _ms(started)})
                calls.append(entry)
                raise
            # Only the granted properties reach the model: that is both the token budget and the data minimisation.
            trimmed = [
                {key: row[key] for key in _properties if key in row} if _properties else row
                for row in rows
            ]
            entry.update({"ok": True, "rows": len(trimmed), "duration_ms": _ms(started)})
            calls.append(entry)
            return json.dumps(trimmed, ensure_ascii=False, default=str)

        tools.append(
            Tool.from_schema(
                run,
                name=f"query_objects_{object_type}"[:64],
                description=(
                    f"Search up to {limit} '{object_type}' objects. Pass 'search' for a text match, or "
                    f"'filter' as an object of property equalities."
                ),
                json_schema={
                    "type": "object",
                    "properties": {
                        "search": {"type": "string", "description": "Free-text search"},
                        "filter": {
                            "type": "object",
                            "description": "Property equalities, e.g. {\"status\": \"open\"}",
                        },
                    },
                },
            )
        )
    return tools


def _token_limit(node: dict, default: int) -> int:
    raw = node.get("token_limit")
    if isinstance(raw, int) and raw > 0:
        return raw
    return default


async def _with_timeout(coro: Awaitable[Any], timeout_s: float) -> Any:
    import asyncio

    return await asyncio.wait_for(coro, timeout=timeout_s)


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
