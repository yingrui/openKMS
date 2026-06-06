/**
 * Wiki Copilot stream UI state: interleaved assistant text + tool rows, and helpers
 * to rebuild display from persisted API messages.
 */

/** Matches backend `app.services.agent.wiki_runner.WIKI_TOOL_TRANSCRIPTS_KEY`. */
export const WIKI_TOOL_TRANSCRIPTS_KEY = 'wiki_tool_traces_v1';

export type AgentToolCallStep = {
  runId: string;
  name: string;
  input?: string;
  output?: string;
  error?: string;
  status: 'running' | 'ok' | 'err';
};

export type SubagentStep = {
  id: string;
  label: string;
  status: 'running' | 'ok';
};

/** Interleaved text + tool rows in stream order (assistant messages only; optional when loaded from API). */
export type AssistantStreamPart =
  | { type: 'text'; text: string }
  | { type: 'tool'; step: AgentToolCallStep }
  | { type: 'subagent'; step: SubagentStep };

export function appendDeltaToStreamParts(
  parts: AssistantStreamPart[] | undefined,
  delta: string
): AssistantStreamPart[] {
  const next = parts ? [...parts] : [];
  const last = next[next.length - 1];
  if (last?.type === 'text') {
    next[next.length - 1] = { type: 'text', text: last.text + delta };
  } else {
    next.push({ type: 'text', text: delta });
  }
  return next;
}

export function updateToolInParts(
  parts: AssistantStreamPart[] | undefined,
  runId: string,
  f: (s: AgentToolCallStep) => AgentToolCallStep
): { next: AssistantStreamPart[]; updated: boolean } {
  const next = parts ? [...parts] : [];
  let iFound = -1;
  if (!runId) {
    for (let i = next.length - 1; i >= 0; i--) {
      const p = next[i];
      if (p?.type === 'tool' && p.step.status === 'running') {
        iFound = i;
        break;
      }
    }
  } else {
    for (let i = 0; i < next.length; i++) {
      const p = next[i];
      if (p?.type === 'tool' && p.step.runId === runId) {
        iFound = i;
        break;
      }
    }
  }
  if (iFound < 0) {
    return { next, updated: false };
  }
  const t = next[iFound]!;
  if (t.type === 'tool') {
    next[iFound] = { type: 'tool', step: f(t.step) };
  }
  return { next, updated: true };
}

export function appendSubagentStart(
  parts: AssistantStreamPart[] | undefined,
  label: string,
): AssistantStreamPart[] {
  const next = parts ? [...parts] : [];
  next.push({
    type: 'subagent',
    step: { id: `sub-${next.length}-${Date.now()}`, label, status: 'running' },
  });
  return next;
}

export function completeSubagent(parts: AssistantStreamPart[] | undefined): AssistantStreamPart[] {
  const next = parts ? [...parts] : [];
  for (let i = next.length - 1; i >= 0; i--) {
    const p = next[i];
    if (p?.type === 'subagent' && p.step.status === 'running') {
      next[i] = { type: 'subagent', step: { ...p.step, status: 'ok' } };
      break;
    }
  }
  return next;
}

function streamPartsFromPersistedToolCalls(toolCalls: unknown): AssistantStreamPart[] | undefined {
  if (!toolCalls || typeof toolCalls !== 'object' || Array.isArray(toolCalls)) return undefined;
  const raw = (toolCalls as Record<string, unknown>)[WIKI_TOOL_TRANSCRIPTS_KEY];
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const parts: AssistantStreamPart[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name : 'tool';
    const output = typeof o.output === 'string' ? o.output : undefined;
    const input = typeof o.input === 'string' ? o.input : undefined;
    const error = typeof o.error === 'string' ? o.error : undefined;
    parts.push({
      type: 'tool',
      step: {
        runId: `persisted-${i}-${name}`,
        name,
        input,
        output,
        error,
        status: error ? 'err' : 'ok',
      },
    });
  }
  return parts.length ? parts : undefined;
}

/**
 * Rebuild assistant `streamParts` from stored `content` + `tool_calls` (no true interleaving in DB).
 * Order: completed tools, then final visible text (typical agent pattern).
 */
export function assistantHistoryStreamParts(
  content: string,
  toolCalls: unknown
): AssistantStreamPart[] | undefined {
  const toolParts = streamPartsFromPersistedToolCalls(toolCalls);
  const text = content;
  const parts: AssistantStreamPart[] = [];
  if (toolParts?.length) parts.push(...toolParts);
  if (text.length > 0) parts.push({ type: 'text', text });
  return parts.length > 0 ? parts : undefined;
}
