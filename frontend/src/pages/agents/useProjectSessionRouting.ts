import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { ChatMessage } from '../../components/agents/AgentChatMain';
import {
  conversationTurnIsActive,
  sessionLabel,
} from '../../components/agents/projectSessionUtils';
import { assistantHistoryStreamParts } from '../../components/wiki/wikiCopilotStreamParts';
import type { AgentConversationResponse } from '../../data/agentApi';
import {
  createProjectConversation,
  deleteProjectConversation,
  getStoredProjectConversationId,
  listProjectConversations,
  listProjectMessages,
  projectWorkspacePath,
  setStoredProjectConversationId,
  suggestProjectConversationTitle,
  updateProjectConversation,
} from '../../data/projectsApi';

const TAIL_LIMIT = 10;
const PAGE_SIZE = 10;
const TURN_POLL_MS = 2000;

type MessageWindow = {
  messages: ChatMessage[];
  oldestOffset: number;
  hasMoreOlder: boolean;
  hasPagedOlder: boolean;
};

function mapItems(items: { id: string; role: string; content: string; created_at: string; tool_calls?: unknown }[]): ChatMessage[] {
  return items.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
    id: m.id,
    created_at: m.created_at,
    ...(m.role === 'assistant'
      ? { streamParts: assistantHistoryStreamParts(m.content, m.tool_calls) }
      : {}),
  }));
}

export function useProjectSessionRouting(projectId: string, sessionId?: string) {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<AgentConversationResponse[]>([]);
  const [conversationsReady, setConversationsReady] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** Live NDJSON owner: only this conversation's message effect is blocked while streaming. */
  const liveStreamConvIdRef = useRef<string | null>(null);
  const oldestOffsetRef = useRef(0);
  const convIdRef = useRef<string | null>(null);
  const prevConvIdRef = useRef<string | null>(null);
  /** Bumped on every session change / tail reload so stale responses are ignored. */
  const messagesEpochRef = useRef(0);
  const windowCacheRef = useRef<Map<string, MessageWindow>>(new Map());
  /** True after the user has loaded older pages for the current session. */
  const hasPagedOlderRef = useRef(false);
  convIdRef.current = convId;

  const conversationIdsKey = useMemo(
    () => conversations.map((c) => c.id).join('|'),
    [conversations],
  );

  const cacheWindow = useCallback((id: string, window: MessageWindow) => {
    windowCacheRef.current.set(id, window);
  }, []);

  const applyWindow = useCallback(
    (
      id: string,
      window: MessageWindow,
      epoch: number,
      opts?: { asTailReset?: boolean },
    ) => {
      if (epoch !== messagesEpochRef.current) return false;
      if (convIdRef.current !== id) return false;
      oldestOffsetRef.current = window.oldestOffset;
      setHasMoreOlder(window.hasMoreOlder);
      setMessages(window.messages);
      if (opts?.asTailReset) hasPagedOlderRef.current = false;
      cacheWindow(id, {
        ...window,
        hasPagedOlder: hasPagedOlderRef.current,
      });
      return true;
    },
    [cacheWindow],
  );

  const bootstrapConversations = useCallback(async () => {
    setConversationsReady(false);
    const list = await listProjectConversations(projectId);
    setConversations(list);
    setConversationsReady(true);
    return list;
  }, [projectId]);

  /** Silent list refresh — does not flip conversationsReady (avoids routing flicker). */
  const refreshConversations = useCallback(async () => {
    const list = await listProjectConversations(projectId);
    setConversations(list);
    return list;
  }, [projectId]);

  const loadMessages = useCallback(
    async (id: string, epoch?: number) => {
      const requestEpoch = epoch ?? messagesEpochRef.current;
      const result = await listProjectMessages(projectId, id, { limit: TAIL_LIMIT, tail: true });
      if (requestEpoch !== messagesEpochRef.current || convIdRef.current !== id) return;
      const { items, total } = result;
      const tailOffset = Math.max(0, total - items.length);
      applyWindow(
        id,
        {
          messages: mapItems(items),
          oldestOffset: tailOffset,
          hasMoreOlder: tailOffset > 0,
          hasPagedOlder: false,
        },
        requestEpoch,
        { asTailReset: true },
      );
    },
    [projectId, applyWindow],
  );

  const loadOlderMessages = useCallback(
    async (id: string) => {
      if (loadingOlder || oldestOffsetRef.current <= 0) return false;
      if (convIdRef.current !== id) return false;
      const epoch = messagesEpochRef.current;
      const offsetBefore = oldestOffsetRef.current;
      const offset = Math.max(0, offsetBefore - PAGE_SIZE);
      // Fetch only the gap — PAGE_SIZE past the start would overlap the current window.
      const limit = offsetBefore - offset;
      if (limit <= 0) return false;
      setLoadingOlder(true);
      try {
        const result = await listProjectMessages(projectId, id, { limit, offset });
        if (epoch !== messagesEpochRef.current || convIdRef.current !== id) return false;
        const mapped = mapItems(result.items);
        oldestOffsetRef.current = offset;
        setHasMoreOlder(offset > 0);
        setMessages((prev) => {
          if (convIdRef.current !== id || epoch !== messagesEpochRef.current) return prev;
          const existing = new Set(prev.map((m) => m.id));
          const fresh = mapped.filter((m) => !existing.has(m.id));
          const next = [...fresh, ...prev];
          hasPagedOlderRef.current = true;
          cacheWindow(id, {
            messages: next,
            oldestOffset: offset,
            hasMoreOlder: offset > 0,
            hasPagedOlder: true,
          });
          return next;
        });
        return true;
      } finally {
        if (epoch === messagesEpochRef.current) {
          setLoadingOlder(false);
        }
      }
    },
    [projectId, loadingOlder, cacheWindow],
  );

  /** Keep cache warm while the live stream mutates the visible thread. */
  const setMessagesCached = useCallback(
    (update: SetStateAction<ChatMessage[]>) => {
      setMessages((prev) => {
        const next = typeof update === 'function' ? update(prev) : update;
        const id = convIdRef.current;
        if (id) {
          cacheWindow(id, {
            messages: next,
            oldestOffset: oldestOffsetRef.current,
            hasMoreOlder: oldestOffsetRef.current > 0,
            hasPagedOlder: hasPagedOlderRef.current,
          });
        }
        return next;
      });
    },
    [cacheWindow],
  );

  useEffect(() => {
    bootstrapConversations().catch((e) => toast.error(String(e)));
  }, [bootstrapConversations]);

  // URL ↔ active session. Depend on id-set, not full list (poll updates updated_at).
  useEffect(() => {
    if (!conversationsReady) return;

    if (sessionId) {
      setConvId(sessionId);
      setStoredProjectConversationId(projectId, sessionId);
      return;
    }

    if (conversations.length === 0) {
      setConvId(null);
      return;
    }

    const stored = getStoredProjectConversationId(projectId);
    const pick =
      stored && conversations.some((c) => c.id === stored) ? stored : conversations[0].id;
    navigate(projectWorkspacePath(projectId, pick), { replace: true });
  }, [conversationsReady, sessionId, conversationIdsKey, projectId, navigate, conversations]);

  // Load message window only when the visible session identity changes — not when the
  // conversation list refreshes (poll / rename), which previously wiped paged history.
  useEffect(() => {
    const prev = prevConvIdRef.current;
    prevConvIdRef.current = convId;

    if (prev === convId) return;

    // Invalidate in-flight tail/older requests for the previous session.
    const epoch = ++messagesEpochRef.current;
    setLoadingOlder(false);
    oldestOffsetRef.current = 0;
    setHasMoreOlder(false);
    hasPagedOlderRef.current = false;

    if (!convId) {
      setMessages([]);
      return;
    }

    const liveOwner = liveStreamConvIdRef.current;
    if (liveOwner === convId) {
      // Switching back onto a live stream: restore cached window, don't clobber streamParts.
      const cached = windowCacheRef.current.get(convId);
      if (cached) {
        hasPagedOlderRef.current = cached.hasPagedOlder;
        applyWindow(convId, cached, epoch);
      } else {
        setMessages([]);
      }
      return;
    }

    setMessages([]);
    loadMessages(convId, epoch).catch((e) => {
      if (epoch !== messagesEpochRef.current || convIdRef.current !== convId) return;
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      const fallback = conversations[0]?.id;
      if (fallback && fallback !== convId) {
        navigate(projectWorkspacePath(projectId, fallback), { replace: true });
      } else {
        setMessages([]);
      }
    });
    // `conversations` intentionally omitted: list refresh must not reload the thread.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only session identity
  }, [convId, loadMessages, applyWindow, navigate, projectId]);

  const activeConv = conversations.find((c) => c.id === convId);
  const turnInProgress = conversationTurnIsActive(activeConv);

  // After leave/sleep, reload chat while a durable turn is still running on the visible session.
  // Keep the interval even while live NDJSON is open — ticks no-op until the bridge ends
  // (otherwise endLiveStream never re-subscribes and the UI can freeze mid-turn).
  useEffect(() => {
    if (!convId || !turnInProgress) return;
    let cancelled = false;
    const tick = async () => {
      try {
        if (liveStreamConvIdRef.current === convId) return;
        const list = await listProjectConversations(projectId);
        if (cancelled) return;
        setConversations(list);
        const stillActive = conversationTurnIsActive(list.find((c) => c.id === convId));
        if (convIdRef.current !== convId || liveStreamConvIdRef.current === convId) {
          return;
        }
        const epoch = messagesEpochRef.current;
        const result = await listProjectMessages(projectId, convId, {
          limit: TAIL_LIMIT,
          tail: true,
        });
        if (cancelled || epoch !== messagesEpochRef.current || convIdRef.current !== convId) {
          return;
        }
        const { items, total } = result;
        const tailOffset = Math.max(0, total - items.length);
        const tail = mapItems(items);
        if (!hasPagedOlderRef.current) {
          applyWindow(
            convId,
            {
              messages: tail,
              oldestOffset: tailOffset,
              hasMoreOlder: tailOffset > 0,
              hasPagedOlder: false,
            },
            epoch,
            { asTailReset: true },
          );
        } else {
          // Keep older pages; refresh only the overlapping tail segment.
          setMessages((prev) => {
            if (convIdRef.current !== convId || epoch !== messagesEpochRef.current) return prev;
            const tailIds = new Set(tail.map((m) => m.id));
            const keptPrefix = prev.filter((m) => !tailIds.has(m.id!));
            const next = [...keptPrefix, ...tail];
            cacheWindow(convId, {
              messages: next,
              oldestOffset: oldestOffsetRef.current,
              hasMoreOlder: oldestOffsetRef.current > 0,
              hasPagedOlder: true,
            });
            return next;
          });
        }
        if (stillActive) return;
      } catch {
        /* next poll */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), TURN_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [convId, turnInProgress, projectId, applyWindow, cacheWindow]);

  const onNewChat = async () => {
    const c = await createProjectConversation(projectId);
    setConversations((prev) => [c, ...prev]);
    navigate(projectWorkspacePath(projectId, c.id));
  };

  const onRenameConv = async (id: string, title: string, errorMsg: string) => {
    try {
      const updated = await updateProjectConversation(projectId, id, { title });
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errorMsg);
    }
  };

  const onAutoRenameConv = async (id: string, errorMsg: string) => {
    try {
      const updated = await suggestProjectConversationTitle(projectId, id);
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errorMsg);
    }
  };

  const onDeleteConv = async (id: string, errorMsg: string) => {
    const deletingActive = sessionId === id || convId === id;
    try {
      await deleteProjectConversation(projectId, id);
      windowCacheRef.current.delete(id);
      const list = await listProjectConversations(projectId);
      setConversations(list);
      if (!deletingActive) return { list, deletedActive: false as const };

      const next = list[0]?.id ?? null;
      setConvId(next);
      setMessages([]);
      setStoredProjectConversationId(projectId, next);
      navigate(projectWorkspacePath(projectId, next), { replace: true });
      return { list, deletedActive: true as const };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errorMsg);
      return null;
    }
  };

  const ensureConv = async (): Promise<string> => {
    const active = convId ?? sessionId ?? null;
    if (active) return active;
    const c = await createProjectConversation(projectId);
    setConversations((prev) => [c, ...prev]);
    setConvId(c.id);
    setStoredProjectConversationId(projectId, c.id);
    navigate(projectWorkspacePath(projectId, c.id));
    return c.id;
  };

  const beginLiveStream = useCallback((id: string) => {
    liveStreamConvIdRef.current = id;
  }, []);

  const endLiveStream = useCallback((id: string) => {
    if (liveStreamConvIdRef.current === id) {
      liveStreamConvIdRef.current = null;
    }
  }, []);

  /** Optimistic last_turn=running so poll attaches after NDJSON abort / session switch. */
  const markTurnRunning = useCallback((id: string) => {
    const startedAt = new Date().toISOString();
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const prevLt =
          c.context?.last_turn && typeof c.context.last_turn === 'object'
            ? (c.context.last_turn as Record<string, unknown>)
            : {};
        return {
          ...c,
          context: {
            ...c.context,
            last_turn: {
              ...prevLt,
              status: 'running',
              started_at: startedAt,
            },
          },
        };
      }),
    );
  }, []);

  const sessionTitle = activeConv ? sessionLabel(activeConv) : null;

  return {
    conversations,
    activeConv,
    convId,
    messages,
    setMessages: setMessagesCached,
    refreshConversations,
    loadMessages,
    beginLiveStream,
    endLiveStream,
    markTurnRunning,
    /** True when visible session has a non-stale server-side running turn. */
    turnInProgress,
    hasMoreOlder,
    loadingOlder,
    loadOlderMessages,
    onNewChat,
    onRenameConv,
    onAutoRenameConv,
    onDeleteConv,
    ensureConv,
    sessionTitle,
  };
}
