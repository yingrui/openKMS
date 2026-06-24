import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { ChatMessage } from '../../components/agents/AgentChatMain';
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

const TAIL_LIMIT = 50;
const PAGE_SIZE = 50;

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
  const streamingRef = useRef(false);
  const oldestOffsetRef = useRef(0);

  const loadConversations = useCallback(async () => {
    setConversationsReady(false);
    const list = await listProjectConversations(projectId);
    setConversations(list);
    setConversationsReady(true);
    return list;
  }, [projectId]);

  const loadMessages = useCallback(
    async (id: string) => {
      const result = await listProjectMessages(projectId, id, { limit: TAIL_LIMIT });
      const { items, total } = result;
      let tailItems = items;
      if (total > TAIL_LIMIT) {
        const tailOffset = Math.max(0, total - TAIL_LIMIT);
        if (tailOffset > 0) {
          const tail = await listProjectMessages(projectId, id, { limit: TAIL_LIMIT, offset: tailOffset });
          tailItems = tail.items;
        }
      }
      const tailOffset = Math.max(0, total - tailItems.length);
      oldestOffsetRef.current = tailOffset;
      setHasMoreOlder(tailOffset > 0);
      setMessages(mapItems(tailItems));
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
    loadConversations().catch((e) => toast.error(String(e)));
  }, [loadConversations]);

  useEffect(() => {
    if (!conversationsReady) return;

    if (sessionId) {
      if (conversations.some((c) => c.id === sessionId)) {
        setConvId(sessionId);
        setStoredProjectConversationId(projectId, sessionId);
        return;
      }
      const next = conversations[0]?.id ?? null;
      setConvId(next);
      setMessages([]);
      setStoredProjectConversationId(projectId, next);
      navigate(projectWorkspacePath(projectId, next), { replace: true });
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
  }, [conversationsReady, sessionId, conversations, projectId, navigate]);

  useEffect(() => {
    if (streamingRef.current) return;
    if (convId) {
      loadMessages(convId).catch((e) => {
        toast.error(e instanceof Error ? e.message : String(e));
        setMessages([]);
      });
    } else setMessages([]);
  }, [convId, loadMessages]);

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
      if (!deletingActive) return list;

      const next = list[0]?.id ?? null;
      setConvId(next);
      setMessages([]);
      setStoredProjectConversationId(projectId, next);
      navigate(projectWorkspacePath(projectId, next), { replace: true });
      return list;
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
    navigate(projectWorkspacePath(projectId, c.id));
    return c.id;
  };

  const activeConv = conversations.find((c) => c.id === convId);
  const sessionTitle = activeConv
    ? activeConv.title?.trim() || new Date(activeConv.updated_at).toLocaleDateString()
    : null;

  return {
    conversations,
    convId,
    messages,
    setMessages,
    loadConversations,
    loadMessages,
    streamingRef,
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
