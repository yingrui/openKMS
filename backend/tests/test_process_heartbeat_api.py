"""Process heartbeat internal API and health aggregation."""

import asyncio

from app.api.admin import health_status
import app.services.heartbeat.process_heartbeat_registry as registry


def setup_function() -> None:
    registry.reset_for_tests()


def test_build_process_health_lists_instances():
    registry.upsert("worker", "worker-a")
    registry.upsert("scheduler", "scheduler")
    instances, summary = health_status._build_process_health()
    assert len(instances) == 2
    assert {i.instance_id for i in instances} == {"worker-a", "scheduler"}
    assert {c.id for c in summary} == {"job_workers", "job_scheduler"}
    workers = next(c for c in summary if c.id == "job_workers")
    assert workers.status == "ok"


def test_health_build_process_health_no_workers():
    registry.upsert("scheduler", "scheduler")
    _instances, summary = health_status._build_process_health()
    workers = next(c for c in summary if c.id == "job_workers")
    assert workers.status == "error"
