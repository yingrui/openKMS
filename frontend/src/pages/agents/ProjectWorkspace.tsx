import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AgentChatMain, type ChatMessage } from '../../components/agents/AgentChatMain';
import { AgentFilesPanel } from '../../components/agents/AgentFilesPanel';
import { AgentSessionSidebar } from '../../components/agents/AgentSessionSidebar';
import { AgentSettingsPanel } from '../../components/agents/AgentSettingsPanel';
import {
  appendDeltaToStreamParts,
  updateToolInParts,
} from '../../components/wiki/wikiCopilotStreamParts';
import type { AgentConversationResponse } from '../../data/agentApi';
import {
  createProjectConversation,
  deleteProjectConversation,
  getProject,
  getStoredProjectConversationId,
  listProjectConversations,
  listProjectMessages,
  postProjectMessageStream,
  resumeProjectInterrupt,
  setStoredProjectConversationId,
  type ProjectResponse,
} from '../../data/projectsApi';
import '../../components/agents/AgentsWorkspace.scss';

export function ProjectWorkspace() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { t } = useTranslation('agents');
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [conversations, setConversations] = useState<AgentConversationResponse[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [todos, setTodos] = useState<unknown[]>([]);
  const [interrupt, setInterrupt] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadProject = useCallback(async () => {
    const p = await getProject(projectId);
    setProject(p);
  }, [projectId]);

  const loadConversations = useCallback(async () => {
    const list = await listProjectConversations(projectId);
    setConversations(list);
    const stored = getStoredProjectConversationId(projectId);
    const pick = stored && list.some((c) => c.id === stored) ? stored : list[0]?.id ?? null;
    setConvId(pick);
    setStoredProjectConversationId(projectId, pick);
  }, [projectId]);

  const loadMessages = useCallback(async (id: string) => {
    const items = await listProjectMessages(projectId, id);
    setMessages(
      items.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        id: m.id,
      })),
    );
  }, [projectId]);

  useEffect(() => {
    loadProject().catch((e) => toast.error(String(e)));
    loadConversations().catch((e) => toast.error(String(e)));
  }, [loadProject, loadConversations]);

  useEffect(() => {
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
    setConvId(c.id);
    setStoredProjectConversationId(projectId, c.id);
    setMessages([]);
  };

  const onSelectConv = (id: string) => {
    setConvId(id);
    setStoredProjectConversationId(projectId, id);
  };

  const onDeleteConv = async () => {
    if (!convId) return;
    await deleteProjectConversation(projectId, convId);
    const list = await listProjectConversations(projectId);
    setConversations(list);
    const next = list[0]?.id ?? null;
    setConvId(next);
    setStoredProjectConversationId(projectId, next);
  };

  const ensureConv = async (): Promise<string> => {
    if (convId) return convId;
    const c = await createProjectConversation(projectId);
    setConversations((prev) => [c, ...prev]);
    setConvId(c.id);
    setStoredProjectConversationId(projectId, c.id);
    return c.id;
  };

  const onSend = async (text: string) => {
    const cid = await ensureConv();
    const userTemp: ChatMessage = { role: 'user', content: text, id: `tmp-u-${Date.now()}` };
    const asstTemp: ChatMessage = { role: 'assistant', content: '', streamParts: [], id: `tmp-a-${Date.now()}` };
    setMessages((prev) => [...prev, userTemp, asstTemp]);
    setLoading(true);
    setInterrupt(null);
    try {
      await postProjectMessageStream(
        projectId,
        cid,
        text,
        { mode: planMode ? 'plan' : 'agent' },
        (ev) => {
          if (ev.type === 'delta') {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === 'assistant') {
                last.content += ev.t;
                last.streamParts = appendDeltaToStreamParts(last.streamParts ?? [], ev.t);
              }
              return copy;
            });
          } else if (ev.type === 'tool_start') {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === 'assistant') {
                const parts = last.streamParts ?? [];
                const { next, updated } = updateToolInParts(parts, ev.run_id, (s) => ({
                  ...s,
                  name: ev.name,
                  input: ev.input,
                  status: 'running',
                }));
                if (!updated) {
                  last.streamParts = [
                    ...parts,
                    { type: 'tool', step: { runId: ev.run_id, name: ev.name, input: ev.input, status: 'running' } },
                  ];
                } else {
                  last.streamParts = next;
                }
              }
              return copy;
            });
          } else if (ev.type === 'tool_end') {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === 'assistant') {
                const { next } = updateToolInParts(last.streamParts ?? [], ev.run_id, (s) => ({
                  ...s,
                  output: ev.output,
                  status: 'ok',
                }));
                last.streamParts = next;
              }
              return copy;
            });
          } else if (ev.type === 'todo') {
            setTodos(ev.todos);
          } else if (ev.type === 'interrupt') {
            setInterrupt(JSON.stringify(ev.interrupt ?? {}));
          } else if (ev.type === 'fatal') {
            toast.error(ev.message);
          } else if (ev.type === 'user') {
            setMessages((prev) => {
              const copy = prev.filter((m) => m.id !== userTemp.id);
              return [...copy, { role: 'user', content: ev.message.content, id: ev.message.id }];
            });
          } else if (ev.type === 'done') {
            setMessages((prev) => {
              const copy = prev.filter((m) => m.id !== asstTemp.id);
              return [...copy, { role: 'assistant', content: ev.assistant.content, id: ev.assistant.id }];
            });
          }
        },
      );
      await loadConversations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('chat.error'));
    } finally {
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

  if (!project) return <div className="page-loading">{t('loading')}</div>;

  const activeConv = conversations.find((c) => c.id === convId);
  const sessionTitle = activeConv
    ? activeConv.title?.trim() || new Date(activeConv.updated_at).toLocaleDateString()
    : null;

  return (
    <div className="agents-workspace">
      <div className="agents-workspace-body">
        <AgentSessionSidebar
          projectName={project.name}
          projectSlug={project.slug}
          conversations={conversations}
          activeId={convId}
          onSelect={onSelectConv}
          onNewChat={onNewChat}
          onOpenSettings={() => setSettingsOpen(true)}
          onDelete={convId ? onDeleteConv : undefined}
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
        <AgentFilesPanel
          projectId={projectId}
          gitInitialized={project.git_initialized}
          onGitChange={loadProject}
        />
      </div>
      {settingsOpen ? (
        <AgentSettingsPanel
          projectId={projectId}
          settings={project.settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => setProject((p) => (p ? { ...p, settings: s } : p))}
        />
      ) : null}
    </div>
  );
}
