"""The calculator: exact arithmetic, and no way to reach anything but arithmetic.

The safety property is the point — the model writes the expression, so every check here is about what it *cannot* do.
"""

from __future__ import annotations

import pytest

from app.services.ontology.logic_calculator import CalculatorError, evaluate


class TestArithmetic:
    def test_percentage_chains_and_precedence(self):
        assert evaluate("100 * (1 + 0.0825 / 12) ** 12") == pytest.approx(108.5668, rel=1e-4)
        assert evaluate("2 + 3 * 4") == 14

    def test_the_named_functions_a_flow_needs(self):
        assert evaluate("round(2.567, 2)") == 2.57
        assert evaluate("max(1, 2, 3) - min(1, 2, 3)") == 2
        assert evaluate("abs(-4) / 2") == 2

    def test_an_integer_answer_stays_an_integer(self):
        assert evaluate("6 / 3") == 2.0


class TestRefusals:
    @pytest.mark.parametrize(
        "expression",
        [
            "__import__('os').system('ls')",
            "open('/etc/passwd')",
            "1 / 0",
            "2 ** 999",
            "x + 1",
            "1 and 2",
            "[1, 2]",
            "{'a': 1}",
            "lambda: 1",
            "f'{1}'",
            "",
        ],
    )
    def test_nothing_but_arithmetic_is_allowed(self, expression):
        with pytest.raises(CalculatorError):
            evaluate(expression)

    def test_a_huge_result_is_refused_rather_than_returned(self):
        with pytest.raises(CalculatorError):
            evaluate("99999999 * 99999999 * 99999999")

    def test_the_message_says_what_was_wrong(self):
        with pytest.raises(CalculatorError) as exc:
            evaluate("1 +")
        assert "not a valid arithmetic expression" in str(exc.value)
