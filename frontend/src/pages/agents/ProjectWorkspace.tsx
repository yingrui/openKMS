import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, FolderTree, MessagesSquare, Settings } from 'lucide-react';
import { AgentChatMain } from '../../components/agents/AgentChatMain';
import { AgentFilesPanel } from '../../components/agents/AgentFilesPanel';
import { AgentSessionSidebar } from '../../components/agents/AgentSessionSidebar';
import { AgentsWorkspaceSkeleton } from '../../components/agents/AgentsPageSkeleton';
import { getProject } from '../../data/projectsApi';
import type { ProjectResponse } from '../../data/projectsApi';
import { useIsMobile } from '../../hooks/useIsMobile';
import { PanelToolbar } from '../../styles/design-system';
import { useProjectAgentStream } from './useProjectAgentStream';
import { useProjectSessionRouting } from './useProjectSessionRouting';
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
  const isMobile = useIsMobile();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [planMode, setPlanMode] = useState(false);
  const [filesRailWidthPx, setFilesRailWidthPx] = useState(readFilesRailWidth);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const session = useProjectSessionRouting(projectId, sessionId);
  // Live NDJSON vs durable poll: stream.loading = browser stream; turnInProgress = server last_turn.
  const stream = useProjectAgentStream({
    projectId,
    convId: session.convId,
    activeConv: session.activeConv,
    planMode,
    messages: session.messages,
    setMessages: session.setMessages,
    refreshConversations: session.refreshConversations,
    loadMessages: session.loadMessages,
    ensureConv: session.ensureConv,
    beginLiveStream: session.beginLiveStream,
    endLiveStream: session.endLiveStream,
    turnInProgress: session.turnInProgress,
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
    if (isMobile) return;
    const onResize = () => setFilesRailWidthPx((w) => clampFilesRailWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampFilesRailWidth, isMobile]);

  useEffect(() => {
    document.body.classList.add('openkms-agents-fullpage');
    return () => document.body.classList.remove('openkms-agents-fullpage');
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setSessionsOpen(false);
      setFilesOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || (!sessionsOpen && !filesOpen)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSessionsOpen(false);
        setFilesOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, sessionsOpen, filesOpen]);

  useEffect(() => {
    setSessionsOpen(false);
  }, [sessionId]);

  const openSessions = () => {
    setFilesOpen(false);
    setSessionsOpen(true);
  };

  const openFiles = () => {
    setSessionsOpen(false);
    setFilesOpen(true);
  };

  const closeOverlays = () => {
    setSessionsOpen(false);
    setFilesOpen(false);
  };

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
    void session.onDeleteConv(id, t('sessions.deleteError')).then((result) => {
      if (result?.deletedActive) stream.clearStreamUi();
    });
  };

  if (!project) return <AgentsWorkspaceSkeleton />;

  const filesRailWidth = clampFilesRailWidth(filesRailWidthPx);
  const toolbarTitle = session.sessionTitle?.trim() || project.name;

  const chat = (
    <AgentChatMain
      sessionTitle={session.sessionTitle}
      messages={session.messages}
      loading={stream.loading || session.turnInProgress}
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
      hasMoreOlder={session.hasMoreOlder}
      loadingOlder={session.loadingOlder}
      onLoadOlderMessages={
        session.convId
          ? () => session.loadOlderMessages(session.convId!)
          : undefined
      }
      hideSessionHeader={isMobile}
    />
  );

  const sidebar = (
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
      onSessionActivate={isMobile ? closeOverlays : undefined}
      hideBackLink={isMobile}
    />
  );

  return (
    <div className={`agents-workspace${isMobile ? ' agents-workspace--mobile' : ''}`}>
      {isMobile ? (
        <PanelToolbar
          as="div"
          className="agents-mobile-toolbar"
          leading={
            <>
              <Link to="/agents" className="agents-mobile-back" aria-label={t('sessions.back')}>
                <ArrowLeft size={18} />
                <span className="ds-compact-label">{t('sessions.back')}</span>
              </Link>
              <span className="agents-mobile-title" title={toolbarTitle}>
                {toolbarTitle}
              </span>
            </>
          }
          actions={
            <>
              <button
                type="button"
                className={`agents-mobile-chrome-btn${sessionsOpen ? ' is-active' : ''}`}
                onClick={() => (sessionsOpen ? closeOverlays() : openSessions())}
                aria-expanded={sessionsOpen}
                aria-controls="agents-sessions-drawer"
              >
                <MessagesSquare size={18} aria-hidden />
                <span className="ds-compact-label">{t('workspace.sessions')}</span>
              </button>
              <button
                type="button"
                className={`agents-mobile-chrome-btn${filesOpen ? ' is-active' : ''}`}
                onClick={() => (filesOpen ? closeOverlays() : openFiles())}
                aria-expanded={filesOpen}
                aria-controls="agents-files-sheet"
              >
                <FolderTree size={18} aria-hidden />
                <span className="ds-compact-label">{t('workspace.files')}</span>
              </button>
              <Link
                to={`/projects/${projectId}/settings`}
                className="agents-mobile-chrome-btn"
                aria-label={t('settings.title')}
                title={t('settings.title')}
              >
                <Settings size={18} aria-hidden />
                <span className="ds-compact-label">{t('settings.title')}</span>
              </Link>
            </>
          }
        />
      ) : null}

      <div className="agents-workspace-body" ref={bodyRef}>
        {isMobile ? (
          <>
            <div
              id="agents-sessions-drawer"
              className={`agents-sessions-drawer${sessionsOpen ? ' is-open' : ''}`}
              aria-hidden={!sessionsOpen}
            >
              {sidebar}
            </div>
            {chat}
            <div
              id="agents-files-sheet"
              className={`agents-files-sheet${filesOpen ? ' is-open' : ''}`}
              aria-hidden={!filesOpen}
            >
              {filesOpen ? (
                <AgentFilesPanel
                  projectId={projectId}
                  gitInitialized={project.git_initialized}
                  onGitChange={loadProject}
                  railWidthPx={filesRailWidth}
                  variant="sheet"
                  onCloseSheet={closeOverlays}
                />
              ) : null}
            </div>
          </>
        ) : (
          <>
            {sidebar}
            {chat}
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
          </>
        )}
      </div>
    </div>
  );
}
