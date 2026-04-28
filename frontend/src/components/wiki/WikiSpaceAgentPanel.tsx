import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import { Bot, ChevronsRight, MessageCirclePlus, RefreshCw, Send, Terminal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createAgentConversation,
  deleteAgentConversation,
  clearStoredWikiAgentConversationId,
  getStoredWikiAgentConversationId,
  listAgentConversationsForWiki,
  listAgentMessages,
  postAgentMessageStream,
  setStoredWikiAgentConversationId,
  truncateAgentMessagesFromMessage,
  type AgentConversationResponse,
} from '../../data/agentApi';
import { WikiAgentMessageBody } from './WikiAgentMessageBody';
import {
  filterWikiAgentSkills,
  getActiveSlash,
  type WikiAgentSkill,
} from './wikiAgentSkills';
import './WikiSpaceAgentPanel.css';

type ChatRole = 'user' | 'assistant';

export type AgentToolCallStep = {
  runId: string;
  name: string;
  input?: string;
  output?: string;
  error?: string;
  status: 'running' | 'ok' | 'err';
};

/** Interleaved text + tool rows in stream order (assistant messages only; omitted when loaded from API). */
export type AssistantStreamPart =
  | { type: 'text'; text: string }
  | { type: 'tool'; step: AgentToolCallStep };

type ChatLine =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; streamParts?: AssistantStreamPart[] };

function appendDeltaToStreamParts(
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

function updateToolInParts(
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

function lineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const INTRO: ChatLine = {
  id: 'intro',
  role: 'assistant',
  text: 'Ask about this wiki: pages, content, or linked channel documents.',
};

/** Server-persisted agent row ids (uuid from API). */
const PERSISTED_AGENT_MSG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatConvLabel(c: AgentConversationResponse): string {
  if (c.title && c.title.trim()) return c.title.trim();
  const d = new Date(c.updated_at);
  if (!Number.isNaN(d.getTime())) {
    return `Chat · ${d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  }
  return `Chat · ${c.id.slice(0, 8)}…`;
}

export type WikiSpaceAgentPanelProps = {
  spaceId: string;
  spaceName: string | null;
  /** When set, shows a control to hide the right rail (parent may persist state). */
  onRequestCollapse?: () => void;
};

export function WikiSpaceAgentPanel({ spaceId, spaceName, onRequestCollapse }: WikiSpaceAgentPanelProps) {
  const [conversations, setConversations] = useState<AgentConversationResponse[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([INTRO]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [convReady, setConvReady] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [slashList, setSlashList] = useState<WikiAgentSkill[]>([]);
  const [slashHighlight, setSlashHighlight] = useState(0);
  const [slashDismissKey, setSlashDismissKey] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSlashStKeyRef = useRef('');

  const loadConversations = useCallback(async () => {
    try {
      const items = await listAgentConversationsForWiki(spaceId, { limit: 80 });
      setConversations(items);
      return items;
    } catch {
      setConversations([]);
      return [];
    }
  }, [spaceId]);

  const syncSlashMenu = useCallback(
    (el: HTMLTextAreaElement) => {
      const v = el.value;
      const cur = el.selectionStart ?? v.length;
      const st = getActiveSlash(v, cur);
      if (!st) {
        lastSlashStKeyRef.current = '';
        setSlashList([]);
        if (slashDismissKey !== null) setSlashDismissKey(null);
        return;
      }
      const sk = `${st.slashIndex}:${st.filter}`;
      const list = filterWikiAgentSkills(st.filter);
      if (sk !== lastSlashStKeyRef.current) {
        lastSlashStKeyRef.current = sk;
        setSlashHighlight(0);
      } else {
        setSlashHighlight((h) => (list.length ? Math.min(h, list.length - 1) : 0));
      }
      if (slashDismissKey === sk) {
        return;
      }
      setSlashList(list);
    },
    [slashDismissKey]
  );

  const applySlashSkill = useCallback(
    (skill: WikiAgentSkill) => {
      const el = draftRef.current;
      if (!el) return;
      const v = el.value;
      const cur = el.selectionStart ?? v.length;
      const st = getActiveSlash(v, cur);
      if (!st) return;
      const before = v.slice(0, st.slashIndex);
      const after = v.slice(cur);
      const ins = `/${skill.id} `;
      const next = `${before}${ins}${after}`;
      setDraft(next);
      setSlashList([]);
      setSlashDismissKey(null);
      setSlashHighlight(0);
      lastSlashStKeyRef.current = '';
      requestAnimationFrame(() => {
        if (!draftRef.current) return;
        const p = before.length + ins.length;
        draftRef.current.focus();
        draftRef.current.setSelectionRange(p, p);
      });
    },
    []
  );

  const loadMessages = useCallback(
    async (conversationId: string) => {
      const items = await listAgentMessages(conversationId);
      const mapped: ChatLine[] = items
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: m.id,
          role: m.role as ChatRole,
          text: m.content,
        }));
      setLines(mapped.length > 0 ? mapped : [INTRO]);
    },
    [setLines]
  );

  useLayoutEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [lines, sending]);

  useEffect(() => {
    setConvReady(false);
    setConversationsLoading(true);
    let cancelled = false;
    (async () => {
      const items = await loadConversations();
      if (cancelled) return;
      setConversationsLoading(false);
      const stored = getStoredWikiAgentConversationId(spaceId);
      const validStored = stored && items.some((x) => x.id === stored) ? stored : null;
      const nextId = validStored || items[0]?.id || null;
      setActiveConvId(nextId);
      if (nextId) {
        setStoredWikiAgentConversationId(spaceId, nextId);
        try {
          await loadMessages(nextId);
        } catch {
          if (!cancelled) {
            setLines([INTRO]);
            toast.error('Failed to load messages for this chat');
          }
        }
      } else {
        setLines([INTRO]);
      }
      if (!cancelled) setConvReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId, loadConversations, loadMessages]);

  const onSelectConversation = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      if (!v) {
        setActiveConvId(null);
        clearStoredWikiAgentConversationId(spaceId);
        setLines([INTRO]);
        return;
      }
      setActiveConvId(v);
      setStoredWikiAgentConversationId(spaceId, v);
      setConvReady(false);
      void (async () => {
        try {
          await loadMessages(v);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to load');
          setLines([INTRO]);
        } finally {
          setConvReady(true);
        }
      })();
    },
    [spaceId, loadMessages]
  );

  const startNewChat = useCallback(() => {
    setActiveConvId(null);
    clearStoredWikiAgentConversationId(spaceId);
    setLines([INTRO]);
  }, [spaceId]);

  const onRestartFromUserMessage = useCallback(
    (userLine: ChatLine) => {
      if (!activeConvId || sending || restarting) return;
      if (!PERSISTED_AGENT_MSG_ID.test(userLine.id)) {
        toast.error('Wait until this message is saved, then use restart.');
        return;
      }
      if (
        !window.confirm(
          'Remove this message and everything after it? Your text will reappear in the input so you can edit and resend.'
        )
      ) {
        return;
      }
      const saved = userLine.text;
      setRestarting(true);
      void (async () => {
        try {
          await truncateAgentMessagesFromMessage(activeConvId, userLine.id);
          setDraft(saved);
          await loadMessages(activeConvId);
          void loadConversations();
          toast.success('You can edit and resend to continue from here.');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not restart from here');
        } finally {
          setRestarting(false);
        }
      })();
    },
    [activeConvId, loadMessages, loadConversations, sending, restarting]
  );

  const removeActiveChat = useCallback(() => {
    if (!activeConvId) return;
    if (!window.confirm('Delete this chat and its messages? This cannot be undone.')) return;
    const deletedId = activeConvId;
    void (async () => {
      try {
        await deleteAgentConversation(deletedId);
        const next = await loadConversations();
        if (getStoredWikiAgentConversationId(spaceId) === deletedId) {
          clearStoredWikiAgentConversationId(spaceId);
        }
        const nextConv = next[0] ?? null;
        setActiveConvId(nextConv?.id ?? null);
        if (nextConv) {
          setStoredWikiAgentConversationId(spaceId, nextConv.id);
          setConvReady(false);
          try {
            await loadMessages(nextConv.id);
          } catch {
            setLines([INTRO]);
          } finally {
            setConvReady(true);
          }
        } else {
          setLines([INTRO]);
        }
        toast.success('Chat deleted');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      }
    })();
  }, [activeConvId, spaceId, loadConversations, loadMessages]);

  const send = useCallback(() => {
    const t = draft.trim();
    if (!t || !convReady || restarting) return;
    setDraft('');
    const tempUserId = lineId();
    const asstStreamId = lineId();

    void (async () => {
      setSending(true);
      setLines((prev) => {
        const base = prev.length === 1 && prev[0]?.id === 'intro' ? [] : prev;
        return [
          ...base,
          { id: tempUserId, role: 'user' as const, text: t },
          { id: asstStreamId, role: 'assistant' as const, text: '', streamParts: [] },
        ];
      });
      try {
        let convId = activeConvId;
        if (!convId) {
          const c = await createAgentConversation({
            surface: 'wiki_space',
            context: { wiki_space_id: spaceId },
          });
          convId = c.id;
          setActiveConvId(c.id);
          setStoredWikiAgentConversationId(spaceId, c.id);
          setConversations((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
        }
        await postAgentMessageStream(convId, t, (e) => {
          console.log('[WikiCopilot stream]', e.type, e);
          if (e.type === 'user') {
            setLines((prev) =>
              prev.map((p) => (p.id === tempUserId ? { ...p, id: e.message.id } : p))
            );
            return;
          }
          if (e.type === 'tool_start') {
            setLines((prev) =>
              prev.map((p) => {
                if (p.id !== asstStreamId || p.role !== 'assistant') return p;
                return {
                  ...p,
                  streamParts: [
                    ...(p.streamParts || []),
                    {
                      type: 'tool' as const,
                      step: {
                        runId: e.run_id,
                        name: e.name,
                        input: e.input,
                        status: 'running' as const,
                      },
                    },
                  ],
                };
              })
            );
            return;
          }
          if (e.type === 'tool_end') {
            setLines((prev) =>
              prev.map((p) => {
                if (p.id !== asstStreamId || p.role !== 'assistant') return p;
                const { next, updated } = updateToolInParts(
                  p.streamParts,
                  e.run_id,
                  (s) => ({
                    ...s,
                    name: e.name,
                    output: e.output,
                    status: 'ok' as const,
                  })
                );
                const sp = updated
                  ? next
                  : [
                      ...next,
                      {
                        type: 'tool' as const,
                        step: {
                          runId: e.run_id,
                          name: e.name,
                          output: e.output,
                          status: 'ok' as const,
                        },
                      },
                    ];
                return { ...p, role: 'assistant' as const, streamParts: sp };
              })
            );
            return;
          }
          if (e.type === 'tool_error') {
            setLines((prev) =>
              prev.map((p) => {
                if (p.id !== asstStreamId || p.role !== 'assistant') return p;
                const { next, updated } = updateToolInParts(
                  p.streamParts,
                  e.run_id,
                  (s) => ({
                    ...s,
                    name: e.name,
                    error: e.error,
                    status: 'err' as const,
                  })
                );
                const sp = updated
                  ? next
                  : [
                      ...next,
                      {
                        type: 'tool' as const,
                        step: {
                          runId: e.run_id,
                          name: e.name,
                          error: e.error,
                          status: 'err' as const,
                        },
                      },
                    ];
                return { ...p, role: 'assistant' as const, streamParts: sp };
              })
            );
            return;
          }
          if (e.type === 'delta') {
            if (!e.t) return;
            setLines((prev) =>
              prev.map((p) => {
                if (p.id !== asstStreamId) return p;
                if (p.role !== 'assistant') return p;
                return {
                  ...p,
                  text: p.text + e.t,
                  streamParts: appendDeltaToStreamParts(p.streamParts, e.t),
                };
              })
            );
            return;
          }
          if (e.type === 'done') {
            setLines((prev) => {
              const without = prev.filter(
                (p) => p.id !== tempUserId && p.id !== asstStreamId
              );
              const streamed = prev.find((p) => p.id === asstStreamId);
              const parts =
                streamed && streamed.role === 'assistant' ? streamed.streamParts : undefined;
              return [
                ...without,
                { id: e.user.id, role: 'user', text: t },
                {
                  id: e.message.id,
                  role: 'assistant',
                  text: e.message.content,
                  streamParts: parts,
                },
              ];
            });
            return;
          }
          if (e.type === 'error') {
            setLines((prev) =>
              prev.map((p) =>
                p.id === asstStreamId
                  ? { ...p, id: e.message.id, text: e.message.content }
                  : p
              )
            );
          }
        });
        void loadConversations();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Assistant request failed');
        setDraft(t);
        setLines((prev) => prev.filter((p) => p.id !== tempUserId && p.id !== asstStreamId));
      } finally {
        setSending(false);
      }
    })();
  }, [draft, convReady, restarting, spaceId, activeConvId, loadConversations]);

  const convSelectValue =
    activeConvId && conversations.some((c) => c.id === activeConvId) ? activeConvId : '';

  return (
    <aside className="wiki-space-agent-panel" aria-label="Wiki Copilot">
      <div className="wiki-space-agent-panel__head">
        <Bot size={20} className="wiki-space-agent-panel__head-icon" aria-hidden />
        <div className="wiki-space-agent-panel__head-text">
          <h2 className="wiki-space-agent-panel__title">Wiki Copilot</h2>
          <p className="wiki-space-agent-panel__sub">{spaceName?.trim() || spaceId}</p>
        </div>
        {onRequestCollapse && (
          <button
            type="button"
            className="wiki-space-agent-panel__collapse"
            onClick={onRequestCollapse}
            title="Hide Wiki Copilot"
            aria-label="Collapse Wiki Copilot"
          >
            <ChevronsRight size={20} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
      <div className="wiki-space-agent-panel__chats" aria-label="Conversations for this wiki">
        <label className="wiki-space-agent-panel__chats-label" htmlFor="wiki-space-agent-conv">
          Chats
        </label>
        <select
          id="wiki-space-agent-conv"
          className="wiki-space-agent-panel__chats-select"
          value={convSelectValue}
          onChange={onSelectConversation}
          disabled={conversationsLoading || restarting}
        >
          {conversationsLoading && conversations.length === 0 ? (
            <option value="" disabled>
              Loading…
            </option>
          ) : null}
          {!conversationsLoading && conversations.length === 0 ? (
            <option value="">No chats yet — your first message starts one</option>
          ) : null}
          {!conversationsLoading && conversations.length > 0 && (
            <option value="">＋ New message (draft)</option>
          )}
          {conversations.map((c) => (
            <option key={c.id} value={c.id}>
              {formatConvLabel(c)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="wiki-space-agent-panel__chats-icon-btn"
          onClick={startNewChat}
          title="Start new chat"
          aria-label="Start new chat"
          disabled={restarting}
        >
          <MessageCirclePlus size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="wiki-space-agent-panel__chats-icon-btn wiki-space-agent-panel__chats-icon-btn--danger"
          onClick={removeActiveChat}
          title="Delete this chat"
          aria-label="Delete this chat"
          disabled={!activeConvId || sending || restarting}
        >
          <Trash2 size={18} strokeWidth={2} />
        </button>
      </div>
      <div
        className="wiki-space-agent-panel__thread"
        role="log"
        aria-live="polite"
      >
        {lines.map((m) => {
          if (m.id === 'intro') {
            return (
              <div
                key={m.id}
                className="wiki-space-agent-panel__msg wiki-space-agent-panel__msg--assistant wiki-space-agent-panel__msg--intro"
              >
                <span className="wiki-space-agent-panel__msg-label">Copilot</span>
                <WikiAgentMessageBody text={m.text} variant="plain" />
              </div>
            );
          }
          return (
            <div
              key={m.id}
              className={`wiki-space-agent-panel__msg wiki-space-agent-panel__msg--${m.role}`}
            >
              <span className="wiki-space-agent-panel__msg-label">
                {m.role === 'user' ? 'You' : 'Copilot'}
              </span>
              {m.role === 'assistant' && m.streamParts && m.streamParts.length > 0 ? (
                <div className="wiki-space-agent-panel__assistant-stream" aria-label="Copilot reply">
                  {m.streamParts.map((part, i) =>
                    part.type === 'text' ? (
                      <WikiAgentMessageBody
                        key={`t-${i}`}
                        text={part.text}
                        variant="assistant"
                      />
                    ) : (
                      <div
                        key={part.step.runId ? `tool-${part.step.runId}-${i}` : `tool-${i}`}
                        className="wiki-space-agent-panel__tool-pill"
                      >
                        <div className="wiki-space-agent-panel__tool-pill-line">
                          <Terminal
                            size={12}
                            strokeWidth={2}
                            className="wiki-space-agent-panel__tool-pill-ico"
                            aria-hidden
                          />
                          <span className="wiki-space-agent-panel__tool-pill-name">
                            {part.step.name}
                          </span>
                          {part.step.status === 'running' ? (
                            <span className="wiki-space-agent-panel__tool-pill-badge">…</span>
                          ) : null}
                          {part.step.status === 'ok' ? (
                            <span className="wiki-space-agent-panel__tool-pill-badge wiki-space-agent-panel__tool-pill-badge--ok">
                              done
                            </span>
                          ) : null}
                          {part.step.status === 'err' ? (
                            <span className="wiki-space-agent-panel__tool-pill-badge wiki-space-agent-panel__tool-pill-badge--err">
                              error
                            </span>
                          ) : null}
                        </div>
                        {(part.step.input || part.step.output || part.step.error) &&
                        (part.step.status !== 'running' || part.step.input) ? (
                          <details className="wiki-space-agent-panel__tool-details">
                            <summary>Input / output</summary>
                            {part.step.input ? (
                              <pre className="wiki-space-agent-panel__tool-pre">
                                {part.step.input}
                              </pre>
                            ) : null}
                            {part.step.output ? (
                              <pre className="wiki-space-agent-panel__tool-pre">
                                {part.step.output}
                              </pre>
                            ) : null}
                            {part.step.error ? (
                              <pre
                                className="wiki-space-agent-panel__tool-pre wiki-space-agent-panel__tool-pre--err"
                              >
                                {part.step.error}
                              </pre>
                            ) : null}
                          </details>
                        ) : null}
                      </div>
                    )
                  )}
                </div>
              ) : (
                <WikiAgentMessageBody
                  text={m.text}
                  variant={m.role === 'user' ? 'user' : 'assistant'}
                />
              )}
              {m.role === 'user' && PERSISTED_AGENT_MSG_ID.test(m.id) ? (
                <div className="wiki-space-agent-panel__user-restart">
                  <button
                    type="button"
                    className="wiki-space-agent-panel__restart"
                    onClick={() => onRestartFromUserMessage(m)}
                    disabled={!activeConvId || sending || restarting}
                    title="Remove this and later messages; your text returns to the input to edit and resend"
                    aria-label="Restart from this message"
                  >
                    <RefreshCw size={15} strokeWidth={2} aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        <div ref={threadEndRef} className="wiki-space-agent-panel__thread-end" aria-hidden />
      </div>
      <div className="wiki-space-agent-panel__composer">
        <label htmlFor="wiki-agent-draft" className="wiki-space-agent-panel__sr-only">
          Message
        </label>
        <div className="wiki-space-agent-panel__input-wrap">
          {slashList.length > 0 && (
            <ul
              className="wiki-space-agent-panel__slash-menu"
              role="listbox"
              aria-label="Wiki skills"
              id="wiki-agent-slash-list"
            >
              {slashList.map((s, i) => (
                <li key={s.id} role="option" aria-selected={i === slashHighlight}>
                  <button
                    type="button"
                    className={
                      i === slashHighlight
                        ? 'wiki-space-agent-panel__slash-item wiki-space-agent-panel__slash-item--active'
                        : 'wiki-space-agent-panel__slash-item'
                    }
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySlashSkill(s)}
                    id={`wiki-agent-skill-${s.id}`}
                  >
                    <span className="wiki-space-agent-panel__slash-id">/{s.id}</span>
                    <span className="wiki-space-agent-panel__slash-desc">{s.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={draftRef}
            id="wiki-agent-draft"
            className="wiki-space-agent-panel__input"
            rows={3}
            placeholder="Ask about this wiki… Type / for skills"
            value={draft}
            disabled={sending || !convReady || restarting}
            aria-autocomplete="list"
            aria-controls={slashList.length > 0 ? 'wiki-agent-slash-list' : undefined}
            aria-expanded={slashList.length > 0}
            aria-activedescendant={
              slashList[slashHighlight] ? `wiki-agent-skill-${slashList[slashHighlight]!.id}` : undefined
            }
            onChange={(e) => {
              setDraft(e.target.value);
              syncSlashMenu(e.target);
            }}
            onSelect={(e) => syncSlashMenu(e.currentTarget)}
            onKeyUp={(e) => syncSlashMenu(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                const el = e.currentTarget;
                const st = getActiveSlash(el.value, el.selectionStart ?? 0);
                if (st) {
                  e.preventDefault();
                  setSlashDismissKey(`${st.slashIndex}:${st.filter}`);
                  setSlashList([]);
                }
                return;
              }
              if (slashList.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSlashHighlight((h) => (h + 1) % slashList.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSlashHighlight((h) => (h - 1 + slashList.length) % slashList.length);
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  applySlashSkill(slashList[slashHighlight]!);
                  return;
                }
                if (e.key === 'Tab') {
                  e.preventDefault();
                  applySlashSkill(slashList[slashHighlight]!);
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sending) send();
              }
            }}
          />
        </div>
        <div className="wiki-space-agent-panel__composer-footer">
          <p className="wiki-space-agent-panel__composer-hint">
            <kbd className="wiki-space-agent-panel__kbd">/</kbd> skills ·{' '}
            <kbd className="wiki-space-agent-panel__kbd">Enter</kbd> to send ·{' '}
            <kbd className="wiki-space-agent-panel__kbd">Shift</kbd>+<kbd className="wiki-space-agent-panel__kbd">Enter</kbd>{' '}
            new line
          </p>
          <button
            type="button"
            className="btn btn-primary wiki-space-agent-panel__send"
            onClick={send}
            disabled={!draft.trim() || sending || !convReady || restarting}
            aria-label="Send message"
          >
            <Send size={18} strokeWidth={2} aria-hidden />
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </aside>
  );
}
