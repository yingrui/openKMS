"""Tests for HITL resume decision batching."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.deep_agents.hitl import interrupt_map
from app.services.deep_agents.runner import (
    _build_hitl_resume_payload,
    _count_pending_hitl_decisions,
)


def test_count_pending_hitl_decisions_single():
    intr = SimpleNamespace(
        value={
            "action_requests": [{"name": "execute", "args": {}}],
            "review_configs": [],
        }
    )
    assert _count_pending_hitl_decisions([intr]) == 1


def test_count_pending_hitl_decisions_batch():
    intr = SimpleNamespace(
        value={
            "action_requests": [
                {"name": "execute", "args": {"command": "a"}},
                {"name": "execute", "args": {"command": "b"}},
                {"name": "execute", "args": {"command": "c"}},
            ],
            "review_configs": [],
        }
    )
    assert _count_pending_hitl_decisions([intr]) == 3


def test_build_hitl_resume_payload_approve_all():
    payload = _build_hitl_resume_payload(decision="approve", count=5)
    assert payload == {
        "decisions": [
            {"type": "approve"},
            {"type": "approve"},
            {"type": "approve"},
            {"type": "approve"},
            {"type": "approve"},
        ]
    }


def test_build_hitl_resume_payload_reject_with_message():
    payload = _build_hitl_resume_payload(decision="reject", count=2, message="stop")
    assert payload["decisions"] == [
        {"type": "reject", "message": "stop"},
        {"type": "reject", "message": "stop"},
    ]


def test_interrupt_map_scheduled_run_disables_hitl():
    assert interrupt_map(plan_mode=False, scheduled_run=True) is None


def test_interrupt_map_plan_mode_disables_hitl():
    assert interrupt_map(plan_mode=True, scheduled_run=False) is None
