import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AgentChatMain } from '../../components/agents/AgentChatMain';
import { AgentFilesPanel } from '../../components/agents/AgentFilesPanel';
import { AgentSessionSidebar } from '../../components/agents/AgentSessionSidebar';
import { AgentsWorkspaceSkeleton } from '../../components/agents/AgentsPageSkeleton';
import { getProject } from '../../data/projectsApi';
import type { ProjectResponse } from '../../data/projectsApi';
import { useProjectAgentStream } from './useProjectAgentStream';
import { useProjectSessionRouting } from './useProjectSessionRouting';
import { ContentCommentsShell } from '../../components/comments/ContentCommentsShell';
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
  const { t } = useTranslation('agents');
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [planMode, setPlanMode] = useState(false);
  const [filesRailWidthPx, setFilesRailWidthPx] = useState(readFilesRailWidth);
  const bodyRef = useRef<HTMLDivElement>(null);

  const session = useProjectSessionRouting(projectId, sessionId);
  const stream = useProjectAgentStream({
    projectId,
    convId: session.convId,
    planMode,
    messages: session.messages,
    setMessages: session.setMessages,
    loadConversations: session.loadConversations,
    loadMessages: session.loadMessages,
    ensureConv: session.ensureConv,
    streamingRef: session.streamingRef,
    t,
  });

  const clampFilesRailWidth = useCallback((w: number) => {
    const bodyW = bodyRef.current?.clientWidth ?? window.innerWidth;
    const max = Math.max(FILES_RAIL_MIN_PX, bodyW - SESSIONS_WIDTH_PX - CHAT_MIN_PX - 8);
    return Math.round(Math.min(max, Math.max(FILES_RAIL_MIN_PX, w)));
  }, []);

  useEffect(() => {
    getProject(projectId)
      .then(setProject)
      .catch((e) => toast.error(String(e)));
  }, [projectId]);

  useEffect(() => {
    const onResize = () => setFilesRailWidthPx((w) => clampFilesRailWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampFilesRailWidth]);

  useEffect(() => {
    document.body.classList.add('openkms-agents-fullpage');
    return () => document.body.classList.remove('openkms-agents-fullpage');
  }, []);

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

  const onFilesRailWidthFromPanel = useCallback(
    (width: number) => {
      const next = clampFilesRailWidth(width);
      setFilesRailWidthPx(next);
      try {
        localStorage.setItem(FILES_RAIL_WIDTH_KEY, String(next));
      } catch {
        /* ignore */
      }
    },
    [clampFilesRailWidth],
  );

  const loadProject = useCallback(async () => {
    setProject(await getProject(projectId));
  }, [projectId]);

  const onDeleteConv = (id: string) => {
    const deletingActive = sessionId === id || session.convId === id;
    void session.onDeleteConv(id, t('sessions.deleteError')).then((list) => {
      if (list != null && deletingActive) stream.clearStreamUi();
    });
  };

  if (!project) return <AgentsWorkspaceSkeleton />;

  const filesRailWidth = clampFilesRailWidth(filesRailWidthPx);

  return (
    <ContentCommentsShell resourceType="project" resourceId={projectId}>
    <div className="agents-workspace">
      <div className="agents-workspace-body" ref={bodyRef}>
        <AgentSessionSidebar
          projectId={projectId}
          projectName={project.name}
          projectSlug={project.description?.trim() || project.slug}
          conversations={session.conversations}
          activeId={session.convId}
          onNewChat={session.onNewChat}
          onRename={(id, title) => void session.onRenameConv(id, title, t('sessions.renameError'))}
          onAutoRename={(id) => void session.onAutoRenameConv(id, t('sessions.autoRenameError'))}
          onDelete={onDeleteConv}
        />
        <AgentChatMain
          sessionTitle={session.sessionTitle}
          messages={session.messages}
          loading={stream.loading}
          planMode={planMode}
          onPlanModeChange={setPlanMode}
          onSend={stream.onSend}
          todos={stream.todos}
          todoRevision={stream.todoRevision}
          onDismissPlan={stream.dismissPlan}
          interruptSummary={stream.interrupt}
          interruptBusy={stream.hitlBusy}
          onInterruptApprove={stream.interrupt ? stream.onInterruptApprove : undefined}
          onInterruptReject={stream.interrupt ? stream.onInterruptReject : undefined}
          prefillInput={stream.prefillInput}
          onPrefillApplied={() => stream.setPrefillInput(null)}
          onRevertUserMessage={session.convId ? stream.onRevertUserMessage : undefined}
          reverting={stream.reverting}
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
          onRailWidthChange={onFilesRailWidthFromPanel}
        />
      </div>
    </div>
    </ContentCommentsShell>
  );
}
