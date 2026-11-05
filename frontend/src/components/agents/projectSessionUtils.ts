/** Shared helpers for Agent Project session list / turn state. */

import type { AgentConversationResponse } from '../../data/agentApi';

/** Keep in sync with backend `deep_agents.constants.STALE_RUNNING_SECONDS`. */
export const AGENT_TURN_STALE_MS = 10 * 60 * 1000;

/** Keep in sync with backend `deep_agents.constants.STALLED_TURN_SECONDS`. */
export const AGENT_TURN_STALLED_MS = 3 * 60 * 1000;

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

/** When the turn last proved it was alive; falls back to `started_at` for older rows. */
function lastTurnHeartbeatMs(lt: Record<string, unknown> | null): number | null {
  if (!lt) return null;
  for (const key of ['updated_at', 'started_at']) {
    const raw = lt[key];
    if (typeof raw !== 'string' || !raw) continue;
    const t = Date.parse(raw);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** True when the server would refuse a new interactive turn (non-stale running). */
export function conversationTurnIsActive(
  c: AgentConversationResponse | undefined,
  nowMs: number = Date.now(),
): boolean {
  const lt = lastTurnOf(c);
  if (!lt || lt.status !== 'running') return false;
  const t = lastTurnHeartbeatMs(lt);
  if (t == null) return true;
  return nowMs - t < AGENT_TURN_STALE_MS;
}

/**
 * True when a running turn has stopped reporting progress.
 *
 * Distinct from `conversationTurnIsActive`: a stalled turn may still hold the lease (so the
 * composer stays disabled) while showing no activity, which is exactly the state that used to
 * render as an endless "Thinking…".
 */
export function conversationTurnIsStalled(
  c: AgentConversationResponse | undefined,
  nowMs: number = Date.now(),
): boolean {
  const lt = lastTurnOf(c);
  if (!lt || lt.status !== 'running') return false;
  const t = lastTurnHeartbeatMs(lt);
  if (t == null) return false;
  return nowMs - t >= AGENT_TURN_STALLED_MS;
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
