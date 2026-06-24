"""In-memory process heartbeat registry."""

from datetime import datetime, timedelta, timezone

import app.services.heartbeat.process_heartbeat_registry as registry


def setup_function() -> None:
    registry.reset_for_tests()


def test_upsert_and_online_status():
    registry.upsert("worker", "worker-a")
    entries = registry.list_entries()
    assert len(entries) == 1
    assert registry.instance_status(entries[0].reported_at) == "ok"


def test_offline_after_two_minutes():
    registry.upsert("worker", "worker-a")
    with registry._lock:
        entry = registry._entries[("worker", "worker-a")]
        entry.reported_at = datetime.now(timezone.utc) - timedelta(seconds=registry.ONLINE_THRESHOLD_SECONDS + 1)
    assert registry.instance_status(entry.reported_at) == "error"


def test_prune_after_ten_minutes():
    registry.upsert("worker", "stale")
    with registry._lock:
        entry = registry._entries[("worker", "stale")]
        entry.reported_at = datetime.now(timezone.utc) - timedelta(seconds=registry.PRUNE_THRESHOLD_SECONDS + 1)
    registry.prune_stale()
    assert registry.list_entries() == []
