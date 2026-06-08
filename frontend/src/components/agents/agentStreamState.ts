import type { Dispatch, SetStateAction } from 'react';
import type { AgentMessageItem } from '../../data/agentApi';
import {
  appendDeltaToStreamParts,
  appendSubagentStart,
  assistantHistoryStreamParts,
  completeSubagent,
  updateToolInParts,
  type AssistantStreamPart,
} from '../wiki/wikiCopilotStreamParts';
import { parseSubagentLabel } from '../wiki/agentStreamToolDisplay';
import type { ProjectStreamEvent } from '../../data/projectsApi';
import type { ChatMessage } from './AgentChatMain';

export type CopilotStreamLine = {
  id?: string;
  role: 'user' | 'assistant';
  streamParts?: AssistantStreamPart[];
};

export type CopilotStreamEvent =
  | { type: 'user'; message: Pick<AgentMessageItem, 'id' | 'content'> }
  | { type: 'delta'; t: string }
  | { type: 'tool_start'; run_id: string; name: string; input: string }
  | { type: 'tool_end'; run_id: string; name: string; output: string }
  | { type: 'tool_error'; run_id: string; name: string; error: string }
  | { type: 'done'; user: Pick<AgentMessageItem, 'id'>; message: Pick<AgentMessageItem, 'id' | 'content'> }
  | { type: 'error'; message: Pick<AgentMessageItem, 'id' | 'content'> };

export interface CopilotStreamEffects<T extends CopilotStreamLine> {
  setLines: Dispatch<SetStateAction<T[]>>;
  getText: (line: T) => string;
  setText: (line: T, text: string) => T;
  onDone?: (prev: T[], ctx: CopilotDoneContext<T>) => T[];
  onError?: (ev: Extract<CopilotStreamEvent, { type: 'error' }>) => void;
}

export interface CopilotDoneContext<T extends CopilotStreamLine> {
  asstStreamId: string;
  userTempId?: string;
  userText: string;
  streamed?: T;
  ev: Extract<CopilotStreamEvent, { type: 'done' }>;
}

function applyToolStart<T extends CopilotStreamLine>(
  lines: T[],
  asstStreamId: string,
  ev: Extract<CopilotStreamEvent, { type: 'tool_start' }>,
): T[] {
  return lines.map((p) => {
    if (p.id !== asstStreamId || p.role !== 'assistant') return p;
    const parts = p.streamParts ?? [];
    const { next, updated } = updateToolInParts(parts, ev.run_id, (s) => ({
      ...s,
      name: ev.name,
      input: ev.input,
      status: 'running' as const,
    }));
    return {
      ...p,
      streamParts: updated
        ? next
        : [
            ...parts,
            {
              type: 'tool' as const,
              step: {
                runId: ev.run_id,
                name: ev.name,
                input: ev.input,
                status: 'running' as const,
              },
            },
          ],
    };
  });
}

function applyToolEnd<T extends CopilotStreamLine>(
  lines: T[],
  asstStreamId: string,
  ev: Extract<CopilotStreamEvent, { type: 'tool_end' }>,
): T[] {
  return lines.map((p) => {
    if (p.id !== asstStreamId || p.role !== 'assistant') return p;
    const { next, updated } = updateToolInParts(p.streamParts ?? [], ev.run_id, (s) => ({
      ...s,
      name: ev.name,
      output: ev.output,
      status: 'ok' as const,
    }));
    const streamParts = updated
      ? next
      : [
          ...(p.streamParts ?? []),
          {
            type: 'tool' as const,
            step: {
              runId: ev.run_id,
              name: ev.name,
              output: ev.output,
              status: 'ok' as const,
            },
          },
        ];
    return { ...p, streamParts };
  });
}

function applyToolError<T extends CopilotStreamLine>(
  lines: T[],
  asstStreamId: string,
  ev: Extract<CopilotStreamEvent, { type: 'tool_error' }>,
): T[] {
  return lines.map((p) => {
    if (p.id !== asstStreamId || p.role !== 'assistant') return p;
    const { next, updated } = updateToolInParts(p.streamParts ?? [], ev.run_id, (s) => ({
      ...s,
      name: ev.name,
      error: ev.error,
      status: 'err' as const,
    }));
    const streamParts = updated
      ? next
      : [
          ...(p.streamParts ?? []),
          {
            type: 'tool' as const,
            step: {
              runId: ev.run_id,
              name: ev.name,
              error: ev.error,
              status: 'err' as const,
            },
          },
        ];
    return { ...p, streamParts };
  });
}

function defaultDoneLines<T extends CopilotStreamLine>(
  prev: T[],
  ctx: CopilotDoneContext<T>,
  effects: CopilotStreamEffects<T>,
): T[] {
  const { asstStreamId, userTempId, userText, streamed, ev } = ctx;
  const without = prev.filter(
    (p) => p.id !== asstStreamId && p.id !== ev.user.id && (userTempId == null || p.id !== userTempId),
  );
  const parts = streamed?.role === 'assistant' ? streamed.streamParts : undefined;
  const userLine = { id: ev.user.id, role: 'user' as const } as T;
  const assistantLine = { id: ev.message.id, role: 'assistant' as const, streamParts: parts } as T;
  return [
    ...without,
    effects.setText(userLine, userText),
    effects.setText(assistantLine, ev.message.content),
  ];
}

/** Apply wiki / KB copilot NDJSON events to local chat lines. */
export function applyCopilotStreamEvent<T extends CopilotStreamLine>(
  ev: CopilotStreamEvent,
  ctx: { asstStreamId: string; userTempId?: string; userText?: string },
  effects: CopilotStreamEffects<T>,
): void {
  const { asstStreamId, userTempId, userText = '' } = ctx;
  const { setLines, getText, setText, onDone, onError } = effects;

  if (ev.type === 'user' && userTempId) {
    setLines((prev) => prev.map((p) => (p.id === userTempId ? { ...p, id: ev.message.id } : p)));
    return;
  }
  if (ev.type === 'tool_start') {
    setLines((prev) => applyToolStart(prev, asstStreamId, ev));
    return;
  }
  if (ev.type === 'tool_end') {
    setLines((prev) => applyToolEnd(prev, asstStreamId, ev));
    return;
  }
  if (ev.type === 'tool_error') {
    setLines((prev) => applyToolError(prev, asstStreamId, ev));
    return;
  }
  if (ev.type === 'delta') {
    if (!ev.t) return;
    setLines((prev) =>
      prev.map((p) => {
        if (p.id !== asstStreamId || p.role !== 'assistant') return p;
        return {
          ...setText(p, getText(p) + ev.t),
          streamParts: appendDeltaToStreamParts(p.streamParts, ev.t),
        };
      }),
    );
    return;
  }
  if (ev.type === 'done') {
    setLines((prev) => {
      const streamed = prev.find((p) => p.id === asstStreamId);
      const doneCtx: CopilotDoneContext<T> = {
        asstStreamId,
        userTempId,
        userText,
        streamed,
        ev,
      };
      return onDone ? onDone(prev, doneCtx) : defaultDoneLines(prev, doneCtx, effects);
    });
    return;
  }
  if (ev.type === 'error') {
    onError?.(ev);
    setLines((prev) =>
      prev.map((p) =>
        p.id === asstStreamId ? setText({ ...p, id: ev.message.id }, ev.message.content) : p,
      ),
    );
  }
}

export interface ProjectStreamEffects {
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setTodos: Dispatch<SetStateAction<unknown[]>>;
  setInterrupt: Dispatch<SetStateAction<string | null>>;
  onFatal: (message: string) => void;
}

const projectCopilotEffects = (effects: ProjectStreamEffects): CopilotStreamEffects<ChatMessage> => ({
  setLines: effects.setMessages,
  getText: (line) => line.content,
  setText: (line, text) => ({ ...line, content: text }),
});

/** Apply project agent NDJSON events (copilot base + todos / HITL / subagents). */
export function applyProjectStreamEvent(
  ev: ProjectStreamEvent,
  ctx: { asstStreamId: string; userTempId?: string },
  effects: ProjectStreamEffects,
): void {
  const { asstStreamId, userTempId } = ctx;

  if (
    ev.type === 'user' ||
    ev.type === 'delta' ||
    ev.type === 'tool_start' ||
    ev.type === 'tool_end' ||
    ev.type === 'tool_error'
  ) {
    applyCopilotStreamEvent(ev, { asstStreamId, userTempId }, projectCopilotEffects(effects));
    return;
  }

  const { setMessages, setTodos, setInterrupt, onFatal } = effects;

  if (ev.type === 'subagent_start') {
    setMessages((prev) =>
      prev.map((p) =>
        p.id === asstStreamId && p.role === 'assistant'
          ? {
              ...p,
              streamParts: appendSubagentStart(p.streamParts, parseSubagentLabel(ev.name)),
            }
          : p,
      ),
    );
  } else if (ev.type === 'subagent_end') {
    setMessages((prev) =>
      prev.map((p) =>
        p.id === asstStreamId && p.role === 'assistant'
          ? { ...p, streamParts: completeSubagent(p.streamParts) }
          : p,
      ),
    );
  } else if (ev.type === 'todo') {
    setTodos(ev.todos);
  } else if (ev.type === 'interrupt') {
    setInterrupt(JSON.stringify(ev.interrupt ?? {}));
  } else if (ev.type === 'fatal') {
    onFatal(ev.message);
  } else if (ev.type === 'done') {
    setMessages((prev) =>
      prev.map((p) => {
        if (p.id !== asstStreamId) return p;
        const historyParts = assistantHistoryStreamParts(
          ev.assistant.content,
          ev.assistant.tool_calls,
        );
        return {
          role: 'assistant',
          content: ev.assistant.content,
          id: ev.assistant.id,
          streamParts: p.streamParts && p.streamParts.length > 0 ? p.streamParts : historyParts,
        };
      }),
    );
  }
}
