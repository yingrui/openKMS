/** Shared helpers for Agent Project session list / turn state. */

import type { AgentConversationResponse } from '../../data/agentApi';

/** Keep in sync with backend `durable_stream.STALE_RUNNING_SECONDS`. */
export const AGENT_TURN_STALE_MS = 2 * 60 * 60 * 1000;

export function sessionLabel(c: AgentConversationResponse): string {
  if (c.title?.trim()) return c.title.trim();
  return new Date(c.updated_at).toLocaleDateString();
}

export function lastTurnOf(
  c: AgentConversationResponse | undefined,
): Record<string, unknown> | null {
  const lt = c?.context?.last_turn;
  if (!lt || typeof lt !== 'object') return null;
  return lt as Record<string, unknown>;
}

export function lastTurnStatus(c: AgentConversationResponse | undefined): string | null {
  const status = lastTurnOf(c)?.status;
  return typeof status === 'string' ? status : null;
}

/** True when the server would refuse a new interactive turn (non-stale running). */
export function conversationTurnIsActive(
  c: AgentConversationResponse | undefined,
  nowMs: number = Date.now(),
): boolean {
  const lt = lastTurnOf(c);
  if (!lt || lt.status !== 'running') return false;
  const started = lt.started_at;
  if (typeof started !== 'string' || !started) return true;
  const t = Date.parse(started);
  if (!Number.isFinite(t)) return true;
  return nowMs - t < AGENT_TURN_STALE_MS;
}

/**
 * Serialized interrupt payload for the Approve/Reject bar.
 * Reads `context.last_turn.interrupt` when status is `interrupted`.
 */
export function persistedInterruptSummary(
  c: AgentConversationResponse | undefined,
): string | null {
  const lt = lastTurnOf(c);
  if (!lt || lt.status !== 'interrupted') return null;
  const interrupt = lt.interrupt;
  if (interrupt && typeof interrupt === 'object') {
    return JSON.stringify(interrupt);
  }
  // Older interrupted turns without a stored payload — still show the bar.
  return JSON.stringify({
    action_requests: [{ description: 'Approval needed to continue' }],
  });
}
