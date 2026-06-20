"""Structured logging for project agent turns (grep-friendly, no Langfuse required)."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import uuid4

if TYPE_CHECKING:
    from app.models.agent_models import AgentConversation

logger = logging.getLogger(__name__)


@dataclass(kw_only=True)
class AgentTurnContext:
    """One agent turn: INFO on success, ERROR on failure."""

    project_id: str
    conversation_id: str
    plan_mode: bool = False
    scheduled_run: bool = False
    streaming: bool = False
    resume: bool = False
    turn_id: str = field(default_factory=lambda: str(uuid4()))
    started_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    _started_at: float = field(default_factory=time.monotonic, repr=False)
    _finished: bool = field(default=False, repr=False)

    @classmethod
    def start(
        cls,
        *,
        project_id: str,
        conversation_id: str,
        plan_mode: bool = False,
        scheduled_run: bool = False,
        streaming: bool = False,
        resume: bool = False,
    ) -> AgentTurnContext:
        ctx = cls(
            project_id=project_id,
            conversation_id=conversation_id,
            plan_mode=plan_mode,
            scheduled_run=scheduled_run,
            streaming=streaming,
            resume=resume,
        )
        ctx.log_start()
        return ctx

    @property
    def duration_ms(self) -> int:
        return int((time.monotonic() - self._started_at) * 1000)

    def _base_fields(self) -> str:
        return (
            f"turn_id={self.turn_id} project_id={self.project_id} "
            f"conversation_id={self.conversation_id} scheduled_run={self.scheduled_run} "
            f"plan_mode={self.plan_mode} streaming={self.streaming} resume={self.resume}"
        )

    def log_start(self) -> None:
        logger.info("agent_turn_start %s", self._base_fields())

    def log_done(
        self,
        *,
        tool_count: int = 0,
        assistant_chars: int = 0,
        conversation: AgentConversation | None = None,
    ) -> None:
        if self._finished:
            return
        self._finished = True
        logger.info(
            "agent_turn_done %s duration_ms=%s tool_count=%s assistant_chars=%s",
            self._base_fields(),
            self.duration_ms,
            tool_count,
            assistant_chars,
        )
        if conversation is not None:
            self.apply_last_turn(conversation, status="completed", tool_count=tool_count)

    def log_failed(
        self,
        error: str,
        *,
        exc: BaseException | None = None,
        conversation: AgentConversation | None = None,
        tool_count: int = 0,
    ) -> None:
        if self._finished:
            return
        self._finished = True
        msg = (
            f"agent_turn_failed {self._base_fields()} duration_ms={self.duration_ms} "
            f"error={error!r}"
        )
        if exc is not None:
            logger.error(msg, exc_info=exc)
        else:
            logger.error(msg)
        if conversation is not None:
            self.apply_last_turn(
                conversation, status="failed", error=error, tool_count=tool_count
            )

    def apply_last_turn(
        self,
        conversation: AgentConversation,
        *,
        status: str,
        error: str | None = None,
        tool_count: int = 0,
    ) -> None:
        ctx = dict(conversation.context or {})
        ctx["last_turn"] = {
            "turn_id": self.turn_id,
            "status": status,
            "error": error,
            "started_at": self.started_at,
            "duration_ms": self.duration_ms,
            "tool_count": tool_count,
            "scheduled_run": self.scheduled_run,
            "plan_mode": self.plan_mode,
        }
        conversation.context = ctx
