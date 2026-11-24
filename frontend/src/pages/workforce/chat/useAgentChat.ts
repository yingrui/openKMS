import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';
import {
  createKbAgentConversation,
  deleteKbAgentConversation,
  deleteKbAgentMessagesFrom,
  listKbAgentMessagesPage,
  listKbAgentConversations,
  patchKbAgentConversation,
  postKbAgentMessageStream,
  getStoredKbQaConversationId,
  setStoredKbQaConversationId,
  clearStoredKbQaConversationId,
  type GroundingReport,
  type KnowledgeBaseResponse,
  type SearchResult,
} from '../../../data/knowledgeBasesApi';
import type { AgentConversationResponse } from '../../../data/agentApi';
import { applyCopilotStreamEvent } from '../../../components/agents/agentStreamState';
import { chatLineId, kbAgentFeedbackFromItems, kbAgentItemsToChatMessages } from './chatUtils';
import { voteAnswerFeedback } from '../../../data/workforceApi';
import type { ChatMessage, ChatFeedbackVote } from './types';

/**
 * One conversation with a workforce agent, kept in the thread store the knowledge base already writes.
 *
 * It is a hook of its own because a conversation has its own lifetime: it loads a list of threads, keeps one
 * selected, streams a turn, and remembers which thread the reader last opened. The page around it (the
 * source, the agent) changes far less often than the thread does.
 *
 * `agentId` is only used to build URLs — the thread belongs to the knowledge source (`kb.id`), which is why
 * the store and the API are the knowledge-base ones.
 */
/** How many turns one page of the thread holds. */
const THREAD_PAGE_SIZE = 50;

export function useAgentChat({
  agentId,
  kb,
  conversationId,
  navigate,
  t,
}: {
  agentId: string;
  /** The source this conversation answers from. A thread never spans two corpora. */
  kb: KnowledgeBaseResponse;
  /** The `:conversationId` the route opened with, if any. */
  conversationId?: string;
  navigate: NavigateFunction;
  t: TFunction;
}) {
  const kbId = kb.id;
  const kbIdRef = useRef(kbId);
  kbIdRef.current = kbId;

  const [draft, setDraft] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [feedback, setFeedback] = useState<Record<string, ChatFeedbackVote>>({});
  const [sending, setSending] = useState(false);
  /** Messages still ahead of the loaded window; `0` means the thread starts here. */
  const [olderOffset, setOlderOffset] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** One jump to the end when a thread opens; after that the reader's scroll position wins. */
  const pinToBottomRef = useRef(true);
  const qaStreamAbortRef = useRef<AbortController | null>(null);

  /** Langfuse session id for the turns of this open chat (opaque UUID). */
  const qaTraceSessionRef = useRef<string | null>(null);
  /** The same id as state, because the files rail reads it during render. */
  const [workspaceSessionId, setWorkspaceSessionId] = useState<string | null>(null);
  const beginQaTraceSession = useCallback(() => {
    const id = crypto.randomUUID();
    qaTraceSessionRef.current = id;
    setWorkspaceSessionId(id);
  }, []);
  const clearQaTraceSession = useCallback(() => {
    qaTraceSessionRef.current = null;
    setWorkspaceSessionId(null);
  }, []);

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AgentConversationResponse[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationReady, setConversationReady] = useState(false);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  const chatPath = useCallback(
    (id?: string | null) =>
      `/workforce/${agentId}/chat${id ? `/${id}` : ''}?kb=${encodeURIComponent(kbId)}`,
    [agentId, kbId]
  );

  useLayoutEffect(() => {
    const scroller = mainScrollRef.current;
    if (!scroller) return;
    if (pinToBottomRef.current) {
      // Opening a conversation shows its end, however long it is.
      scroller.scrollTop = scroller.scrollHeight;
      pinToBottomRef.current = false;
      return;
    }
    // After that, reading history wins: a token arriving must not move the page under the reader's eyes.
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distanceFromBottom > 120) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [chatMessages, sending]);

  useEffect(() => {
    beginQaTraceSession();
  }, [beginQaTraceSession]);

  const loadMessagesForConversation = useCallback(
    async (id: string) => {
      // The newest page first: a thread of hundreds of turns is a slow first paint, and the reader starts at the end.
      const page = await listKbAgentMessagesPage(kbId, id, { limit: THREAD_PAGE_SIZE });
      pinToBottomRef.current = true;
      const offset = Math.max(0, page.total - page.items.length);
      setOlderOffset(offset);
      const msgs = page.items;
      setChatMessages(kbAgentItemsToChatMessages(msgs));
      // Votes come back with the messages: the thumbs have to look the same after a reload as they did before it.
      setFeedback(kbAgentFeedbackFromItems(msgs));
    },
    [kbId]
  );

  useEffect(() => {
    if (!kbId) return;
    let cancelled = false;
    (async () => {
      setConversationReady(false);
      setConversationsLoading(true);
      try {
        const items = await listKbAgentConversations(kbId);
        if (cancelled) return;
        setConversations(items);
        const routeValid =
          conversationId && items.some((x) => x.id === conversationId) ? conversationId : null;
        const stored = getStoredKbQaConversationId(kbId);
        const validStored = stored && items.some((x) => x.id === stored) ? stored : null;
        const nextId = routeValid || validStored || items[0]?.id || null;
        setActiveConversationId(nextId);
        if (nextId) {
          setStoredKbQaConversationId(kbId, nextId);
          if (nextId !== conversationId) {
            navigate(chatPath(nextId), { replace: true });
          }
          try {
            await loadMessagesForConversation(nextId);
          } catch {
            if (!cancelled) {
              setChatMessages([]);
              toast.error(t('chat.toastLoadMessagesFailed'));
            }
          }
        } else {
          clearStoredKbQaConversationId(kbId);
          if (conversationId) navigate(chatPath(), { replace: true });
          if (!cancelled) setChatMessages([]);
        }
      } catch {
        if (!cancelled) toast.error(t('chat.toastLoadConversationsFailed'));
      } finally {
        if (!cancelled) {
          setConversationsLoading(false);
          setConversationReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kbId, conversationId, navigate, t, loadMessagesForConversation, chatPath]);

  const onSelectConversation = async (id: string) => {
    if (!id || id === activeConversationId) return;
    setActiveConversationId(id);
    setStoredKbQaConversationId(kbId, id);
    navigate(chatPath(id));
    try {
      await loadMessagesForConversation(id);
    } catch {
      toast.error(t('chat.toastLoadMessagesFailed'));
    }
  };

  const onNewChat = async () => {
    try {
      const c = await createKbAgentConversation(kbId);
      setActiveConversationId(c.id);
      setStoredKbQaConversationId(kbId, c.id);
      setConversations((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
      setChatMessages([]);
      setFeedback({});
      navigate(chatPath(c.id));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('chat.toastNewChatFailed'));
    }
  };

  const onRenameChat = async (id: string, title: string) => {
    try {
      const updated = await patchKbAgentConversation(kbId, id, { title });
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('chat.toastRenameChatFailed'));
    }
  };

  const onDeleteChat = async (id: string) => {
    const deletingActive = activeConversationId === id;
    try {
      await deleteKbAgentConversation(kbId, id);
      const items = await listKbAgentConversations(kbId);
      setConversations(items);
      if (!deletingActive) return;
      const next = items[0]?.id || null;
      setActiveConversationId(next);
      if (next) {
        setStoredKbQaConversationId(kbId, next);
        navigate(chatPath(next), { replace: true });
        await loadMessagesForConversation(next);
      } else {
        clearStoredKbQaConversationId(kbId);
        navigate(chatPath(), { replace: true });
        setChatMessages([]);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('chat.toastDeleteChatFailed'));
    }
  };

  /**
   * Remove one message and everything after it, and hand the text back to the composer.
   *
   * A turn that answered the wrong question leaves the conversation in a state the reader cannot fix by asking again —
   * the bad answer stays in the history the next turn reads. Reverting makes the edit the new turn instead of a
   * correction of the old one.
   */
  const revertMessage = async (message: ChatMessage): Promise<string | null> => {
    if (!activeConversationId || !message.id) return null;
    try {
      await deleteKbAgentMessagesFrom(kbId, activeConversationId, message.id);
      await loadMessagesForConversation(activeConversationId);
      toast.success(t('chat.revertOk'));
      return message.content;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('chat.revertFailed'));
      return null;
    }
  };

  /** Bring the previous page of the thread in, above what is already shown. */
  const loadOlderMessages = async () => {
    if (!activeConversationId || olderOffset <= 0 || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const offset = Math.max(0, olderOffset - THREAD_PAGE_SIZE);
      const page = await listKbAgentMessagesPage(kbId, activeConversationId, {
        limit: olderOffset - offset,
        offset,
      });
      setOlderOffset(offset);
      setChatMessages((prev) => [
        ...kbAgentItemsToChatMessages(page.items),
        ...prev,
      ]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('chat.toastLoadOlderFailed'));
    } finally {
      setLoadingOlder(false);
    }
  };

  /** Record a verdict, or withdraw one by pressing the same thumb again. */
  const setFeedbackVote = (key: string, vote: ChatFeedbackVote) => {
    const previous = feedback[key];
    const next: ChatFeedbackVote | null = previous === vote ? null : vote;
    applyVote(key, next);
    void voteAnswerFeedback(agentId, {
      message_id: key,
      conversation_id: activeConversationId,
      vote: next,
    }).catch((e: unknown) => {
      // The vote is a record, not a decoration: if the server refused it, the thumb has to go back.
      applyVote(key, previous ?? null);
      toast.error(e instanceof Error ? e.message : t('chat.toastFeedbackFailed'));
    });
  };

  const applyVote = (key: string, vote: ChatFeedbackVote | null) => {
    setFeedback((prev) => {
      const copy = { ...prev };
      if (vote) copy[key] = vote;
      else delete copy[key];
      return copy;
    });
  };

  const assistantText = (msg: ChatMessage): string => msg.content?.trim() ?? '';

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !conversationReady) return;
    const startedKb = kbId;
    const userText = draft.trim();

    qaStreamAbortRef.current?.abort();
    const ac = new AbortController();
    qaStreamAbortRef.current = ac;

    setDraft('');
    const tempUserId = chatLineId();
    const asstStreamId = chatLineId();
    let streamPersistedUserId: string | null = null;

    setChatMessages((prev) => [
      ...prev,
      { id: tempUserId, role: 'user', content: userText },
      { id: asstStreamId, role: 'assistant', content: '', streamParts: [], replyKey: asstStreamId },
    ]);
    setSending(true);
    try {
      let convId = activeConversationId;
      if (!convId) {
        const c = await createKbAgentConversation(kbId);
        if (startedKb !== kbIdRef.current) return;
        convId = c.id;
        setActiveConversationId(c.id);
        setConversations((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
        setStoredKbQaConversationId(kbId, c.id);
        navigate(chatPath(c.id), { replace: true });
      }

      await postKbAgentMessageStream(
        kbId,
        convId,
        userText,
        (ev) => {
          if (startedKb !== kbIdRef.current) return;
          if (ev.type === 'user') {
            streamPersistedUserId = ev.message.id;
          }
          if (ev.type === 'done' && !('user' in ev)) {
            setChatMessages((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === 'assistant') {
                  const m = next[i];
                  next[i] = {
                    ...m,
                    content: ev.answer,
                    sources: ev.sources,
                    streamParts: m.streamParts && m.streamParts.length > 0 ? m.streamParts : undefined,
                  };
                  break;
                }
              }
              return next;
            });
            return;
          }
          if (ev.type === 'error') {
            if ('message' in ev && ev.message) {
              setChatMessages((prev) =>
                prev.map((p) =>
                  p.id === asstStreamId
                    ? {
                        ...p,
                        id: ev.message.id,
                        content: ev.message.content,
                        replyKey: ev.message.id,
                      }
                    : p
                )
              );
              return;
            }
            const msg = `${t('chat.errorPrefix')} ${ev.detail}${ev.answer ? ` ${ev.answer}` : ''}`;
            setChatMessages((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === 'assistant') {
                  next[i] = { ...next[i], role: 'assistant', content: msg };
                  break;
                }
              }
              return next;
            });
            return;
          }
          applyCopilotStreamEvent<ChatMessage>(
            ev,
            { asstStreamId, userTempId: tempUserId, userText },
            {
              setLines: setChatMessages,
              getText: (p) => p.content,
              setText: (p, text) => ({ ...p, content: text }),
              onDone: (prev, { userText: savedText, streamed, ev: doneEv, asstStreamId: aId, userTempId: uId }) => {
                const kbDone = doneEv as Extract<typeof ev, { type: 'done' }> & {
                  user: { id: string };
                  message: { id: string; content: string };
                  sources?: SearchResult[];
                  grounding?: GroundingReport | null;
                  warnings?: string[];
                  verified?: boolean;
                };
                const without = prev.filter(
                  (p) => p.id !== aId && p.id !== kbDone.user.id && (uId == null || p.id !== uId)
                );
                const parts = streamed?.role === 'assistant' ? streamed.streamParts : undefined;
                return [
                  ...without,
                  {
                    id: kbDone.user.id,
                    role: 'user' as const,
                    createdAt: kbDone.user.created_at,
                    content: savedText,
                  },
                  {
                    id: kbDone.message.id,
                    role: 'assistant' as const,
                    createdAt: kbDone.message.created_at,
                    content: kbDone.message.content,
                    sources: kbDone.sources,
                    grounding: kbDone.grounding ?? null,
                    warnings: kbDone.warnings ?? [],
                    verified: kbDone.verified ?? true,
                    streamParts: parts && parts.length > 0 ? parts : undefined,
                    replyKey: kbDone.message.id,
                  },
                ];
              },
            }
          );
        },
        { signal: ac.signal, session_id: qaTraceSessionRef.current ?? undefined }
      );
      if (startedKb === kbIdRef.current) {
        void listKbAgentConversations(kbId).then((list) => setConversations(list));
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (startedKb !== kbIdRef.current) return;
      const persisted = streamPersistedUserId;
      const stripIds = (p: ChatMessage) =>
        p.id !== asstStreamId && p.id !== tempUserId && (persisted == null || p.id !== persisted);
      const msg = `${t('chat.errorPrefix')} ${
        err instanceof Error ? err.message : t('detail.toastAnswerFailed')
      }`;
      setDraft(userText);
      setChatMessages((prev) => prev.filter(stripIds));
      toast.error(msg);
    } finally {
      setSending(false);
      if (qaStreamAbortRef.current === ac) qaStreamAbortRef.current = null;
    }
  };

  return {
    chatMessages,
    draft,
    setDraft,
    feedback,
    sending,
    workspaceSessionId,
    clearQaTraceSession,
    activeConversationId,
    conversations,
    conversationsLoading,
    conversationReady,
    mainScrollRef,
    handleAsk,
    onSelectConversation,
    onNewChat,
    onRenameChat,
    onDeleteChat,
    revertMessage,
    hasOlder: olderOffset > 0,
    loadingOlder,
    loadOlderMessages,
    setFeedbackVote,
    assistantText,
  };
}
