"""Severity: what a failing rule means, and where that puts it in the inbox.

Two dimensions, and the point of the feature is that they are not one. A run says *that* a rule broke ("51,425 of
725,192 rows are outside the range"); severity says whether anyone should act on it. `PE(TTM) > 100` is not an error in
most markets — it is worth knowing (P2) — and while it was indistinguishable from a broken primary key, the inbox could
only report that both were `failed`.
"""

import pytest
from pydantic import ValidationError

from app.api.quality_issues import issue_rank
from app.schemas.quality import QualityRuleCreate, QualityRuleUpdate


class TestVocabulary:
    def test_the_three_levels_are_accepted(self):
        for level in ("P0", "P1", "P2"):
            assert QualityRuleCreate(name="n", rule_type="not_null", severity=level).severity == level

    def test_the_old_default_is_not_a_level(self):
        with pytest.raises(ValidationError):
            QualityRuleCreate(name="n", rule_type="not_null", severity="warning")

    def test_omitting_it_is_the_middle_level(self):
        assert QualityRuleCreate(name="n", rule_type="not_null").severity == "P1"

    def test_an_update_can_carry_one(self):
        assert QualityRuleUpdate(severity="P0").severity == "P0"

    def test_an_update_cannot_carry_a_invented_one(self):
        with pytest.raises(ValidationError):
            QualityRuleUpdate(severity="urgent")


class TestOrder:
    """Severity outranks status: an unjudged P0 leaves a decision uncovered, a failing P2 does not."""

    def test_p0_comes_before_p1_before_p2(self):
        assert issue_rank("P0", "passed") < issue_rank("P1", "failed") < issue_rank("P2", "failed")

    def test_within_a_severity_a_failure_outranks_an_unknown(self):
        assert issue_rank("P0", "failed") < issue_rank("P0", "error") < issue_rank("P0", "never")

    def test_no_run_outranks_a_pass(self):
        assert issue_rank("P1", "never") < issue_rank("P1", "passed")
