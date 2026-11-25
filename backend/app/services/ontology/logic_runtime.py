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

import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

import httpx
from pydantic_ai import Agent, PromptedOutput, StructuredDict
from pydantic_ai.exceptions import ModelAPIError, UnexpectedModelBehavior
from pydantic_ai.usage import UsageLimitExceeded, UsageLimits

SUPPORTED_NODE_KINDS = ("model",)
SUPPORTED_TOOL_KINDS = ("query_objects",)
PROMPT_REF = re.compile(r"\{\{\s*([A-Za-z0-9_.]+)\s*\}\}")
DEFAULT_NODE_TIMEOUT_S = 60.0
DEFAULT_NODE_TOKEN_LIMIT = 8192
DEFAULT_TOOL_LIMIT = 5
MAX_TOOL_LIMIT = 25
MAX_TOOLS_PER_NODE = 4
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
        if not str(tool.get("object_type") or "").strip():
            errors.append(f"{at}.object_type is required")
        limit = tool.get("limit")
        if limit is not None and (not isinstance(limit, int) or not 1 <= limit <= MAX_TOOL_LIMIT):
            errors.append(f"{at}.limit must be an integer between 1 and {MAX_TOOL_LIMIT}")
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
ToolRunner = Callable[[dict, dict], Awaitable[list[dict]]]


async def run_flow(
    spec: dict | None,
    input_payload: dict,
    *,
    model_factory: ModelFactory,
    tool_runner: ToolRunner | None = None,
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

    nodes = spec["nodes"]
    variables: dict[str, Any] = {"input": input_payload}
    trace: dict[str, Any] = {"nodes": []}
    started = time.perf_counter()
    last_node_id = ""

    for node in nodes:
        node_id = str(node["id"])
        prompt = render_template(str(node["prompt"]), variables)
        node_started = time.perf_counter()
        calls: list[dict[str, Any]] = []
        entry: dict[str, Any] = {
            "id": node_id,
            "kind": node.get("kind"),
            "model_id": node.get("model_id"),
            "prompt_sent": prompt,
            "missing_references": missing_references(str(node["prompt"]), variables),
            "tool_calls": calls,
        }
        try:
            output, usage = await _run_model_node(
                node,
                prompt=prompt,
                model_factory=model_factory,
                tool_runner=tool_runner,
                calls=calls,
                timeout_s=node_timeout_s,
                token_limit=node_token_limit,
            )
        except FlowError as e:
            # The failed entry keeps its tool calls: a denied read is exactly what you need to see afterwards.
            entry.update({"ok": False, "error": str(e), "duration_ms": _ms(node_started)})
            trace["nodes"].append(entry)
            return FlowOutcome(
                status="error",
                output=None,
                error=f"{node_id}: {e}",
                duration_ms=_ms(started),
                trace=trace,
            )

        entry.update(
            {"ok": True, "output": output, "usage": usage, "duration_ms": _ms(node_started)}
        )
        trace["nodes"].append(entry)
        variables[node_id] = output
        last_node_id = node_id

    output = _resolve_output(spec, variables, last_node_id)
    trace["output"] = output
    return FlowOutcome(
        status="ok", output=output, error=None, duration_ms=_ms(started), trace=trace
    )


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


async def _run_model_node(
    node: dict,
    *,
    prompt: str,
    model_factory: ModelFactory,
    tool_runner: ToolRunner | None,
    calls: list[dict[str, Any]],
    timeout_s: float,
    token_limit: int,
) -> tuple[Any, dict[str, Any]]:
    """One model call. The output schema decides whether we ask for structured data or plain text."""
    schema = node.get("output_schema")
    model = await model_factory(node.get("model_id"))
    output_type: Any = PromptedOutput(StructuredDict(schema)) if isinstance(schema, dict) else str
    system = str(node.get("system") or "").strip()
    tools = _build_tools(node, tool_runner, calls)
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


def _build_tools(node: dict, tool_runner: ToolRunner | None, calls: list[dict[str, Any]]) -> list[Any]:
    """One pydantic-ai tool per configured tool. Every call is recorded, including the rows it returned."""
    from pydantic_ai.tools import Tool

    configured = node.get("tools")
    if not isinstance(configured, list) or not configured or tool_runner is None:
        return []

    tools: list[Any] = []
    for tool in configured:
        if not isinstance(tool, dict) or tool.get("kind") != "query_objects":
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
