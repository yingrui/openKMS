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

from app.services.ontology.logic_validate import MAX_LOOP_ITERATIONS, validate_flow_spec

PROMPT_REF = re.compile(r"\{\{\s*([A-Za-z0-9_.]+)\s*\}\}")
DEFAULT_NODE_TIMEOUT_S = 60.0
DEFAULT_NODE_TOKEN_LIMIT = 8192
DEFAULT_TOOL_LIMIT = 5
MAX_TOOLS_PER_NODE = 4
DEFAULT_LOOP_CONCURRENCY = 4
#: A tool-using node may go round the model a few times; more than this is a design problem, not a budget.
MAX_TOOL_STEPS = 4
MAX_TOOL_CALLS = 6




class FlowError(Exception):
    """A flow that cannot run (bad spec) or that failed while running."""


@dataclass
class FlowOutcome:
    status: str
    output: dict | None
    error: str | None
    duration_ms: int | None
    trace: dict[str, Any] = field(default_factory=dict)


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
) -> tuple[dict[str, Any], list[dict[str, Any]], str | None]:
    """Run the body once per element; returns (output, iterations, first error).

    Writes go one at a time so the edit batch keeps the caller's order. Failures are collected rather than
    propagated mid-flight: the other iterations are already running, and their work has to be accounted for.
    """
    element_name = str(node.get("as") or "item")
    items = _loop_items(node, variables)
    body = list(node.get("nodes") or [])
    has_action = any(isinstance(child, dict) and child.get("kind") == "action" for child in body)
    iterations: list[dict[str, Any]] = []

    failures: list[str] = []

    async def one(index: int, element: Any) -> Any:
        scoped = {**variables, element_name: element, "index": index}
        nested: dict[str, Any] = {"nodes": []}
        try:
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
        except FlowError as e:
            # One element failing does not cancel the others: they are already running, and stopping them midway
            # would leave their work (and tokens) unaccounted for. Record it and let the loop settle.
            iterations.append({"index": index, "ok": False, "error": str(e), "nodes": nested["nodes"]})
            failures.append(f"iteration {index}: {e}")
            return None
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

        # `gather` without `return_exceptions` would raise on the first failure and leave the other iterations
        # running after this loop has already reported an error.
        await asyncio.gather(
            *(guarded(index, element) for index, element in enumerate(items)),
            return_exceptions=True,
        )
        results = [row.get("output") for row in sorted(iterations, key=lambda r: r["index"]) if row["ok"]]

    iterations.sort(key=lambda row: row["index"])
    edits = [edit for result in results if isinstance(result, dict) for edit in (result.get("edits") or [])]
    values = [result for result in results if not (isinstance(result, dict) and "edits" in result)]
    error = failures[0] if failures else None
    return ({"edits": edits} if edits else {"items": values}), iterations, error


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
                output, iterations, loop_error = await _run_loop(
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
                # Recorded before the raise, so a failed loop still shows what the other iterations did.
                entry["iterations"] = iterations
                if loop_error:
                    raise FlowError(loop_error)
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


def _traced_tool(
    name: str,
    calls: list[dict[str, Any]],
    body: Callable[[dict[str, Any]], Awaitable[Any]],
    *,
    summary: Callable[[Any], dict[str, Any]] | None = None,
    extra: dict[str, Any] | None = None,
    soft_error: bool = False,
) -> Callable[..., Awaitable[str]]:
    """Wrap a tool body so every call is timed, traced and reported to the model in one shape.

    Four tools used to spell this out each: start the clock, build the entry, catch `FlowError`, append, return JSON.
    The differences between them are what `body` and `summary` are for.
    """

    async def run(**arguments: Any) -> str:
        started = time.perf_counter()
        entry: dict[str, Any] = {"tool": name, "arguments": arguments, **(extra or {})}
        try:
            result = await body(arguments)
        except FlowError as e:
            entry.update({"ok": False, "error": str(e), "duration_ms": _ms(started)})
            calls.append(entry)
            if soft_error:
                # The model's own mistake (a bad expression): answer it so it can try again, and keep the flow alive.
                return f"error: {e}"
            raise
        entry.update({"ok": True, "duration_ms": _ms(started), **(summary(result) if summary else {})})
        calls.append(entry)
        return json.dumps(result, ensure_ascii=False, default=str)

    return run


async def _build_tools(
    node: dict,
    tool_runner: ToolRunner | None,
    schema_resolver: SchemaResolver | None,
    action_schema_resolver: ActionSchemaResolver | None,
    calls: list[dict[str, Any]],
) -> list[Any]:
    """One pydantic-ai tool per configured tool. `_traced_tool` records every call, including a failed one."""
    from pydantic_ai.tools import Tool

    configured = node.get("tools")
    if not isinstance(configured, list) or not configured:
        return []

    tools: list[Any] = []
    for tool in configured:
        if not isinstance(tool, dict):
            continue

        if tool.get("kind") == "calculator":
            from app.services.ontology.logic_calculator import CalculatorError, evaluate

            async def calculate(arguments: dict[str, Any]) -> Any:
                expression = str(arguments.get("expression") or "")
                try:
                    return evaluate(expression)
                except CalculatorError as e:
                    raise FlowError(str(e)) from e

            tools.append(
                Tool.from_schema(
                    _traced_tool(
                        "calculator",
                        calls,
                        calculate,
                        summary=lambda value: {"result": value},
                        soft_error=True,
                    ),
                    name="calculator",
                    description=(
                        "Evaluate an arithmetic expression exactly. Use it instead of computing in your head: "
                        "numbers, + - * / ** %, parentheses, and abs/round/min/max/sqrt/floor/ceil."
                    ),
                    json_schema={
                        "type": "object",
                        "properties": {
                            "expression": {"type": "string", "description": "e.g. (1 + 0.03) ** 12 - 1"}
                        },
                        "required": ["expression"],
                    },
                )
            )
            continue

        if tool.get("kind") == "apply_action":
            if tool_runner is None:
                continue
            action_type = str(tool.get("action_type") or "").strip()
            parameters = (
                await action_schema_resolver(action_type) if action_schema_resolver is not None else None
            ) or {"type": "object", "properties": {}, "additionalProperties": True}

            async def apply(arguments: dict[str, Any], _action_type: str = action_type) -> Any:
                edits = await tool_runner(
                    {"kind": "apply_action", "action_type": _action_type}, arguments
                )
                # The batch travels out with the flow's output and is applied only when an Action calls the function.
                return {"edits": edits}

            tools.append(
                Tool.from_schema(
                    _traced_tool(
                        "apply_action",
                        calls,
                        apply,
                        summary=lambda value: {"edits": len(value.get("edits") or [])},
                        extra={"action_type": action_type},
                    ),
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
            if tool_runner is None:
                continue
            function = str(tool.get("function") or "").strip()
            parameters = (
                await schema_resolver(function) if schema_resolver is not None else None
            ) or {"type": "object", "properties": {}, "additionalProperties": True}

            async def call(arguments: dict[str, Any], _function: str = function) -> Any:
                return await tool_runner({"kind": "call_function", "function": _function}, arguments)

            tools.append(
                Tool.from_schema(
                    _traced_tool(
                        "call_function", calls, call, extra={"function": function}
                    ),
                    name=f"call_{function}"[:64],
                    description=(
                        str(tool.get("description") or "").strip()
                        or f"Call the published function '{function}'. Pass its inputs as arguments."
                    ),
                    json_schema=parameters,
                )
            )
            continue

        if tool.get("kind") != "query_objects" or tool_runner is None:
            continue

        object_type = str(tool.get("object_type") or "").strip()
        properties = [str(p) for p in (tool.get("properties") or []) if str(p).strip()]
        limit = int(tool.get("limit") or DEFAULT_TOOL_LIMIT)

        async def query(
            arguments: dict[str, Any],
            _object_type: str = object_type,
            _properties: list[str] = properties,
            _limit: int = limit,
        ) -> Any:
            rows = await tool_runner(
                {
                    "kind": "query_objects",
                    "object_type": _object_type,
                    "properties": _properties,
                    "limit": _limit,
                },
                arguments,
            )
            # Only the granted properties reach the model: that is both the token budget and the data minimisation.
            trimmed = [
                {key: row[key] for key in _properties if key in row} if _properties else row
                for row in rows
            ]
            return trimmed

        tools.append(
            Tool.from_schema(
                _traced_tool(
                    "query_objects",
                    calls,
                    query,
                    summary=lambda rows: {"rows": len(rows)},
                    extra={"object_type": object_type},
                ),
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
                            "description": 'Property equalities, e.g. {"status": "open"}',
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
