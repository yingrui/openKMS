import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, ChevronsRight, MessageCirclePlus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AgentAssistantStreamBody } from '../agents/AgentAssistantStreamBody';
import { PERSISTED_AGENT_MESSAGE_ID } from '../agents/agentConstants';
import { applyCopilotStreamEvent } from '../agents/agentStreamState';
import {
  createAgentConversation,
  deleteAgentConversation,
  clearStoredWikiAgentConversationId,
  getStoredWikiAgentConversationId,
  listAgentConversationsForWiki,
  listAllAgentMessages,
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
import {
  assistantHistoryStreamParts,
  type AssistantStreamPart,
} from './wikiCopilotStreamParts';
import './WikiSpaceAgentPanel.scss';

export type { AgentToolCallStep, AssistantStreamPart } from './wikiCopilotStreamParts';

type ChatLine =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; streamParts?: AssistantStreamPart[] };

function lineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const INTRO: ChatLine = {
  id: 'intro',
  role: 'assistant',
  text: '',
};

/** Server-persisted agent row ids (uuid from API). */
const PERSISTED_AGENT_MSG_ID = PERSISTED_AGENT_MESSAGE_ID;

export type WikiSpaceAgentPanelProps = {
  spaceId: string;
  spaceName: string | null;
  /** When set, shows a control to hide the right rail (parent may persist state). */
  onRequestCollapse?: () => void;
};

export function WikiSpaceAgentPanel({ spaceId, spaceName, onRequestCollapse }: WikiSpaceAgentPanelProps) {
  const { t } = useTranslation('wikiSpace');
  const spaceIdRef = useRef(spaceId);
  spaceIdRef.current = spaceId;
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
  /** Abort in-flight NDJSON stream when the wiki space changes or a new send starts. */
  const streamAbortRef = useRef<AbortController | null>(null);
  /** After the `user` NDJSON event, the optimistic user row uses the server id (not `tempUserId`). */
  const streamPersistedUserIdRef = useRef<string | null>(null);

  const formatConvLabel = useCallback(
    (c: AgentConversationResponse) => {
      if (c.title && c.title.trim()) return c.title.trim();
      const d = new Date(c.updated_at);
      if (!Number.isNaN(d.getTime())) {
        return `${t('copilot.chatDatePrefix')} ${d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      }
      return t('copilot.chatFallback', { snippet: `${c.id.slice(0, 8)}…` });
    },
    [t],
  );

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

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
    };
  }, [spaceId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const items = await listAllAgentMessages(conversationId);
    const mapped: ChatLine[] = items
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => {
        if (m.role === 'assistant') {
          const streamParts = assistantHistoryStreamParts(m.content, m.tool_calls);
          return {
            id: m.id,
            role: 'assistant' as const,
            text: m.content,
            ...(streamParts ? { streamParts } : {}),
          };
        }
        return { id: m.id, role: 'user' as const, text: m.content };
      });
    setLines(mapped.length > 0 ? mapped : [INTRO]);
  }, []);

  const recoverIfConversationMissing = useCallback(
    async (err: unknown): Promise<boolean> => {
      if (!(err instanceof Error) || !/conversation not found/i.test(err.message)) return false;
      clearStoredWikiAgentConversationId(spaceId);
      const refreshed = await loadConversations();
      const fid = refreshed[0]?.id ?? null;
      setActiveConvId(fid);
      if (fid) {
        setStoredWikiAgentConversationId(spaceId, fid);
        try {
          await loadMessages(fid);
        } catch {
          setLines([INTRO]);
        }
      } else {
        setLines([INTRO]);
      }
      return true;
    },
    [spaceId, loadConversations, loadMessages],
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
        } catch (e) {
          if (!cancelled) {
            const recovered = await recoverIfConversationMissing(e);
            if (recovered) {
              toast.error(t('copilot.toastConversationStale'));
            } else {
              setLines([INTRO]);
              toast.error(t('copilot.toastLoadMessagesFailed'));
            }
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
  }, [spaceId, loadConversations, loadMessages, recoverIfConversationMissing, t]);

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
          const recovered = await recoverIfConversationMissing(err);
          if (recovered) {
            toast.error(t('copilot.toastConversationStale'));
          } else {
            toast.error(err instanceof Error ? err.message : t('copilot.toastLoadConvFailed'));
            setLines([INTRO]);
          }
        } finally {
          setConvReady(true);
        }
      })();
    },
    [spaceId, loadMessages, loadConversations, recoverIfConversationMissing, t]
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
        toast.error(t('copilot.toastRestartWait'));
        return;
      }
      if (
        !window.confirm(t('copilot.confirmRestart'))
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
          toast.success(t('copilot.toastRestartOk'));
        } catch (e) {
          toast.error(e instanceof Error ? e.message : t('copilot.toastRestartFailed'));
        } finally {
          setRestarting(false);
        }
      })();
    },
    [activeConvId, loadMessages, loadConversations, sending, restarting, t]
  );

  const removeActiveChat = useCallback(() => {
    if (!activeConvId) return;
    if (!window.confirm(t('copilot.confirmDeleteChat'))) return;
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
        toast.success(t('copilot.toastChatDeleted'));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('copilot.toastDeleteChatFailed'));
      }
    })();
  }, [activeConvId, spaceId, loadConversations, loadMessages, t]);

  const send = useCallback(() => {
    const userText = draft.trim();
    if (!userText || !convReady || restarting) return;
    const startedInSpace = spaceId;
    setDraft('');
    const tempUserId = lineId();
    const asstStreamId = lineId();

    void (async () => {
      streamAbortRef.current?.abort();
      const ac = new AbortController();
      streamAbortRef.current = ac;
      streamPersistedUserIdRef.current = null;

      setSending(true);
      setLines((prev) => {
        const base = prev.length === 1 && prev[0]?.id === 'intro' ? [] : prev;
        return [
          ...base,
          { id: tempUserId, role: 'user' as const, text: userText },
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
        await postAgentMessageStream(
          convId,
          userText,
          (e) => {
            if (startedInSpace !== spaceIdRef.current) return;
            if (e.type === 'user') {
              streamPersistedUserIdRef.current = e.message.id;
            }
            applyCopilotStreamEvent(e, { asstStreamId, userTempId: tempUserId, userText }, {
              setLines,
              getText: (p) => p.text,
              setText: (p, text) => ({ ...p, text }),
            });
          },
          { signal: ac.signal }
        );
        if (startedInSpace === spaceIdRef.current) void loadConversations();
      } catch (e) {
        if (startedInSpace !== spaceIdRef.current) return;
        const persisted = streamPersistedUserIdRef.current;
        const aborted =
          (e instanceof DOMException || e instanceof Error) && e.name === 'AbortError';
        const stripIds = (p: ChatLine) =>
          p.id !== asstStreamId &&
          p.id !== tempUserId &&
          (persisted == null || p.id !== persisted);
        if (aborted) {
          setLines((prev) => prev.filter(stripIds));
          return;
        }
        toast.error(e instanceof Error ? e.message : t('copilot.toastAssistantFailed'));
        setDraft(userText);
        setLines((prev) => prev.filter(stripIds));
      } finally {
        streamPersistedUserIdRef.current = null;
        if (streamAbortRef.current === ac) streamAbortRef.current = null;
        setSending(false);
      }
    })();
  }, [draft, convReady, restarting, spaceId, activeConvId, loadConversations, t]);

  const convSelectValue =
    activeConvId && conversations.some((c) => c.id === activeConvId) ? activeConvId : '';

  return (
    <aside className="wiki-space-agent-panel" aria-label={t('copilot.threadAria')}>
      <div className="wiki-space-agent-panel__head">
        <Bot size={20} className="wiki-space-agent-panel__head-icon" aria-hidden />
        <div className="wiki-space-agent-panel__head-text">
          <h2 className="wiki-space-agent-panel__title">{t('copilot.title')}</h2>
          <p className="wiki-space-agent-panel__sub">{spaceName?.trim() || spaceId}</p>
        </div>
        {onRequestCollapse && (
          <button
            type="button"
            className="wiki-space-agent-panel__collapse"
            onClick={onRequestCollapse}
            title={t('copilot.collapseTitle')}
            aria-label={t('copilot.collapseAria')}
          >
            <ChevronsRight size={20} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
      <div className="wiki-space-agent-panel__chats" aria-label={t('copilot.conversationsAria')}>
        <label className="wiki-space-agent-panel__chats-label" htmlFor="wiki-space-agent-conv">
          {t('copilot.chatsLabel')}
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
              {t('copilot.chatsLoading')}
            </option>
          ) : null}
          {!conversationsLoading && conversations.length === 0 ? (
            <option value="">{t('copilot.noChatsYet')}</option>
          ) : null}
          {!conversationsLoading && conversations.length > 0 && (
            <option value="">{t('copilot.newDraftOption')}</option>
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
          title={t('copilot.newChatTitle')}
          aria-label={t('copilot.newChatAria')}
          disabled={restarting}
        >
          <MessageCirclePlus size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="wiki-space-agent-panel__chats-icon-btn wiki-space-agent-panel__chats-icon-btn--danger"
          onClick={removeActiveChat}
          title={t('copilot.deleteChatTitle')}
          aria-label={t('copilot.deleteChatAria')}
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
                <span className="wiki-space-agent-panel__msg-label">{t('copilot.labelCopilot')}</span>
                <WikiAgentMessageBody text={t('copilot.intro')} variant="plain" />
              </div>
            );
          }
          return (
            <div
              key={m.id}
              className={`wiki-space-agent-panel__msg wiki-space-agent-panel__msg--${m.role}`}
            >
              <span className="wiki-space-agent-panel__msg-label">
                {m.role === 'user' ? t('copilot.labelYou') : t('copilot.labelCopilot')}
              </span>
              {m.role === 'assistant' ? (
                <AgentAssistantStreamBody streamParts={m.streamParts} fallbackText={m.text} />
              ) : (
                <WikiAgentMessageBody text={m.text} variant="user" />
              )}
              {m.role === 'user' && PERSISTED_AGENT_MSG_ID.test(m.id) ? (
                <div className="wiki-space-agent-panel__user-restart">
                  <button
                    type="button"
                    className="wiki-space-agent-panel__restart"
                    onClick={() => onRestartFromUserMessage(m)}
                    disabled={!activeConvId || sending || restarting}
                    title={t('copilot.restartTitle')}
                    aria-label={t('copilot.restartAria')}
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
          {t('copilot.draftLabel')}
        </label>
        <div className="wiki-space-agent-panel__input-wrap">
          {slashList.length > 0 && (
            <ul
              className="wiki-space-agent-panel__slash-menu"
              role="listbox"
              aria-label={t('copilot.slashSkillsAria')}
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
            placeholder={t('copilot.inputPlaceholder')}
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
                  if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) {
                    return;
                  }
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
                if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) {
                  return;
                }
                e.preventDefault();
                if (!sending) send();
              }
            }}
          />
        </div>
        <div className="wiki-space-agent-panel__composer-footer">
          <p className="wiki-space-agent-panel__composer-hint">{t('copilot.composerHint')}</p>
          <button
            type="button"
            className="btn btn-primary wiki-space-agent-panel__send"
            onClick={send}
            disabled={!draft.trim() || sending || !convReady || restarting}
            aria-label={t('copilot.sendAria')}
          >
            <Send size={18} strokeWidth={2} aria-hidden />
            {sending ? t('copilot.sending') : t('copilot.send')}
          </button>
        </div>
      </div>
    </aside>
  );
}
