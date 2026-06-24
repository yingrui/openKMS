"""Minimal Tushare Pro HTTP client (no tushare package dependency)."""

from __future__ import annotations

import asyncio
import logging
import re
import time

import httpx

logger = logging.getLogger(__name__)

_RATE_LIMIT_RE = re.compile(r"(\d+)\s*次\s*/\s*(分钟|小时)")
# In-process sleeps longer than this block the worker; defer the job instead.
DEFER_RETRY_AFTER_SECONDS = 120.0


class TushareRateLimitError(RuntimeError):
    """Tushare API rate limit; job should be re-queued after ``retry_after_seconds``."""

    def __init__(self, *, api_name: str, retry_after_seconds: float, message: str) -> None:
        self.api_name = api_name
        self.retry_after_seconds = max(1.0, float(retry_after_seconds))
        super().__init__(message)


def is_tushare_rate_limit_error(message: str) -> bool:
    text = message or ""
    return "频率超限" in text or "每分钟" in text or "每小时" in text or "频次" in text


def parse_tushare_rate_limit_wait_seconds(message: str, *, fallback: float = 61.0) -> float:
    """Derive retry wait from messages like '频率超限(1次/小时)'."""
    match = _RATE_LIMIT_RE.search(message or "")
    if not match:
        return fallback
    count = max(1, int(match.group(1)))
    unit = match.group(2)
    period = 3600.0 * count if unit == "小时" else 60.0 * count
    return max(period + 30.0, fallback)


class TushareClient:
    def __init__(
        self,
        token: str,
        base_url: str = "https://api.tushare.pro",
        *,
        min_interval_seconds: float = 61.0,
        api_min_interval_seconds: dict[str, float] | None = None,
        max_retries: int = 5,
    ) -> None:
        self.token = (token or "").strip()
        if not self.token:
            raise ValueError("TUSHARE_TOKEN is not configured.")
        self.base_url = (base_url or "https://api.tushare.pro").rstrip("/")
        self.min_interval_seconds = max(1.0, float(min_interval_seconds))
        self.api_min_interval_seconds = {
            name: max(1.0, float(seconds))
            for name, seconds in (api_min_interval_seconds or {}).items()
        }
        self.max_retries = max(1, int(max_retries))
        self._last_request_at: dict[str, float] = {}

    def _interval_for(self, api_name: str) -> float:
        return self.api_min_interval_seconds.get(api_name, self.min_interval_seconds)

    async def _sleep_wall_clock(self, seconds: float, *, label: str) -> None:
        """Sleep until wall-clock deadline (survives short process suspend better than one long sleep)."""
        deadline = time.time() + seconds
        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                return
            if remaining >= 30:
                logger.info("Tushare waiting %.0fs more for %s", remaining, label)
            await asyncio.sleep(min(60.0, remaining))

    async def _throttle(self, api_name: str) -> None:
        last = self._last_request_at.get(api_name)
        if last is None:
            return
        interval = self._interval_for(api_name)
        elapsed = time.monotonic() - last
        wait = interval - elapsed
        if wait > 0:
            logger.info(
                "Tushare throttle: sleeping %.1fs before %s (min interval %.0fs)",
                wait,
                api_name,
                interval,
            )
            await self._sleep_wall_clock(wait, label=f"throttle {api_name}")

    async def query(self, api_name: str, params: dict, fields: str) -> list[dict]:
        last_error: RuntimeError | None = None
        for attempt in range(self.max_retries):
            await self._throttle(api_name)
            self._last_request_at[api_name] = time.monotonic()
            try:
                return await self._query_once(api_name, params, fields)
            except RuntimeError as exc:
                last_error = exc
                if is_tushare_rate_limit_error(str(exc)) and attempt < self.max_retries - 1:
                    wait = parse_tushare_rate_limit_wait_seconds(
                        str(exc),
                        fallback=self._interval_for(api_name),
                    )
                    if wait > DEFER_RETRY_AFTER_SECONDS:
                        logger.warning(
                            "Tushare rate limited on %s; deferring job retry in %.0fs",
                            api_name,
                            wait,
                        )
                        raise TushareRateLimitError(
                            api_name=api_name,
                            retry_after_seconds=wait,
                            message=str(exc),
                        ) from exc
                    logger.warning(
                        "Tushare rate limited on %s; retry %s/%s in %.0fs",
                        api_name,
                        attempt + 1,
                        self.max_retries,
                        wait,
                    )
                    await self._sleep_wall_clock(wait, label=f"rate limit {api_name}")
                    continue
                raise
        if last_error:
            raise last_error
        return []

    async def _query_once(self, api_name: str, params: dict, fields: str) -> list[dict]:
        payload = {
            "api_name": api_name,
            "token": self.token,
            "params": params,
            "fields": fields,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(self.base_url, json=payload)
            response.raise_for_status()
            body = response.json()

        code = body.get("code")
        if code != 0:
            msg = body.get("msg") or f"Tushare API returned code {code}"
            raise RuntimeError(msg)

        data = body.get("data") or {}
        field_names = list(data.get("fields") or [])
        items = data.get("items") or []
        rows: list[dict] = []
        for item in items:
            rows.append(dict(zip(field_names, item)))
        logger.info("Tushare %s returned %s rows", api_name, len(rows))
        return rows
