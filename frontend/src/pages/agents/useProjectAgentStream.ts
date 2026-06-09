import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { applyProjectStreamEvent } from '../../components/agents/agentStreamState';
import type { ChatMessage } from '../../components/agents/AgentChatMain';
import {
  postProjectMessageStream,
  resumeProjectInterrupt,
  truncateProjectMessagesFromMessage,
} from '../../data/projectsApi';

interface Params {
  projectId: string;
  convId: string | null;
  planMode: boolean;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  loadConversations: () => Promise<unknown>;
  loadMessages: (id: string) => Promise<void>;
  ensureConv: () => Promise<string>;
  streamingRef: MutableRefObject<boolean>;
  t: (key: string) => string;
}

export function useProjectAgentStream({
  projectId,
  convId,
  planMode,
  messages,
  setMessages,
  loadConversations,
  loadMessages,
  ensureConv,
  streamingRef,
  t,
}: Params) {
  const [loading, setLoading] = useState(false);
  const [todos, setTodos] = useState<unknown[]>([]);
  const [todoRevision, setTodoRevision] = useState(0);
  const [interrupt, setInterrupt] = useState<string | null>(null);
  const hitlResumeRef = useRef(false);
  const [hitlBusy, setHitlBusy] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [prefillInput, setPrefillInput] = useState<string | null>(null);

  const applyStreamEvent = useCallback(
    (ev: Parameters<typeof applyProjectStreamEvent>[0], asstStreamId: string, userTempId?: string) => {
      if (ev.type === 'todo') {
        setTodoRevision((n) => n + 1);
      }
      applyProjectStreamEvent(
        ev,
        { asstStreamId, userTempId },
        {
          setMessages,
          setTodos,
          setInterrupt,
          onFatal: (message) => toast.error(message),
        },
      );
    },
    [setMessages],
  );

  const onSend = async (text: string) => {
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
    setInterrupt(null);
    setTodos([]);
    setTodoRevision(0);
    streamingRef.current = true;
    try {
      await postProjectMessageStream(
        projectId,
        cid,
        text,
        { mode: planMode ? 'plan' : 'agent' },
        (ev) => applyStreamEvent(ev, asstStreamId, userTemp.id),
      );
      await loadConversations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('chat.error'));
      setMessages((prev) => prev.filter((m) => m.id !== userTemp.id && m.id !== asstStreamId));
    } finally {
      streamingRef.current = false;
      setLoading(false);
    }
  };

  const resumeInterrupt = async (decision: 'approve' | 'reject') => {
    if (!convId || hitlResumeRef.current) return;
    const lastAsst = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAsst?.id) {
      toast.error(t('chat.error'));
      return;
    }
    hitlResumeRef.current = true;
    setHitlBusy(true);
    setInterrupt(null);
    setLoading(true);
    streamingRef.current = true;
    const asstStreamId = lastAsst.id;
    try {
      await resumeProjectInterrupt(
        projectId,
        convId,
        { decision },
        (ev) => applyStreamEvent(ev, asstStreamId),
      );
      await loadConversations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('chat.error'));
    } finally {
      hitlResumeRef.current = false;
      setHitlBusy(false);
      streamingRef.current = false;
      setLoading(false);
    }
  };

  const onRevertUserMessage = useCallback(
    (userLine: ChatMessage) => {
      if (!convId || loading || reverting || streamingRef.current) return;
      if (!userLine.id) return;
      if (!window.confirm(t('chat.confirmRevert'))) return;
      const saved = userLine.content;
      setReverting(true);
      setInterrupt(null);
      setTodos([]);
      setTodoRevision(0);
      void (async () => {
        try {
          await truncateProjectMessagesFromMessage(projectId, convId, userLine.id!);
          setPrefillInput(saved);
          await loadMessages(convId);
          void loadConversations();
          toast.success(t('chat.revertOk'));
        } catch (e) {
          toast.error(e instanceof Error ? e.message : t('chat.revertFailed'));
        } finally {
          setReverting(false);
        }
      })();
    },
    [convId, loadMessages, loadConversations, loading, projectId, reverting, streamingRef, t],
  );

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
      setInterrupt(null);
    },
    onSend,
    onInterruptApprove: () => void resumeInterrupt('approve'),
    onInterruptReject: () => void resumeInterrupt('reject'),
    onRevertUserMessage,
  };
}
