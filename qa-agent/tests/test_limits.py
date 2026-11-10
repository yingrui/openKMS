"""Per-KB ceilings: off by default, and a rejection costs nothing."""
import pytest

from qa_agent.limits import Limiter, limits_of


class TestConfig:
    def test_no_config_means_no_limits(self):
        assert limits_of(None) == {}
        assert limits_of({}) == {}
        assert limits_of({"limits": {}}) == {}

    def test_configured_ceilings(self):
        assert limits_of({"limits": {"requests_per_minute": 30, "max_concurrent": 2, "daily_tokens": 50_000}}) == {
            "requests_per_minute": 30,
            "max_concurrent": 2,
            "daily_tokens": 50_000,
        }

    @pytest.mark.parametrize("bad", [0, -1, "10", None, 1.5])
    def test_a_nonsense_value_is_unlimited_rather_than_zero(self, bad):
        assert limits_of({"limits": {"requests_per_minute": bad}}) == {}


class TestRate:
    def test_the_bucket_allows_the_configured_rate_then_refills(self):
        now = [0.0]
        lim = Limiter(clock=lambda: now[0])
        limits = {"requests_per_minute": 2}
        assert lim.acquire("kb", limits).allowed
        assert lim.acquire("kb", limits).allowed
        third = lim.acquire("kb", limits)
        assert third.allowed is False
        assert third.reason == "RATE_LIMIT"
        assert third.retry_after_seconds and third.retry_after_seconds > 0
        now[0] = 60.0  # a minute later the bucket is full again
        assert lim.acquire("kb", limits).allowed

    def test_a_rejection_does_not_consume_the_bucket(self):
        lim = Limiter(clock=lambda: 0.0)
        limits = {"requests_per_minute": 1}
        assert lim.acquire("kb", limits).allowed
        assert lim.acquire("kb", limits).allowed is False
        assert lim.acquire("kb", limits).allowed is False
        assert lim.state_of("kb")["in_flight"] == 1

    def test_knowledge_bases_do_not_share_a_bucket(self):
        lim = Limiter(clock=lambda: 0.0)
        limits = {"requests_per_minute": 1}
        assert lim.acquire("kb-a", limits).allowed
        assert lim.acquire("kb-b", limits).allowed


class TestConcurrency:
    def test_in_flight_is_capped_and_freed_on_release(self):
        lim = Limiter(clock=lambda: 0.0)
        limits = {"max_concurrent": 1}
        assert lim.acquire("kb", limits).allowed
        busy = lim.acquire("kb", limits)
        assert busy.allowed is False and busy.reason == "CONCURRENCY_LIMIT"
        lim.release("kb")
        assert lim.acquire("kb", limits).allowed


class TestDailyTokens:
    def test_the_ceiling_stops_further_turns(self):
        lim = Limiter(clock=lambda: 0.0)
        limits = {"daily_tokens": 100}
        assert lim.acquire("kb", limits).allowed
        lim.release("kb")
        lim.record_tokens("kb", 100)
        blocked = lim.acquire("kb", limits)
        assert blocked.allowed is False and blocked.reason == "DAILY_TOKEN_LIMIT"

    def test_reported_tokens_accumulate(self):
        lim = Limiter(clock=lambda: 0.0)
        lim.record_tokens("kb", 40)
        lim.record_tokens("kb", 60)
        assert lim.state_of("kb")["tokens_today"] == 100

    def test_nothing_reported_is_not_a_crash(self):
        lim = Limiter(clock=lambda: 0.0)
        lim.record_tokens("kb", 0)
        lim.record_tokens("kb", -5)
        assert lim.state_of("kb")["tokens_today"] == 0
