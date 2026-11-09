"""Shared Deep Agents constants (keep frontend stale-window comment in sync)."""

from __future__ import annotations

#: Matches frontend `AGENT_TURN_STALE_MS` in projectSessionUtils.ts.
#:
#: This is the **recovery** bound: a turn whose `last_turn.started_at` is older than this is
#: considered abandoned, so a new turn may take over. It used to be two hours, which meant a
#: turn killed by a restart blocked its session for the rest of the working day.
STALE_RUNNING_SECONDS = 10 * 60

#: A running turn that has not persisted any progress for this long is treated as stalled.
#: Shorter than the staleness bound on purpose: it decides when the UI *stops claiming*
#: progress, not when a competing turn may start.
STALLED_TURN_SECONDS = 3 * 60

#: Cap on what one tool call may return to the model (and to the transcript).
MAX_TOOL_OUTPUT_BYTES = 100_000
