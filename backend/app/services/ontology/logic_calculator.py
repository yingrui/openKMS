"""A calculator the model can ask for: exact arithmetic instead of a plausible guess.

Language models are unreliable at multi-step arithmetic — large numbers, percentage chains, sums over many terms — and
they are unreliable in the worst way: the answer looks right. AIP Logic gives them a calculator; so do we.

The only thing that makes this safe is that **nothing is evaluated from the model's text**: the expression is parsed
into an AST and walked, and only numbers, four operators, parentheses and a short list of named functions are allowed.
`eval` is never called, on any input, for any reason.
"""

from __future__ import annotations

import ast
import math
import operator
from typing import Any

MAX_EXPRESSION_LENGTH = 500
MAX_ABS_RESULT = 1e15
MAX_EXPONENT = 100

_BINARY: dict[type[ast.operator], Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY: dict[type[ast.unaryop], Any] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}
_FUNCTIONS: dict[str, Any] = {
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
    "sqrt": math.sqrt,
    "floor": math.floor,
    "ceil": math.ceil,
}


class CalculatorError(ValueError):
    """The expression cannot be evaluated as arithmetic. The message is what the model reads."""


def evaluate(expression: str) -> float | int:
    """Evaluate an arithmetic expression. Raises `CalculatorError` with a message a model can act on."""
    text = (expression or "").strip()
    if not text:
        raise CalculatorError("the expression is empty")
    if len(text) > MAX_EXPRESSION_LENGTH:
        raise CalculatorError(f"the expression is longer than {MAX_EXPRESSION_LENGTH} characters")
    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError as e:
        raise CalculatorError(f"not a valid arithmetic expression: {e.msg}") from e

    value = _eval(tree.body)
    if isinstance(value, complex) or (isinstance(value, float) and not math.isfinite(value)):
        raise CalculatorError("the result is not a finite number")
    if abs(value) > MAX_ABS_RESULT:
        raise CalculatorError(f"the result is larger than {MAX_ABS_RESULT:g}")
    return value


def _eval(node: ast.AST) -> float | int:
    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise CalculatorError("only numbers are allowed")
        return node.value
    if isinstance(node, ast.BinOp):
        op = _BINARY.get(type(node.op))
        if op is None:
            raise CalculatorError(f"operator '{type(node.op).__name__}' is not allowed")
        left = _eval(node.left)
        right = _eval(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > MAX_EXPONENT:
            raise CalculatorError(f"the exponent is larger than {MAX_EXPONENT}")
        if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.Mod)) and right == 0:
            raise CalculatorError("division by zero")
        return op(left, right)
    if isinstance(node, ast.UnaryOp):
        op = _UNARY.get(type(node.op))
        if op is None:
            raise CalculatorError("only +/- may be applied to a value")
        return op(_eval(node.operand))
    if isinstance(node, ast.Call):
        name = getattr(node.func, "id", "")
        function = _FUNCTIONS.get(name)
        if function is None:
            raise CalculatorError(f"'{name or 'that'}' is not an available function")
        if node.keywords:
            raise CalculatorError("named arguments are not supported")
        return function(*(_eval(arg) for arg in node.args))
    raise CalculatorError(f"'{type(node).__name__}' is not allowed in an expression")
