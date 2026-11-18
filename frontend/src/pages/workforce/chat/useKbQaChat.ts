import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';
import {
  createKbAgentConversation,
  deleteKbAgentConversation,
  listAllKbAgentMessages,
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
import { kbAgentItemsToChatMessages, kbQaLineId } from './qaUtils';
import type { ChatMessage, KbQaFeedbackVote } from './types';

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
export function useKbQaChat({
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

  const [qaInput, setQaInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [qaFeedback, setQaFeedback] = useState<Record<string, KbQaFeedbackVote>>({});
  const [qaLoading, setQaLoading] = useState(false);
  const qaStreamAbortRef = useRef<AbortController | null>(null);

  /** Langfuse session id for the turns of this open chat (opaque UUID). */
  const qaTraceSessionRef = useRef<string | null>(null);
  /** The same id as state, because the files rail reads it during render. */
  const [qaSessionId, setQaSessionId] = useState<string | null>(null);
  const beginQaTraceSession = useCallback(() => {
    const id = crypto.randomUUID();
    qaTraceSessionRef.current = id;
    setQaSessionId(id);
  }, []);
  const clearQaTraceSession = useCallback(() => {
    qaTraceSessionRef.current = null;
    setQaSessionId(null);
  }, []);

  const [kbQaConvId, setKbQaConvId] = useState<string | null>(null);
  const [kbQaConversations, setKbQaConversations] = useState<AgentConversationResponse[]>([]);
  const [kbQaConvsLoading, setKbQaConvsLoading] = useState(false);
  const [kbQaConvReady, setKbQaConvReady] = useState(false);
  const kbQaMainScrollRef = useRef<HTMLDivElement | null>(null);

  const chatPath = useCallback(
    (id?: string | null) =>
      `/workforce/${agentId}/chat${id ? `/${id}` : ''}?kb=${encodeURIComponent(kbId)}`,
    [agentId, kbId]
  );

  useLayoutEffect(() => {
    const scroller = kbQaMainScrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [chatMessages, qaLoading]);

  useEffect(() => {
    beginQaTraceSession();
  }, [beginQaTraceSession]);

  const loadMessagesForConversation = useCallback(
    async (id: string) => {
      const msgs = await listAllKbAgentMessages(kbId, id);
      setChatMessages(kbAgentItemsToChatMessages(msgs));
      setQaFeedback({});
    },
    [kbId]
  );

  useEffect(() => {
    if (!kbId) return;
    let cancelled = false;
    (async () => {
      setKbQaConvReady(false);
      setKbQaConvsLoading(true);
      try {
        const items = await listKbAgentConversations(kbId);
        if (cancelled) return;
        setKbQaConversations(items);
        const routeValid =
          conversationId && items.some((x) => x.id === conversationId) ? conversationId : null;
        const stored = getStoredKbQaConversationId(kbId);
        const validStored = stored && items.some((x) => x.id === stored) ? stored : null;
        const nextId = routeValid || validStored || items[0]?.id || null;
        setKbQaConvId(nextId);
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
              toast.error(t('detail.qaToastLoadMessagesFailed'));
            }
          }
        } else {
          clearStoredKbQaConversationId(kbId);
          if (conversationId) navigate(chatPath(), { replace: true });
          if (!cancelled) setChatMessages([]);
        }
      } catch {
        if (!cancelled) toast.error(t('detail.qaToastLoadConversationsFailed'));
      } finally {
        if (!cancelled) {
          setKbQaConvsLoading(false);
          setKbQaConvReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kbId, conversationId, navigate, t, loadMessagesForConversation, chatPath]);

  const onSelectConversation = async (id: string) => {
    if (!id || id === kbQaConvId) return;
    setKbQaConvId(id);
    setStoredKbQaConversationId(kbId, id);
    navigate(chatPath(id));
    try {
      await loadMessagesForConversation(id);
    } catch {
      toast.error(t('detail.qaToastLoadMessagesFailed'));
    }
  };

  const onNewChat = async () => {
    try {
      const c = await createKbAgentConversation(kbId);
      setKbQaConvId(c.id);
      setStoredKbQaConversationId(kbId, c.id);
      setKbQaConversations((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
      setChatMessages([]);
      setQaFeedback({});
      navigate(chatPath(c.id));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.qaToastNewChatFailed'));
    }
  };

  const onRenameChat = async (id: string, title: string) => {
    try {
      const updated = await patchKbAgentConversation(kbId, id, { title });
      setKbQaConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.qaToastRenameChatFailed'));
    }
  };

  const onDeleteChat = async (id: string) => {
    const deletingActive = kbQaConvId === id;
    try {
      await deleteKbAgentConversation(kbId, id);
      const items = await listKbAgentConversations(kbId);
      setKbQaConversations(items);
      if (!deletingActive) return;
      const next = items[0]?.id || null;
      setKbQaConvId(next);
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
      toast.error(e instanceof Error ? e.message : t('detail.qaToastDeleteChatFailed'));
    }
  };

  const setFeedbackVote = (key: string, vote: KbQaFeedbackVote) => {
    setQaFeedback((prev) => {
      if (prev[key] === vote) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: vote };
    });
  };

  const assistantText = (msg: ChatMessage): string => msg.content?.trim() ?? '';

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaInput.trim() || !kbQaConvReady) return;
    const startedKb = kbId;
    const userText = qaInput.trim();

    qaStreamAbortRef.current?.abort();
    const ac = new AbortController();
    qaStreamAbortRef.current = ac;

    setQaInput('');
    const tempUserId = kbQaLineId();
    const asstStreamId = kbQaLineId();
    let streamPersistedUserId: string | null = null;

    setChatMessages((prev) => [
      ...prev,
      { id: tempUserId, role: 'user', content: userText },
      { id: asstStreamId, role: 'assistant', content: '', streamParts: [], replyKey: asstStreamId },
    ]);
    setQaLoading(true);
    try {
      let convId = kbQaConvId;
      if (!convId) {
        const c = await createKbAgentConversation(kbId);
        if (startedKb !== kbIdRef.current) return;
        convId = c.id;
        setKbQaConvId(c.id);
        setKbQaConversations((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
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
            const msg = `${t('detail.qaErrorPrefix')} ${ev.detail}${ev.answer ? ` ${ev.answer}` : ''}`;
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
                  { id: kbDone.user.id, role: 'user' as const, content: savedText },
                  {
                    id: kbDone.message.id,
                    role: 'assistant' as const,
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
        void listKbAgentConversations(kbId).then((list) => setKbQaConversations(list));
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (startedKb !== kbIdRef.current) return;
      const persisted = streamPersistedUserId;
      const stripIds = (p: ChatMessage) =>
        p.id !== asstStreamId && p.id !== tempUserId && (persisted == null || p.id !== persisted);
      const msg = `${t('detail.qaErrorPrefix')} ${
        err instanceof Error ? err.message : t('detail.toastAnswerFailed')
      }`;
      setQaInput(userText);
      setChatMessages((prev) => prev.filter(stripIds));
      toast.error(msg);
    } finally {
      setQaLoading(false);
      if (qaStreamAbortRef.current === ac) qaStreamAbortRef.current = null;
    }
  };

  return {
    chatMessages,
    qaInput,
    setQaInput,
    qaFeedback,
    qaLoading,
    qaSessionId,
    clearQaTraceSession,
    kbQaConvId,
    kbQaConversations,
    kbQaConvsLoading,
    kbQaConvReady,
    kbQaMainScrollRef,
    handleAsk,
    onSelectConversation,
    onNewChat,
    onRenameChat,
    onDeleteChat,
    setFeedbackVote,
    assistantText,
  };
}
