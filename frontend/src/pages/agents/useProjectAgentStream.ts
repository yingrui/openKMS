import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { applyProjectStreamEvent } from '../../components/agents/agentStreamState';
import type { ChatMessage } from '../../components/agents/AgentChatMain';
import { persistedInterruptSummary } from '../../components/agents/projectSessionUtils';
import type { AgentConversationResponse } from '../../data/agentApi';
import {
  postProjectMessageStream,
  resumeProjectInterrupt,
  truncateProjectMessagesFromMessage,
} from '../../data/projectsApi';
import { useConfirm } from '../../contexts/ConfirmContext';

interface Params {
  projectId: string;
  convId: string | null;
  activeConv: AgentConversationResponse | undefined;
  planMode: boolean;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  refreshConversations: () => Promise<unknown>;
  loadMessages: (id: string) => Promise<void>;
  ensureConv: () => Promise<string>;
  beginLiveStream: (conversationId: string) => void;
  endLiveStream: (conversationId: string) => void;
  /** True when the visible session already has a durable running turn. */
  turnInProgress?: boolean;
  t: (key: string) => string;
}

export function useProjectAgentStream({
  projectId,
  convId,
  activeConv,
  planMode,
  messages,
  setMessages,
  refreshConversations,
  loadMessages,
  ensureConv,
  beginLiveStream,
  endLiveStream,
  turnInProgress = false,
  t,
}: Params) {
  const [loading, setLoading] = useState(false);
  const [todos, setTodos] = useState<unknown[]>([]);
  const [todoRevision, setTodoRevision] = useState(0);
  /** Live NDJSON interrupt; also set while HITL bar is dismissed during resume. */
  const [liveInterrupt, setLiveInterrupt] = useState<string | null>(null);
  const hitlResumeRef = useRef(false);
  const [hitlBusy, setHitlBusy] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [prefillInput, setPrefillInput] = useState<string | null>(null);
  const confirm = useConfirm();
  const visibleConvIdRef = useRef(convId);
  visibleConvIdRef.current = convId;

  const applyStreamEvent = useCallback(
    (
      ev: Parameters<typeof applyProjectStreamEvent>[0],
      asstStreamId: string,
      ownerConvId: string,
      userTempId?: string,
    ) => {
      // Session switch: keep background turn, stop mutating the visible thread.
      if (visibleConvIdRef.current !== ownerConvId) return;
      if (ev.type === 'todo') {
        setTodoRevision((n) => n + 1);
      }
      applyProjectStreamEvent(
        ev,
        { asstStreamId, userTempId },
        {
          setMessages,
          setTodos,
          setInterrupt: setLiveInterrupt,
          onFatal: (message) => toast.error(message),
          onError: (detail) => toast.error(detail),
        },
      );
    },
    [setMessages],
  );

  const reloadAfterTurn = async (cid: string) => {
    await refreshConversations();
    if (visibleConvIdRef.current === cid) {
      await loadMessages(cid);
    }
  };

  const onSend = async (text: string) => {
    if (loading || turnInProgress) return;
    const cid = await ensureConv();
    const userTemp: ChatMessage = { role: 'user', content: text, id: `tmp-u-${Date.now()}` };
    const asstTemp: ChatMessage = {
      role: 'assistant',
      content: '',
      streamParts: [],
      id: `tmp-a-${Date.now()}`,
    };
    const asstStreamId = asstTemp.id!;
    setMessages((prev) => [...prev, userTemp, asstTemp]);
    setLoading(true);
    setLiveInterrupt(null);
    setTodos([]);
    setTodoRevision(0);
    beginLiveStream(cid);
    try {
      await postProjectMessageStream(
        projectId,
        cid,
        text,
        { mode: planMode ? 'plan' : 'agent' },
        (ev) => applyStreamEvent(ev, asstStreamId, cid, userTemp.id),
      );
      await reloadAfterTurn(cid);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('chat.error'));
      try {
        await reloadAfterTurn(cid);
      } catch {
        if (visibleConvIdRef.current === cid) {
          setMessages((prev) => prev.filter((m) => m.id !== userTemp.id && m.id !== asstStreamId));
        }
      }
    } finally {
      endLiveStream(cid);
      setLoading(false);
    }
  };

  const resumeInterrupt = async (decision: 'approve' | 'reject') => {
    if (!convId || hitlResumeRef.current || turnInProgress) return;
    const lastAsst = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAsst?.id) {
      toast.error(t('chat.error'));
      return;
    }
    const cid = convId;
    hitlResumeRef.current = true;
    setHitlBusy(true);
    setLiveInterrupt(null);
    setLoading(true);
    beginLiveStream(cid);
    const asstStreamId = lastAsst.id;
    try {
      await resumeProjectInterrupt(
        projectId,
        cid,
        { decision },
        (ev) => applyStreamEvent(ev, asstStreamId, cid),
      );
      await reloadAfterTurn(cid);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('chat.error'));
      try {
        await reloadAfterTurn(cid);
      } catch {
        /* keep current UI */
      }
    } finally {
      hitlResumeRef.current = false;
      setHitlBusy(false);
      endLiveStream(cid);
      setLoading(false);
    }
  };

  const onRevertUserMessage = useCallback(
    async (userLine: ChatMessage) => {
      if (!convId || loading || reverting || turnInProgress) return;
      if (!userLine.id) return;
      if (
        !(await confirm({
          title: 'Revert message',
          message: t('chat.confirmRevert'),
          confirmLabel: 'Revert',
          danger: true,
        }))
      )
        return;
      const saved = userLine.content;
      setReverting(true);
      setLiveInterrupt(null);
      setTodos([]);
      setTodoRevision(0);
      try {
        await truncateProjectMessagesFromMessage(projectId, convId, userLine.id!);
        setPrefillInput(saved);
        await loadMessages(convId);
        void refreshConversations();
        toast.success(t('chat.revertOk'));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('chat.revertFailed'));
      } finally {
        setReverting(false);
      }
    },
    [convId, confirm, loadMessages, refreshConversations, loading, projectId, reverting, turnInProgress, t],
  );

  // Prefer live stream interrupt; fall back to last_turn.interrupt after reconnect.
  // Hide while resume/send is in flight so Approve doesn't flash back from stale last_turn.
  const persisted = persistedInterruptSummary(activeConv);
  const interrupt =
    liveInterrupt ?? (hitlBusy || loading ? null : persisted);

  return {
    loading,
    todos,
    todoRevision,
    dismissPlan: () => {
      setTodos([]);
      setTodoRevision(0);
    },
    interrupt,
    hitlBusy,
    reverting,
    prefillInput,
    setPrefillInput,
    clearStreamUi: () => {
      setTodos([]);
      setTodoRevision(0);
      setLiveInterrupt(null);
    },
    onSend,
    onInterruptApprove: () => void resumeInterrupt('approve'),
    onInterruptReject: () => void resumeInterrupt('reject'),
    onRevertUserMessage,
  };
}
