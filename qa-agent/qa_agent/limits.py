"""Per-knowledge-base ceilings: how much of this service one KB may spend.

The endpoint is external. Without a ceiling, anyone holding a read grant can saturate the agent loop or run up a model bill —
"a public endpoint with unbounded spend is a bill, not a feature" (`docs/features/knowledge-base-qa-agent.md`).

Three ceilings, all **off by default** so an unconfigured knowledge base behaves exactly as before:

- `requests_per_minute` — a token bucket, refilled continuously;
- `max_concurrent` — in-flight turns, so one conversation cannot hold the loop while others queue;
- `daily_tokens` — model tokens per UTC day, counted from what the model reports.

**In-process.** Counters live in this worker's memory, which is honest for the current single-process deployment and wrong the
moment the agent runs with several workers: each would allow the full budget. That is written down in `docs/tech_debt.md`
rather than pretended away; a shared store is the fix when it is needed.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any

__all__ = ["LimitDecision", "Limiter", "limiter", "limits_of"]


@dataclass
class LimitDecision:
    allowed: bool
    reason: str | None = None
    retry_after_seconds: int | None = None


@dataclass
class _Bucket:
    tokens: float = 0.0
    #: `None` until the first use: 0.0 would be a real reading for a clock that starts at zero, and treating it as
    #: "uninitialised" refilled the bucket on every call — a limiter that never limits.
    last_refill: float | None = None


@dataclass
class _KbState:
    bucket: _Bucket = field(default_factory=_Bucket)
    in_flight: int = 0
    day: str = ""
    tokens_today: int = 0


def limits_of(config: dict[str, Any] | None) -> dict[str, int]:
    """The ceilings a KB asked for. Absent or non-positive means unlimited."""
    raw = (config or {}).get("limits")
    if not isinstance(raw, dict):
        return {}
    out: dict[str, int] = {}
    for key in ("requests_per_minute", "max_concurrent", "daily_tokens"):
        value = raw.get(key)
        if isinstance(value, int) and value > 0:
            out[key] = value
    return out


class Limiter:
    """Rate, concurrency and daily-token ceilings per knowledge base."""

    def __init__(self, *, clock=time.monotonic) -> None:
        self._lock = threading.Lock()
        self._state: dict[str, _KbState] = {}
        self._clock = clock

    # --- acquire / release -----------------------------------------------------------------------------------
    def acquire(self, kb_id: str, limits: dict[str, int]) -> LimitDecision:
        """Take one turn's slot, or say why not.

        A rejected request changes nothing: the bucket is not consumed and the in-flight count is not incremented.
        """
        if not limits:
            return LimitDecision(True)
        with self._lock:
            state = self._state.setdefault(kb_id, _KbState())
            now = self._clock()
            self._roll_day(state, now)

            if (daily := limits.get("daily_tokens")) and state.tokens_today >= daily:
                return LimitDecision(False, "DAILY_TOKEN_LIMIT", self._seconds_to_utc_midnight())

            if (cap := limits.get("max_concurrent")) and state.in_flight >= cap:
                return LimitDecision(False, "CONCURRENCY_LIMIT", 5)

            if rate := limits.get("requests_per_minute"):
                bucket = state.bucket
                if bucket.last_refill is None:
                    bucket.tokens = float(rate)
                    bucket.last_refill = now
                else:
                    bucket.tokens = min(float(rate), bucket.tokens + (now - bucket.last_refill) * rate / 60.0)
                    bucket.last_refill = now
                if bucket.tokens < 1.0:
                    wait = max(1, int((1.0 - bucket.tokens) * 60.0 / rate))
                    return LimitDecision(False, "RATE_LIMIT", wait)
                bucket.tokens -= 1.0

            state.in_flight += 1
        return LimitDecision(True)

    def release(self, kb_id: str) -> None:
        with self._lock:
            state = self._state.get(kb_id)
            if state is not None and state.in_flight > 0:
                state.in_flight -= 1

    # --- accounting ------------------------------------------------------------------------------------------
    def record_tokens(self, kb_id: str, tokens: int) -> None:
        if tokens <= 0:
            return
        with self._lock:
            state = self._state.setdefault(kb_id, _KbState())
            self._roll_day(state, self._clock())
            state.tokens_today += int(tokens)

    def state_of(self, kb_id: str) -> dict[str, Any]:
        """For tests and diagnostics: what the limiter currently believes about one knowledge base."""
        with self._lock:
            state = self._state.get(kb_id) or _KbState()
            return {"in_flight": state.in_flight, "tokens_today": state.tokens_today, "day": state.day}

    def reset(self) -> None:
        with self._lock:
            self._state.clear()

    # --- internals -------------------------------------------------------------------------------------------
    def _roll_day(self, state: _KbState, now: float) -> None:
        day = time.strftime("%Y-%m-%d", time.gmtime(time.time() if self._clock is time.monotonic else now))
        if state.day != day:
            state.day = day
            state.tokens_today = 0

    @staticmethod
    def _seconds_to_utc_midnight() -> int:
        now = time.time()
        return max(60, int(86400 - (now % 86400)))


#: One limiter for the process. The state is per KB and never global.
limiter = Limiter()


def tokens_from_message(message: Any) -> int:
    """What the model reported for one turn, or 0 when it reported nothing."""
    usage = getattr(message, "usage_metadata", None)
    if isinstance(usage, dict):
        total = usage.get("total_tokens")
        if isinstance(total, int):
            return total
    meta = getattr(message, "response_metadata", None)
    if isinstance(meta, dict):
        total = (meta.get("token_usage") or {}).get("total_tokens")
        if isinstance(total, int):
            return total
    return 0
