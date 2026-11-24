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
PROMPT_REF = re.compile(r"\{\{\s*([A-Za-z0-9_.]+)\s*\}\}")
DEFAULT_NODE_TIMEOUT_S = 60.0
DEFAULT_NODE_TOKEN_LIMIT = 8192


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

    output = spec.get("output")
    if output is not None and not isinstance(output, str):
        errors.append("flow_spec.output must be a reference string such as '{{n1}}'")
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


async def run_flow(
    spec: dict | None,
    input_payload: dict,
    *,
    model_factory: ModelFactory,
    node_timeout_s: float = DEFAULT_NODE_TIMEOUT_S,
    node_token_limit: int = DEFAULT_NODE_TOKEN_LIMIT,
) -> FlowOutcome:
    """Execute the flow. `model_factory` turns a node's `model_id` into a pydantic-ai model (tests inject a fake)."""
    errors = validate_flow_spec(spec)
    if errors:
        return FlowOutcome(status="error", output=None, error="; ".join(errors), duration_ms=None)

    assert spec is not None  # validate_flow_spec guarantees it
    nodes = spec["nodes"]
    variables: dict[str, Any] = {"input": input_payload}
    trace: dict[str, Any] = {"nodes": []}
    started = time.perf_counter()
    last_node_id = ""

    for node in nodes:
        node_id = str(node["id"])
        prompt = render_template(str(node["prompt"]), variables)
        node_started = time.perf_counter()
        entry: dict[str, Any] = {
            "id": node_id,
            "kind": node.get("kind"),
            "model_id": node.get("model_id"),
            "prompt_sent": prompt,
            "missing_references": missing_references(str(node["prompt"]), variables),
        }
        try:
            output, usage = await _run_model_node(
                node,
                prompt=prompt,
                model_factory=model_factory,
                timeout_s=node_timeout_s,
                token_limit=node_token_limit,
            )
        except FlowError as e:
            entry.update({"ok": False, "error": str(e), "duration_ms": _ms(node_started)})
            trace["nodes"].append(entry)
            return FlowOutcome(
                status="error",
                output=None,
                error=f"{node_id}: {e}",
                duration_ms=_ms(started),
                trace=trace,
            )

        entry.update({"ok": True, "output": output, "usage": usage, "duration_ms": _ms(node_started)})
        trace["nodes"].append(entry)
        variables[node_id] = output
        last_node_id = node_id

    output = _resolve_output(spec, variables, last_node_id)
    trace["output"] = output
    return FlowOutcome(
        status="ok", output=output, error=None, duration_ms=_ms(started), trace=trace
    )


async def _run_model_node(
    node: dict,
    *,
    prompt: str,
    model_factory: ModelFactory,
    timeout_s: float,
    token_limit: int,
) -> tuple[Any, dict[str, Any]]:
    """One model call. The output schema decides whether we ask for structured data or plain text."""
    schema = node.get("output_schema")
    model = await model_factory(node.get("model_id"))
    output_type: Any = PromptedOutput(StructuredDict(schema)) if isinstance(schema, dict) else str
    system = str(node.get("system") or "").strip()
    agent = (
        Agent(model, output_type=output_type, system_prompt=system)
        if system
        else Agent(model, output_type=output_type)
    )
    # No pre-flight token counting: only some providers support it, and `request_limit=1` already bounds the call.
    # A token overrun is caught after the response and reported as a node failure — never as a truncated answer.
    limits = UsageLimits(
        request_limit=1,
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
