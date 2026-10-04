/** Shared agent conversation/message shapes used by KB Q&A and project agents. */

export interface AgentConversationResponse {
  id: string;
  user_sub: string;
  surface: string;
  context: Record<string, unknown>;
  title?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentMessageItem {
  id: string;
  role: string;
  content: string;
  tool_calls?: unknown;
  created_at: string;
}

/** Thread replay order: timestamp, then id (matches list APIs; helps legacy rows with identical created_at). */
export function sortAgentMessagesByCreatedAt(items: AgentMessageItem[]): AgentMessageItem[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}
