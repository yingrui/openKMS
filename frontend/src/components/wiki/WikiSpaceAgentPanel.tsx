import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import { Bot, ChevronsRight, MessageCirclePlus, Send, Trash2 } from 'lucide-react';
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
  type AgentConversationResponse,
} from '../../data/agentApi';
import { WikiAgentMessageBody } from './WikiAgentMessageBody';
import './WikiSpaceAgentPanel.css';

type ChatRole = 'user' | 'assistant';

type ChatLine = { id: string; role: ChatRole; text: string };

function lineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const INTRO: ChatLine = {
  id: 'intro',
  role: 'assistant',
  text: 'Ask about this wiki: pages, content, or linked channel documents.',
};

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
  const [convReady, setConvReady] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

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
        const n = next[0] ?? null;
        setActiveConvId(n);
        if (n) {
          setStoredWikiAgentConversationId(spaceId, n.id);
          setConvReady(false);
          try {
            await loadMessages(n.id);
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
    if (!t || !convReady) return;
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
          { id: asstStreamId, role: 'assistant' as const, text: '' },
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
          if (e.type === 'user') {
            setLines((prev) =>
              prev.map((p) => (p.id === tempUserId ? { ...p, id: e.message.id } : p))
            );
            return;
          }
          if (e.type === 'delta') {
            if (!e.t) return;
            setLines((prev) =>
              prev.map((p) =>
                p.id === asstStreamId ? { ...p, text: p.text + e.t } : p
              )
            );
            return;
          }
          if (e.type === 'done') {
            setLines((prev) => {
              const without = prev.filter(
                (p) => p.id !== tempUserId && p.id !== asstStreamId
              );
              return [
                ...without,
                { id: e.user.id, role: 'user', text: t },
                { id: e.message.id, role: 'assistant', text: e.message.content },
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
  }, [draft, convReady, spaceId, activeConvId, loadConversations]);

  const convSelectValue =
    activeConvId && conversations.some((c) => c.id === activeConvId) ? activeConvId : '';

  return (
    <aside className="wiki-space-agent-panel" aria-label="Wiki assistant">
      <div className="wiki-space-agent-panel__head">
        <Bot size={20} className="wiki-space-agent-panel__head-icon" aria-hidden />
        <div className="wiki-space-agent-panel__head-text">
          <h2 className="wiki-space-agent-panel__title">Wiki assistant</h2>
          <p className="wiki-space-agent-panel__sub">{spaceName?.trim() || spaceId}</p>
        </div>
        {onRequestCollapse && (
          <button
            type="button"
            className="wiki-space-agent-panel__collapse"
            onClick={onRequestCollapse}
            title="Hide wiki assistant"
            aria-label="Collapse wiki assistant"
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
          disabled={conversationsLoading}
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
        >
          <MessageCirclePlus size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="wiki-space-agent-panel__chats-icon-btn wiki-space-agent-panel__chats-icon-btn--danger"
          onClick={removeActiveChat}
          title="Delete this chat"
          aria-label="Delete this chat"
          disabled={!activeConvId || sending}
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
                <span className="wiki-space-agent-panel__msg-label">Assistant</span>
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
                {m.role === 'user' ? 'You' : 'Assistant'}
              </span>
              <WikiAgentMessageBody
                text={m.text}
                variant={m.role === 'user' ? 'user' : 'assistant'}
              />
            </div>
          );
        })}
        <div ref={threadEndRef} className="wiki-space-agent-panel__thread-end" aria-hidden />
      </div>
      <div className="wiki-space-agent-panel__composer">
        <label htmlFor="wiki-agent-draft" className="wiki-space-agent-panel__sr-only">
          Message
        </label>
        <textarea
          id="wiki-agent-draft"
          className="wiki-space-agent-panel__input"
          rows={3}
          placeholder="Ask about this wiki…"
          value={draft}
          disabled={sending || !convReady}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!sending) send();
            }
          }}
        />
        <div className="wiki-space-agent-panel__composer-footer">
          <p className="wiki-space-agent-panel__composer-hint">
            <kbd className="wiki-space-agent-panel__kbd">Enter</kbd> to send ·{' '}
            <kbd className="wiki-space-agent-panel__kbd">Shift</kbd>+<kbd className="wiki-space-agent-panel__kbd">Enter</kbd>{' '}
            new line
          </p>
          <button
            type="button"
            className="btn btn-primary wiki-space-agent-panel__send"
            onClick={send}
            disabled={!draft.trim() || sending || !convReady}
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
