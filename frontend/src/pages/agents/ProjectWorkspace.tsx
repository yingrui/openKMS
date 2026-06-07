import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AgentChatMain, type ChatMessage } from '../../components/agents/AgentChatMain';
import { AgentFilesPanel } from '../../components/agents/AgentFilesPanel';
import { AgentSessionSidebar } from '../../components/agents/AgentSessionSidebar';
import { AgentsWorkspaceSkeleton } from '../../components/agents/AgentsPageSkeleton';
import {
  appendDeltaToStreamParts,
  appendSubagentStart,
  assistantHistoryStreamParts,
  completeSubagent,
  updateToolInParts,
} from '../../components/wiki/wikiCopilotStreamParts';
import { parseSubagentLabel } from '../../components/wiki/agentStreamToolDisplay';
import type { AgentConversationResponse } from '../../data/agentApi';
import {
  createProjectConversation,
  deleteProjectConversation,
  getProject,
  getStoredProjectConversationId,
  listProjectConversations,
  listProjectMessages,
  postProjectMessageStream,
  projectWorkspacePath,
  resumeProjectInterrupt,
  setStoredProjectConversationId,
  suggestProjectConversationTitle,
  updateProjectConversation,
  type ProjectResponse,
} from '../../data/projectsApi';
import '../../components/agents/AgentsWorkspace.scss';

const SESSIONS_WIDTH_PX = 240;
const CHAT_MIN_PX = 300;
const FILES_RAIL_MIN_PX = 200;
const FILES_RAIL_DEFAULT_PX = 400;
const FILES_RAIL_WIDTH_KEY = 'openkms_agents_files_rail_width_px_v1';

function readFilesRailWidth(): number {
  try {
    const raw = localStorage.getItem(FILES_RAIL_WIDTH_KEY);
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    /* ignore */
  }
  return FILES_RAIL_DEFAULT_PX;
}

export function ProjectWorkspace() {
  const { projectId = '', sessionId } = useParams<{ projectId: string; sessionId?: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('agents');
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [conversations, setConversations] = useState<AgentConversationResponse[]>([]);
  const [conversationsReady, setConversationsReady] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [todos, setTodos] = useState<unknown[]>([]);
  const [interrupt, setInterrupt] = useState<string | null>(null);
  const [filesRailWidthPx, setFilesRailWidthPx] = useState(readFilesRailWidth);
  const bodyRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);

  const clampFilesRailWidth = useCallback((w: number) => {
    const bodyW = bodyRef.current?.clientWidth ?? window.innerWidth;
    const max = Math.max(FILES_RAIL_MIN_PX, bodyW - SESSIONS_WIDTH_PX - CHAT_MIN_PX - 8);
    return Math.round(Math.min(max, Math.max(FILES_RAIL_MIN_PX, w)));
  }, []);

  useEffect(() => {
    const onResize = () => setFilesRailWidthPx((w) => clampFilesRailWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampFilesRailWidth]);

  const onFilesRailResizePointerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = filesRailWidthPx;
      let latest = startW;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      const onMove = (ev: MouseEvent) => {
        latest = clampFilesRailWidth(startW - (ev.clientX - startX));
        setFilesRailWidthPx(latest);
      };
      const onUp = () => {
        document.body.style.userSelect = prevUserSelect;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const final = clampFilesRailWidth(latest);
        setFilesRailWidthPx(final);
        try {
          localStorage.setItem(FILES_RAIL_WIDTH_KEY, String(final));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [filesRailWidthPx, clampFilesRailWidth],
  );

  const loadProject = useCallback(async () => {
    const p = await getProject(projectId);
    setProject(p);
  }, [projectId]);

  const loadConversations = useCallback(async () => {
    setConversationsReady(false);
    const list = await listProjectConversations(projectId);
    setConversations(list);
    setConversationsReady(true);
    return list;
  }, [projectId]);

  const loadMessages = useCallback(async (id: string) => {
    const items = await listProjectMessages(projectId, id);
    setMessages(
      items.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        id: m.id,
        ...(m.role === 'assistant'
          ? { streamParts: assistantHistoryStreamParts(m.content, m.tool_calls) }
          : {}),
      })),
    );
  }, [projectId]);

  useEffect(() => {
    loadProject().catch((e) => toast.error(String(e)));
    loadConversations().catch((e) => toast.error(String(e)));
  }, [loadProject, loadConversations]);

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
    if (convId) loadMessages(convId).catch(() => setMessages([]));
    else setMessages([]);
  }, [convId, loadMessages]);

  useEffect(() => {
    document.body.classList.add('openkms-agents-fullpage');
    return () => document.body.classList.remove('openkms-agents-fullpage');
  }, []);

  const onNewChat = async () => {
    const c = await createProjectConversation(projectId);
    setConversations((prev) => [c, ...prev]);
    navigate(projectWorkspacePath(projectId, c.id));
  };

  const onRenameConv = async (id: string, title: string) => {
    try {
      const updated = await updateProjectConversation(projectId, id, { title });
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('sessions.renameError'));
    }
  };

  const onAutoRenameConv = async (id: string) => {
    try {
      const updated = await suggestProjectConversationTitle(projectId, id);
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('sessions.autoRenameError'));
    }
  };

  const onDeleteConv = async (id: string) => {
    const deletingActive = sessionId === id || convId === id;
    try {
      await deleteProjectConversation(projectId, id);
      const list = await listProjectConversations(projectId);
      setConversations(list);
      if (!deletingActive) return;

      const next = list[0]?.id ?? null;
      setConvId(next);
      setMessages([]);
      setTodos([]);
      setInterrupt(null);
      setStoredProjectConversationId(projectId, next);
      navigate(projectWorkspacePath(projectId, next), { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('sessions.deleteError'));
    }
  };

  const ensureConv = async (): Promise<string> => {
    const active = convId ?? sessionId ?? null;
    if (active) return active;
    const c = await createProjectConversation(projectId);
    setConversations((prev) => [c, ...prev]);
    navigate(projectWorkspacePath(projectId, c.id), { replace: true });
    return c.id;
  };

  const onSend = async (text: string) => {
    const cid = await ensureConv();
    const userTemp: ChatMessage = { role: 'user', content: text, id: `tmp-u-${Date.now()}` };
    const asstTemp: ChatMessage = { role: 'assistant', content: '', streamParts: [], id: `tmp-a-${Date.now()}` };
    const asstStreamId = asstTemp.id!;
    setMessages((prev) => [...prev, userTemp, asstTemp]);
    setLoading(true);
    setInterrupt(null);
    streamingRef.current = true;
    try {
      await postProjectMessageStream(
        projectId,
        cid,
        text,
        { mode: planMode ? 'plan' : 'agent' },
        (ev) => {
          if (ev.type === 'delta') {
            if (!ev.t) return;
            setMessages((prev) =>
              prev.map((p) =>
                p.id === asstStreamId && p.role === 'assistant'
                  ? {
                      ...p,
                      content: p.content + ev.t,
                      streamParts: appendDeltaToStreamParts(p.streamParts, ev.t),
                    }
                  : p,
              ),
            );
          } else if (ev.type === 'tool_start') {
            setMessages((prev) =>
              prev.map((p) => {
                if (p.id !== asstStreamId || p.role !== 'assistant') return p;
                const parts = p.streamParts ?? [];
                const { next, updated } = updateToolInParts(parts, ev.run_id, (s) => ({
                  ...s,
                  name: ev.name,
                  input: ev.input,
                  status: 'running' as const,
                }));
                return {
                  ...p,
                  streamParts: updated
                    ? next
                    : [
                        ...parts,
                        {
                          type: 'tool' as const,
                          step: {
                            runId: ev.run_id,
                            name: ev.name,
                            input: ev.input,
                            status: 'running' as const,
                          },
                        },
                      ],
                };
              }),
            );
          } else if (ev.type === 'tool_end') {
            setMessages((prev) =>
              prev.map((p) => {
                if (p.id !== asstStreamId || p.role !== 'assistant') return p;
                const { next } = updateToolInParts(p.streamParts ?? [], ev.run_id, (s) => ({
                  ...s,
                  output: ev.output,
                  status: 'ok' as const,
                }));
                return { ...p, streamParts: next };
              }),
            );
          } else if (ev.type === 'tool_error') {
            setMessages((prev) =>
              prev.map((p) => {
                if (p.id !== asstStreamId || p.role !== 'assistant') return p;
                const { next, updated } = updateToolInParts(p.streamParts ?? [], ev.run_id, (s) => ({
                  ...s,
                  error: ev.error,
                  status: 'err' as const,
                }));
                return {
                  ...p,
                  streamParts: updated
                    ? next
                    : [
                        ...(p.streamParts ?? []),
                        {
                          type: 'tool' as const,
                          step: {
                            runId: ev.run_id,
                            name: ev.name,
                            error: ev.error,
                            status: 'err' as const,
                          },
                        },
                      ],
                };
              }),
            );
          } else if (ev.type === 'subagent_start') {
            setMessages((prev) =>
              prev.map((p) =>
                p.id === asstStreamId && p.role === 'assistant'
                  ? {
                      ...p,
                      streamParts: appendSubagentStart(
                        p.streamParts,
                        parseSubagentLabel(ev.name),
                      ),
                    }
                  : p,
              ),
            );
          } else if (ev.type === 'subagent_end') {
            setMessages((prev) =>
              prev.map((p) =>
                p.id === asstStreamId && p.role === 'assistant'
                  ? { ...p, streamParts: completeSubagent(p.streamParts) }
                  : p,
              ),
            );
          } else if (ev.type === 'todo') {
            setTodos(ev.todos);
          } else if (ev.type === 'interrupt') {
            setInterrupt(JSON.stringify(ev.interrupt ?? {}));
          } else if (ev.type === 'fatal') {
            toast.error(ev.message);
          } else if (ev.type === 'user') {
            setMessages((prev) =>
              prev.map((p) =>
                p.id === userTemp.id
                  ? { ...p, id: ev.message.id, content: ev.message.content }
                  : p,
              ),
            );
          } else if (ev.type === 'done') {
            setMessages((prev) =>
              prev.map((p) => {
                if (p.id !== asstStreamId) return p;
                const historyParts = assistantHistoryStreamParts(
                  ev.assistant.content,
                  ev.assistant.tool_calls,
                );
                return {
                  role: 'assistant',
                  content: ev.assistant.content,
                  id: ev.assistant.id,
                  streamParts:
                    p.streamParts && p.streamParts.length > 0 ? p.streamParts : historyParts,
                };
              }),
            );
          }
        },
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

  const onInterruptApprove = async () => {
    if (!convId) return;
    setLoading(true);
    try {
      await resumeProjectInterrupt(projectId, convId, { decision: 'approve' });
      setInterrupt(null);
      await loadMessages(convId);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  const onInterruptReject = async () => {
    if (!convId) return;
    setLoading(true);
    try {
      await resumeProjectInterrupt(projectId, convId, { decision: 'reject' });
      setInterrupt(null);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!project) return <AgentsWorkspaceSkeleton />;

  const activeConv = conversations.find((c) => c.id === convId);
  const sessionTitle = activeConv
    ? activeConv.title?.trim() || new Date(activeConv.updated_at).toLocaleDateString()
    : null;

  const filesRailWidth = clampFilesRailWidth(filesRailWidthPx);

  return (
    <div className="agents-workspace">
      <div className="agents-workspace-body" ref={bodyRef}>
        <AgentSessionSidebar
          backLabel={t('sessions.back')}
          backHref="/agents"
          contextTitle={project.name}
          contextSubtitle={project.description?.trim() || project.slug}
          settingsHref={`/projects/${projectId}/settings`}
          sessionHref={(id) => projectWorkspacePath(projectId, id)}
          conversations={conversations}
          activeId={convId}
          onNewChat={onNewChat}
          onRename={onRenameConv}
          onAutoRename={onAutoRenameConv}
          onDelete={onDeleteConv}
        />
        <AgentChatMain
          sessionTitle={sessionTitle}
          messages={messages}
          loading={loading}
          planMode={planMode}
          onPlanModeChange={setPlanMode}
          onSend={onSend}
          todos={todos}
          interruptSummary={interrupt}
          onInterruptApprove={interrupt ? onInterruptApprove : undefined}
          onInterruptReject={interrupt ? onInterruptReject : undefined}
        />
        <div
          className="agents-pane-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={filesRailWidth}
          aria-valuemin={FILES_RAIL_MIN_PX}
          aria-valuemax={clampFilesRailWidth(9999)}
          aria-label={t('workspace.resizeFilesRail')}
          title={t('workspace.resizeFilesRailHint')}
          onMouseDown={onFilesRailResizePointerDown}
        />
        <AgentFilesPanel
          projectId={projectId}
          gitInitialized={project.git_initialized}
          onGitChange={loadProject}
          railWidthPx={filesRailWidth}
        />
      </div>
    </div>
  );
}
