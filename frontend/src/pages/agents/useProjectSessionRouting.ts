import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  convIdRef.current = convId;

  const conversationIdsKey = useMemo(
    () => conversations.map((c) => c.id).join('|'),
    [conversations],
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
    async (id: string) => {
      const result = await listProjectMessages(projectId, id, { limit: TAIL_LIMIT, tail: true });
      const { items, total } = result;
      const tailOffset = Math.max(0, total - items.length);
      oldestOffsetRef.current = tailOffset;
      setHasMoreOlder(tailOffset > 0);
      setMessages(mapItems(items));
    },
    [projectId],
  );

  const loadOlderMessages = useCallback(
    async (id: string) => {
      if (loadingOlder || oldestOffsetRef.current <= 0) return false;
      setLoadingOlder(true);
      try {
        const offset = Math.max(0, oldestOffsetRef.current - PAGE_SIZE);
        const result = await listProjectMessages(projectId, id, { limit: PAGE_SIZE, offset });
        oldestOffsetRef.current = offset;
        setHasMoreOlder(offset > 0);
        setMessages((prev) => [...mapItems(result.items), ...prev]);
        return true;
      } finally {
        setLoadingOlder(false);
      }
    },
    [projectId, loadingOlder],
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

  useEffect(() => {
    const prev = prevConvIdRef.current;
    prevConvIdRef.current = convId;

    if (!convId) {
      setMessages([]);
      return;
    }

    const liveOwner = liveStreamConvIdRef.current;
    // Same session still receiving live NDJSON — don't clobber in-flight streamParts.
    if (liveOwner === convId && prev === convId) return;

    loadMessages(convId).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      // Deep-linked id missing / deleted → fall back to first session.
      if (conversations[0]?.id && conversations[0].id !== convId) {
        navigate(projectWorkspacePath(projectId, conversations[0].id), { replace: true });
      } else {
        setMessages([]);
      }
    });
  }, [convId, loadMessages, conversations, navigate, projectId]);

  const activeConv = conversations.find((c) => c.id === convId);
  const turnInProgress = conversationTurnIsActive(activeConv);

  // After leave/sleep, reload chat while a durable turn is still running on the visible session.
  useEffect(() => {
    if (!convId || !turnInProgress) return;
    if (liveStreamConvIdRef.current === convId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const list = await listProjectConversations(projectId);
        if (cancelled) return;
        setConversations(list);
        const stillActive = conversationTurnIsActive(list.find((c) => c.id === convId));
        if (convIdRef.current === convId) {
          await loadMessages(convId);
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
  }, [convId, turnInProgress, projectId, loadMessages]);

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

  const sessionTitle = activeConv ? sessionLabel(activeConv) : null;

  return {
    conversations,
    activeConv,
    convId,
    messages,
    setMessages,
    refreshConversations,
    loadMessages,
    beginLiveStream,
    endLiveStream,
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
