"""Named boundaries for work that must not raise.

``BLE001`` is enabled, so a blanket ``except Exception`` has to be a *decision*. This module is
the one place where that decision is made, so every other module names the failures it expects
(``SQLAlchemyError``, ``httpx.HTTPError``, ``STORAGE_ERRORS``, ``NEO4J_ERRORS``, parse errors…).

A boundary is for code whose contract is "report the failure and keep going": an SSE stream, a
health probe, a worker task, a telemetry call, a best-effort cleanup. Those call sites run
arbitrary third-party or user code, so no fixed exception tuple is honest there — the choice is
either a boundary or a crash.

``except Exception`` (never ``BaseException``) is deliberate: cancellation and process exit
(``KeyboardInterrupt``, ``SystemExit``, ``GeneratorExit``) still propagate.

Usage — report or ignore, explicitly::

    with boundary("publish the audit event", logger=logger) as failed:
        publish(event)
    if failed:
        logger.debug("audit publish skipped: %s", failed[0])
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager

__all__ = ["boundary"]


@contextmanager
def boundary(
    what: str,
    *,
    logger: logging.Logger | None = None,
    level: int = logging.WARNING,
    reraise: tuple[type[BaseException], ...] = (),
) -> Iterator[list[BaseException]]:
    """Run a block that must not raise; collect what went wrong.

    The yielded list is empty on success and holds the failure otherwise, so the caller decides
    what to do with it (nothing, log, surface it in the response). Passing ``logger`` logs the
    failure with a traceback at ``level``.

    ``reraise`` names control-flow exceptions that must keep travelling (``HTTPException`` in an
    endpoint that still wants a 4xx to reach the client).
    """
    failed: list[BaseException] = []
    try:
        yield failed
    except reraise:
        raise
    except Exception as exc:  # noqa: BLE001 -- see the module docstring; the allowlisted boundary
        failed.append(exc)
        if logger is not None:
            logger.log(level, "boundary '%s' failed: %s", what, exc, exc_info=True)
