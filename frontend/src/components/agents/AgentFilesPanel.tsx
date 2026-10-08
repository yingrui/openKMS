import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Folder,
  File,
  FolderUp,
  Upload,
  GitBranch,
  Loader2,
  RefreshCw,
  ChevronLeft,
  Trash2,
  X,
  FileDiff,
  History,
  Check,
  Plus,
  Minus,
  Undo2,
  ChevronDown,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { AgentFileViewer } from './AgentFileViewer';
import { AgentDiffViewer } from './AgentDiffViewer';
import { gitStatusLabel } from './gitStatusLabel';
import {
  getProjectFileContent,
  getProjectSettings,
  gitCommit,
  gitDiff,
  gitDiscard,
  gitInit,
  gitLog,
  gitPull,
  gitPush,
  gitStage,
  gitStatus,
  gitUnstage,
  deleteProjectFile,
  listProjectFiles,
  uploadProjectFiles,
  type GitLogEntry,
  type GitStatusEntry,
  type ProjectFileEntry,
} from '../../data/projectsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import './AgentsWorkspace.scss';

const TREE_MIN_PX = 160;
const TREE_MAX_PX = 480;
const TREE_DEFAULT_PX = 240;
const VIEWER_MIN_PX = 160;
const VIEWER_DEFAULT_PX = 480;
const INNER_HANDLE_PX = 8;
const TREE_WIDTH_KEY = 'openkms_agents_files_tree_width_px_v1';
const VIEWER_WIDTH_KEY = 'openkms_agents_files_viewer_width_px_v1';

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 2_592_000_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  if (abs < 31_536_000_000) return rtf.format(Math.round(diff / 2_592_000_000), 'month');
  return rtf.format(Math.round(diff / 31_536_000_000), 'year');
}

function readTreeWidth(): number {
  try {
    const raw = localStorage.getItem(TREE_WIDTH_KEY);
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    /* ignore */
  }
  return TREE_DEFAULT_PX;
}

function readViewerWidth(): number {
  try {
    const raw = localStorage.getItem(VIEWER_WIDTH_KEY);
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    /* ignore */
  }
  return VIEWER_DEFAULT_PX;
}

function clampTreeWidth(w: number, totalRailPx: number, viewerWidthPx: number): number {
  const max = Math.max(TREE_MIN_PX, totalRailPx - viewerWidthPx - INNER_HANDLE_PX);
  return Math.round(Math.min(Math.min(TREE_MAX_PX, max), Math.max(TREE_MIN_PX, w)));
}

function parentPath(cwd: string): string {
  const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!norm) return '';
  const i = norm.lastIndexOf('/');
  return i === -1 ? '' : norm.slice(0, i);
}

function isPathUnder(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

/** Block delete for openKMS-managed dirs only; files under them (e.g. legacy config.json) may be removed. */
function isProtectedProjectPath(path: string): boolean {
  const norm = path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  return norm === '.openkms' || norm === '.openkms/skills';
}

interface Props {
  projectId: string;
  gitInitialized: boolean;
  railWidthPx: number;
  onRailWidthChange?: (width: number) => void;
  onGitChange?: () => void;
  /** Desktop side rail vs mobile bottom sheet (no fixed flex widths / resize). */
  variant?: 'rail' | 'sheet';
  onCloseSheet?: () => void;
}

export function AgentFilesPanel({
  projectId,
  gitInitialized,
  railWidthPx,
  onRailWidthChange,
  onGitChange,
  variant = 'rail',
  onCloseSheet,
}: Props) {
  const { t } = useTranslation('agents');
  const confirm = useConfirm();
  const [cwd, setCwd] = useState('');
  const [entries, setEntries] = useState<ProjectFileEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBinary, setPreviewBinary] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [gitEntries, setGitEntries] = useState<GitStatusEntry[]>([]);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [gitAhead, setGitAhead] = useState<number | null>(null);
  const [gitBehind, setGitBehind] = useState<number | null>(null);
  const [gitRemoteUrl, setGitRemoteUrl] = useState<string | null>(null);
  const [gitCredentialId, setGitCredentialId] = useState<string | null>(null);
  const [lastCommit, setLastCommit] = useState<GitLogEntry | null>(null);
  const [gitLogEntries, setGitLogEntries] = useState<GitLogEntry[]>([]);
  const [panelMode, setPanelMode] = useState<'files' | 'scm'>('files');
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const commitMenuRef = useRef<HTMLDivElement>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [diffPath, setDiffPath] = useState<string | null>(null);
  const [diffText, setDiffText] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);
  const uploadFilesRef = useRef<HTMLInputElement>(null);
  const uploadFolderRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [treeWidthPx, setTreeWidthPx] = useState(readTreeWidth);
  const [viewerWidthPx, setViewerWidthPx] = useState(readViewerWidth);

  useEffect(() => {
    if (!uploadMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (uploadMenuRef.current?.contains(e.target as Node)) return;
      setUploadMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [uploadMenuOpen]);

  useEffect(() => {
    if (!commitMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (commitMenuRef.current?.contains(e.target as Node)) return;
      setCommitMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [commitMenuOpen]);

  const fileOpen = selected !== null;

  useEffect(() => {
    if (!fileOpen) {
      setTreeWidthPx(railWidthPx);
    }
  }, [railWidthPx, fileOpen]);

  useEffect(() => {
    if (!fileOpen) return;
    const viewerW = Math.max(VIEWER_MIN_PX, railWidthPx - treeWidthPx - INNER_HANDLE_PX);
    setViewerWidthPx(viewerW);
  }, [railWidthPx, fileOpen, treeWidthPx]);

  const onTreeResizePointerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = treeWidthPx;
      const startViewerW = viewerWidthPx;
      let latest = startW;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      const onMove = (ev: MouseEvent) => {
        latest = clampTreeWidth(startW - (ev.clientX - startX), startW + startViewerW + INNER_HANDLE_PX, startViewerW);
        setTreeWidthPx(latest);
        onRailWidthChange?.(latest + startViewerW + INNER_HANDLE_PX);
      };
      const onUp = () => {
        document.body.style.userSelect = prevUserSelect;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const finalTree = clampTreeWidth(latest, latest + startViewerW + INNER_HANDLE_PX, startViewerW);
        const finalRail = finalTree + startViewerW + INNER_HANDLE_PX;
        setTreeWidthPx(finalTree);
        onRailWidthChange?.(finalRail);
        try {
          localStorage.setItem(TREE_WIDTH_KEY, String(finalTree));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [treeWidthPx, viewerWidthPx, onRailWidthChange],
  );

  const refresh = useCallback(async () => {
    const data = await listProjectFiles(projectId, cwd);
    setEntries(data.entries);
    if (gitInitialized) {
      const st = await gitStatus(projectId);
      setGitEntries(st.entries);
      setGitBranch(st.branch);
      setGitAhead(st.ahead);
      setGitBehind(st.behind);
      setGitRemoteUrl(st.remote_url);
      const log = await gitLog(projectId);
      setGitLogEntries(log.entries);
      setLastCommit(log.entries[0] ?? null);
      try {
        const settings = await getProjectSettings(projectId);
        const gitCfg = settings.git;
        const cid =
          gitCfg && typeof gitCfg === 'object' && 'credential_id' in gitCfg
            ? (gitCfg as { credential_id?: string }).credential_id ?? null
            : null;
        setGitCredentialId(cid);
      } catch {
        setGitCredentialId(null);
      }
    } else {
      setGitEntries([]);
      setGitBranch(null);
      setGitAhead(null);
      setGitBehind(null);
      setGitRemoteUrl(null);
      setGitCredentialId(null);
      setLastCommit(null);
      setGitLogEntries([]);
      setPanelMode('files');
    }
  }, [projectId, cwd, gitInitialized]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  /** Split porcelain codes: index column = staged, worktree column = unstaged. */
  const { stagedFiles, unstagedFiles } = useMemo(() => {
    const staged: GitStatusEntry[] = [];
    const unstaged: GitStatusEntry[] = [];
    for (const e of gitEntries) {
      const code = e.status.length >= 2 ? e.status : ` ${e.status}`;
      const index = code[0];
      const worktree = code[1];
      if (code === '??' || code === '!!') {
        unstaged.push(e);
        continue;
      }
      if (index !== ' ' && index !== '?') staged.push(e);
      if (worktree !== ' ') unstaged.push(e);
    }
    return { stagedFiles: staged, unstagedFiles: unstaged };
  }, [gitEntries]);

  const gitBadge = (path: string) => {
    const e = gitEntries.find((x) => x.path === path || x.path.endsWith('/' + path));
    if (!e?.status) return null;
    const mapped = gitStatusLabel(e.status);
    if (!mapped) return null;
    return {
      short: mapped.short,
      title: t(`files.gitStatus.${mapped.title}`, { defaultValue: mapped.title }),
    };
  };

  const closeFile = () => {
    if (fileOpen) {
      const treeW = treeWidthPx;
      const viewerW = Math.max(VIEWER_MIN_PX, railWidthPx - treeW - INNER_HANDLE_PX);
      try {
        localStorage.setItem(VIEWER_WIDTH_KEY, String(viewerW));
      } catch {
        /* ignore */
      }
      onRailWidthChange?.(treeW);
      try {
        localStorage.setItem(TREE_WIDTH_KEY, String(treeW));
      } catch {
        /* ignore */
      }
    }
    setSelected(null);
    setPreview(null);
    setPreviewBinary(false);
    setPreviewLoading(false);
    setDiffPath(null);
    setDiffText('');
  };

  /** First open widens the rail so the viewer pane has room; reused by files and diffs. */
  const beginOpenPane = () => {
    if (selected !== null) return;
    const treeW = railWidthPx;
    const viewerW = readViewerWidth();
    setTreeWidthPx(treeW);
    setViewerWidthPx(viewerW);
    onRailWidthChange?.(treeW + viewerW + INNER_HANDLE_PX);
  };

  const openFile = async (path: string, isDir: boolean) => {
    if (isDir) {
      setCwd(path);
      closeFile();
      return;
    }
    beginOpenPane();
    setDiffPath(null);
    setDiffText('');
    setSelected(path);
    setPreviewLoading(true);
    setPreview(null);
    try {
      const data = await getProjectFileContent(projectId, path);
      setPreviewBinary(data.is_binary);
      setPreview(
        data.is_binary ? t('files.binaryPreview', { size: data.size }) : (data.content ?? ''),
      );
    } catch {
      setPreview(t('files.loadError'));
      setPreviewBinary(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openDiff = async (path: string, staged: boolean) => {
    beginOpenPane();
    setSelected(path);
    setDiffPath(path);
    setDiffText('');
    setDiffLoading(true);
    setPreview(null);
    setPreviewBinary(false);
    setPreviewLoading(false);
    try {
      const data = await gitDiff(projectId, path, staged);
      setDiffText(data.diff);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('files.diffError'));
    } finally {
      setDiffLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('files.refreshError'));
    } finally {
      setRefreshing(false);
    }
  };

  const goUp = () => {
    setCwd(parentPath(cwd));
    closeFile();
  };

  const onDeleteEntry = async (entry: ProjectFileEntry, ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (isProtectedProjectPath(entry.path)) {
      toast.error(t('files.deleteProtected'));
      return;
    }
    const msg = entry.is_dir
      ? t('files.deleteFolderConfirm', { name: entry.name })
      : t('files.deleteFileConfirm', { name: entry.name });
    const title = entry.is_dir ? t('files.deleteFolder') : t('files.deleteFile');
    if (!(await confirm({ title, message: msg, danger: true }))) return;

    setDeletingPath(entry.path);
    try {
      await deleteProjectFile(projectId, entry.path);
      if (selected && isPathUnder(selected, entry.path)) {
        closeFile();
      }
      if (isPathUnder(cwd, entry.path)) {
        setCwd(parentPath(entry.path));
      }
      await refresh();
      toast.success(t('files.deleteSuccess', { name: entry.name }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('files.deleteError'));
    } finally {
      setDeletingPath(null);
    }
  };

  const onUploadPick = async (files: FileList | null, folderPick: boolean) => {
    setUploadMenuOpen(false);
    const list = files ? Array.from(files) : [];
    if (uploadFilesRef.current) uploadFilesRef.current.value = '';
    if (uploadFolderRef.current) uploadFolderRef.current.value = '';
    if (list.length === 0) return;

    setUploading(true);
    try {
      const { uploaded, failed } = await uploadProjectFiles(projectId, list, cwd, folderPick);
      await refresh();
      if (uploaded > 0) {
        toast.success(
          folderPick
            ? t('files.uploadFolderSuccess', { count: uploaded })
            : t('files.uploadSuccess', { count: uploaded }),
        );
      }
      if (failed > 0) {
        toast.error(t('files.uploadPartialError', { failed, total: list.length }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('files.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  const onGitInit = async () => {
    await gitInit(projectId);
    onGitChange?.();
    await refresh();
    setPanelMode('scm');
  };

  const onCommit = async (opts: { stageAll?: boolean; push?: boolean } = {}) => {
    if (!commitMsg.trim() || committing) return;
    setCommitting(true);
    try {
      await gitCommit(projectId, commitMsg.trim(), { stageAll: opts.stageAll });
      setCommitMsg('');
      if (opts.push) {
        if (!gitCredentialId) {
          toast.error(t('files.pushNeedsCredential'));
        } else {
          await gitPush(projectId, gitCredentialId);
        }
      }
      toast.success(t('files.commitSuccess'));
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('files.commitError'));
    } finally {
      setCommitting(false);
      setCommitMenuOpen(false);
    }
  };

  const onSync = async (dir: 'pull' | 'push') => {
    if (!gitCredentialId || syncing) return;
    setSyncing(true);
    try {
      if (dir === 'pull') {
        await gitPull(projectId, gitCredentialId);
        toast.success(t('files.pullSuccess'));
      } else {
        await gitPush(projectId, gitCredentialId);
        toast.success(t('files.pushSuccess'));
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('files.syncError'));
    } finally {
      setSyncing(false);
    }
  };

  const onStageToggle = async (path: string, staged: boolean) => {
    if (busyPath) return;
    setBusyPath(path);
    try {
      if (staged) await gitUnstage(projectId, [path]);
      else await gitStage(projectId, [path]);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('files.stageError'));
    } finally {
      setBusyPath(null);
    }
  };

  const onDiscard = async (path: string) => {
    if (busyPath) return;
    if (!(await confirm({ title: t('files.discard'), message: t('files.discardConfirm', { path }), danger: true }))) {
      return;
    }
    setBusyPath(path);
    try {
      await gitDiscard(projectId, [path]);
      if (diffPath === path) closeFile();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('files.discardError'));
    } finally {
      setBusyPath(null);
    }
  };

  const onStageAll = async () => {
    if (busyPath) return;
    setBusyPath('*');
    try {
      await gitStage(
        projectId,
        unstagedFiles.map((e) => e.path),
      );
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('files.stageError'));
    } finally {
      setBusyPath(null);
    }
  };

  const onUnstageAll = async () => {
    if (busyPath) return;
    setBusyPath('*');
    try {
      await gitUnstage(
        projectId,
        stagedFiles.map((e) => e.path),
      );
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('files.stageError'));
    } finally {
      setBusyPath(null);
    }
  };

  const openChangedPath = (path: string, staged: boolean) => {
    void openDiff(path, staged);
  };

  const renderScmRow = (e: GitStatusEntry, staged: boolean) => {
    const mapped = gitStatusLabel(e.status);
    const title = mapped
      ? t(`files.gitStatus.${mapped.title}`, { defaultValue: mapped.title })
      : e.status;
    const short = mapped?.short ?? e.status.slice(0, 2);
    const name = e.path.split('/').pop() ?? e.path;
    const deleted = mapped?.title === 'Deleted';
    const untracked = e.status.trim() === '??';
    const busy = busyPath === e.path;
    return (
      <div
        key={`${staged ? 'i' : 'w'}:${e.status}:${e.path}`}
        className={`agents-scm-row${diffPath === e.path ? ' agents-scm-row--selected' : ''}${deleted ? ' agents-scm-row--deleted' : ''}`}
        onClick={() => openChangedPath(e.path, staged)}
        onKeyDown={(ev) => ev.key === 'Enter' && openChangedPath(e.path, staged)}
        role="button"
        tabIndex={0}
        title={e.path}
      >
        <File size={14} aria-hidden />
        <div className="agents-scm-row-label">
          <span className="agents-scm-row-name">{name}</span>
          {e.path.includes('/') ? (
            <span className="agents-scm-row-path">{e.path.slice(0, e.path.lastIndexOf('/'))}</span>
          ) : null}
        </div>
        <span className="agents-file-badge" title={title}>
          {short}
        </span>
        <span className="agents-scm-row-actions">
          <button
            type="button"
            className="agents-scm-row-btn"
            title={staged ? t('files.unstage') : t('files.stage')}
            aria-label={staged ? t('files.unstage') : t('files.stage')}
            disabled={busy}
            onClick={(ev) => {
              ev.stopPropagation();
              void onStageToggle(e.path, staged);
            }}
          >
            {busy ? (
              <Loader2 size={13} className="agents-session-more-spinner" />
            ) : staged ? (
              <Minus size={13} />
            ) : (
              <Plus size={13} />
            )}
          </button>
          {!staged && !untracked ? (
            <button
              type="button"
              className="agents-scm-row-btn"
              title={t('files.discard')}
              aria-label={t('files.discard')}
              disabled={busy}
              onClick={(ev) => {
                ev.stopPropagation();
                void onDiscard(e.path);
              }}
            >
              <Undo2 size={13} />
            </button>
          ) : null}
        </span>
      </div>
    );
  };

  const changeCount = gitEntries.length;
  const stagedCount = stagedFiles.length;
  const unstagedCount = unstagedFiles.length;
  const canPush = Boolean(gitRemoteUrl && gitCredentialId);
  const scmOpen = panelMode === 'scm' && gitInitialized;
  const uploadTargetLabel = cwd || t('files.projectRoot');
  const cwdLabel = cwd ? (cwd.split('/').pop() ?? cwd) : null;
  const headTitle = scmOpen
    ? t('files.sourceControl')
    : cwdLabel
      ? cwdLabel
      : gitInitialized
        ? t('files.changes', { count: changeCount })
        : t('files.title');
  const treeWidth = fileOpen
    ? clampTreeWidth(treeWidthPx, railWidthPx, viewerWidthPx)
    : railWidthPx;
  const isSheet = variant === 'sheet';
  const railStyle = (isSheet
    ? { flex: '1 1 auto', width: '100%', height: '100%' }
    : { flex: `0 0 ${railWidthPx}px`, width: railWidthPx }) as CSSProperties;
  const treeStyle = (isSheet
    ? { flex: '1 1 auto', width: '100%', minWidth: 0 }
    : { flex: `0 0 ${treeWidth}px`, width: treeWidth }) as CSSProperties;

  return (
    <div
      className={`agents-files-rail${fileOpen ? ' agents-files-rail--open' : ''}${isSheet ? ' agents-files-rail--sheet' : ''}`}
      style={railStyle}
    >
      {fileOpen && diffPath ? (
        <AgentDiffViewer
          path={diffPath}
          diff={diffText}
          loading={diffLoading}
          onClose={closeFile}
        />
      ) : null}
      {fileOpen && !diffPath ? (
        <AgentFileViewer
          path={selected}
          content={preview ?? ''}
          isBinary={previewBinary}
          loading={previewLoading}
          onClose={closeFile}
          onOpenWorkspaceFile={(p) => void openFile(p, false)}
        />
      ) : null}
      {fileOpen && !isSheet ? (
        <div
          className="agents-pane-resize-handle agents-pane-resize-handle--inner"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={treeWidth}
          aria-valuemin={TREE_MIN_PX}
          aria-valuemax={clampTreeWidth(TREE_MAX_PX, railWidthPx, viewerWidthPx)}
          aria-label={t('workspace.resizeFileTree')}
          title={t('workspace.resizeFileTreeHint')}
          onMouseDown={onTreeResizePointerDown}
        />
      ) : null}
      <aside
        className={`agents-files-panel${fileOpen ? ' agents-files-panel--split' : ''}`}
        style={treeStyle}
        aria-label={t('files.title')}
      >
        <div className="agents-files-head">
          <div className="agents-files-head-title-row">
            {!scmOpen && cwd ? (
              <button
                type="button"
                className="agents-files-back-btn"
                onClick={goUp}
                title={t('files.goUpHint')}
                aria-label={t('files.goUp')}
              >
                <ChevronLeft size={16} />
              </button>
            ) : null}
            <span className="agents-files-head-title" title={!scmOpen ? cwd || undefined : undefined}>
              {headTitle}
            </span>
          </div>
          <div className="agents-files-head-actions">
            {!scmOpen ? (
              <div className="agents-files-upload" ref={uploadMenuOpen ? uploadMenuRef : undefined}>
                {uploadMenuOpen ? (
                  <div className="agents-files-upload-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="agents-files-upload-menu-item"
                      disabled={uploading}
                      onClick={() => uploadFilesRef.current?.click()}
                      title={t('files.uploadFilesHint', { path: uploadTargetLabel })}
                    >
                      <Upload size={14} />
                      <span>{t('files.uploadFiles')}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="agents-files-upload-menu-item"
                      disabled={uploading}
                      onClick={() => uploadFolderRef.current?.click()}
                      title={t('files.uploadFolderHint', { path: uploadTargetLabel })}
                    >
                      <FolderUp size={14} />
                      <span>{t('files.uploadFolder')}</span>
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="agents-files-icon-btn"
                  onClick={() => setUploadMenuOpen((v) => !v)}
                  title={t('files.upload')}
                  aria-label={t('files.upload')}
                  aria-expanded={uploadMenuOpen}
                  aria-haspopup="menu"
                  disabled={uploading}
                >
                  {uploading ? <Loader2 size={15} className="agents-session-more-spinner" /> : <Upload size={15} />}
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="agents-files-icon-btn"
              onClick={() => void onRefresh()}
              title={t('files.refreshHint')}
              aria-label={t('files.refresh')}
              disabled={refreshing || uploading}
            >
              {refreshing ? (
                <Loader2 size={15} className="agents-session-more-spinner" />
              ) : (
                <RefreshCw size={15} />
              )}
            </button>
            <input
              ref={uploadFilesRef}
              type="file"
              hidden
              multiple
              onChange={(e) => void onUploadPick(e.target.files, false)}
            />
            <input
              ref={uploadFolderRef}
              type="file"
              hidden
              multiple
              {...({ webkitdirectory: '', directory: '' } as InputHTMLAttributes<HTMLInputElement>)}
              onChange={(e) => void onUploadPick(e.target.files, true)}
            />
            {!gitInitialized ? (
              <button
                type="button"
                className="agents-files-icon-btn"
                onClick={() => void onGitInit()}
                title={t('files.gitInit')}
                aria-label={t('files.gitInit')}
              >
                <GitBranch size={15} />
              </button>
            ) : (
              <button
                type="button"
                className={`agents-files-icon-btn${scmOpen ? ' agents-files-icon-btn--active' : ''}`}
                onClick={() => setPanelMode((m) => (m === 'scm' ? 'files' : 'scm'))}
                title={scmOpen ? t('files.showFiles') : t('files.sourceControl')}
                aria-label={scmOpen ? t('files.showFiles') : t('files.sourceControl')}
                aria-pressed={scmOpen}
              >
                <GitBranch size={15} />
                {changeCount > 0 ? (
                  <span className="agents-files-git-count" aria-hidden>
                    {changeCount > 99 ? '99+' : changeCount}
                  </span>
                ) : null}
              </button>
            )}
            {!scmOpen && !cwd ? (
              <span className="agents-files-all-btn agents-files-all-btn--static">{t('files.allFiles')}</span>
            ) : !scmOpen ? (
              <button
                type="button"
                className="agents-files-all-btn"
                onClick={() => {
                  setCwd('');
                  closeFile();
                }}
                title={t('files.allFilesHint')}
              >
                {t('files.allFiles')}
              </button>
            ) : (
              <button
                type="button"
                className="agents-files-all-btn"
                onClick={() => setPanelMode('files')}
                title={t('files.showFiles')}
              >
                {t('files.allFiles')}
              </button>
            )}
            {onCloseSheet ? (
              <button
                type="button"
                className="agents-files-icon-btn"
                onClick={onCloseSheet}
                aria-label={t('workspace.closeFiles')}
                title={t('workspace.closeFiles')}
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
        </div>
        {scmOpen ? (
          <div className="agents-scm">
            <div className="agents-scm-meta">
              {gitBranch ? (
                <span className="agents-scm-branch" title={gitBranch}>
                  <GitBranch size={12} aria-hidden />
                  {gitBranch}
                </span>
              ) : null}
              {gitRemoteUrl ? (
                <span className="agents-scm-sync" title={gitRemoteUrl}>
                  <button
                    type="button"
                    className="agents-scm-sync-btn"
                    disabled={!canPush || syncing}
                    title={t('files.pull')}
                    aria-label={t('files.pull')}
                    onClick={() => void onSync('pull')}
                  >
                    {syncing ? (
                      <Loader2 size={12} className="agents-session-more-spinner" />
                    ) : (
                      <ArrowDown size={12} aria-hidden />
                    )}
                    {gitBehind ?? 0}
                  </button>
                  <button
                    type="button"
                    className="agents-scm-sync-btn"
                    disabled={!canPush || syncing}
                    title={t('files.push')}
                    aria-label={t('files.push')}
                    onClick={() => void onSync('push')}
                  >
                    <ArrowUp size={12} aria-hidden />
                    {gitAhead ?? 0}
                  </button>
                </span>
              ) : null}
              <span className="agents-scm-change-count">{t('files.changes', { count: changeCount })}</span>
            </div>

            <div className="agents-scm-commit">
              <textarea
                id="agents-scm-commit-msg"
                className="agents-scm-commit-msg"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void onCommit();
                  }
                }}
                placeholder={t('files.commitMessagePlaceholder')}
                rows={2}
                disabled={committing}
              />
              <div className="agents-scm-commit-actions" ref={commitMenuRef}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary agents-scm-commit-btn"
                  disabled={committing || !commitMsg.trim() || stagedCount === 0}
                  onClick={() => void onCommit()}
                >
                  {committing ? (
                    <>
                      <Loader2 size={14} className="agents-session-more-spinner" />
                      {t('files.committing')}
                    </>
                  ) : (
                    <>
                      <Check size={14} aria-hidden />
                      {t('files.commit')}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="agents-scm-commit-more"
                  title={t('files.commitOptions')}
                  aria-label={t('files.commitOptions')}
                  aria-expanded={commitMenuOpen}
                  aria-haspopup="menu"
                  disabled={committing}
                  onClick={() => setCommitMenuOpen((v) => !v)}
                >
                  <ChevronDown size={14} aria-hidden />
                </button>
                {commitMenuOpen ? (
                  <div className="agents-scm-commit-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!commitMsg.trim() || unstagedCount === 0}
                      onClick={() => void onCommit({ stageAll: true })}
                    >
                      {t('files.commitAll')}
                    </button>
                    {canPush ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!commitMsg.trim()}
                        onClick={() => void onCommit({ stageAll: stagedCount === 0, push: true })}
                      >
                        {t('files.commitAndPush')}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={`agents-scm-changes${changeCount === 0 ? ' agents-scm-changes--empty' : ''}`}
              aria-label={t('files.changesSection')}
            >
              {changeCount === 0 ? (
                <div className="agents-scm-empty">
                  <FileDiff size={18} strokeWidth={1.4} aria-hidden />
                  <span>{t('files.noChanges')}</span>
                </div>
              ) : (
                <>
                  {stagedCount > 0 ? (
                    <div className="agents-scm-group">
                      <div className="agents-scm-group-head">
                        <span className="agents-scm-group-title">
                          {t('files.stagedChanges', { count: stagedCount })}
                        </span>
                        <button
                          type="button"
                          className="agents-scm-group-btn"
                          title={t('files.unstageAll')}
                          aria-label={t('files.unstageAll')}
                          disabled={busyPath !== null}
                          onClick={() => void onUnstageAll()}
                        >
                          <Minus size={13} aria-hidden />
                        </button>
                      </div>
                      {stagedFiles.map((e) => renderScmRow(e, true))}
                    </div>
                  ) : null}
                  {unstagedCount > 0 ? (
                    <div className="agents-scm-group">
                      <div className="agents-scm-group-head">
                        <span className="agents-scm-group-title">
                          {t('files.changesGroup', { count: unstagedCount })}
                        </span>
                        <button
                          type="button"
                          className="agents-scm-group-btn"
                          title={t('files.stageAll')}
                          aria-label={t('files.stageAll')}
                          disabled={busyPath !== null}
                          onClick={() => void onStageAll()}
                        >
                          <Plus size={13} aria-hidden />
                        </button>
                      </div>
                      {unstagedFiles.map((e) => renderScmRow(e, false))}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {gitLogEntries.length > 0 ? (
              <div className="agents-scm-commits">
                <div className="agents-scm-commits-head">
                  <History size={12} aria-hidden />
                  <span>{t('files.commits', { count: gitLogEntries.length })}</span>
                </div>
                <div className="agents-scm-commits-list">
                  {gitLogEntries.map((c) => (
                    <div key={c.hash} className="agents-scm-commit-row" title={`${c.message}\n${c.author}`}>
                      <span className="agents-scm-commit-hash">{c.hash}</span>
                      <span className="agents-scm-log-msg">{c.message}</span>
                      {c.refs
                        ? c.refs.split(', ').map((ref) => (
                            <span
                              key={ref}
                              className={`agents-scm-ref${ref.startsWith('HEAD') ? ' agents-scm-ref--head' : ''}`}
                            >
                              {ref.replace('HEAD -> ', '')}
                            </span>
                          ))
                        : null}
                      <span className="agents-scm-commit-meta">
                        {c.author} · {relativeTime(c.date)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="agents-files-tree">
              {entries.map((e) => (
                <div
                  key={e.path}
                  className={`agents-file-row${selected === e.path ? ' agents-file-row--selected' : ''}`}
                  onClick={() => openFile(e.path, e.is_dir)}
                  onKeyDown={(ev) => ev.key === 'Enter' && openFile(e.path, e.is_dir)}
                  role="button"
                  tabIndex={0}
                >
                  {e.is_dir ? <Folder size={14} /> : <File size={14} />}
                  <div className="agents-file-row-label">
                    <span className="agents-file-row-name">{e.name}</span>
                    {(() => {
                      const badge = gitBadge(e.path);
                      return badge ? (
                        <span className="agents-file-badge" title={badge.title}>
                          {badge.short}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {!isProtectedProjectPath(e.path) ? (
                    <button
                      type="button"
                      className="agents-file-delete"
                      title={e.is_dir ? t('files.deleteFolder') : t('files.deleteFile')}
                      aria-label={e.is_dir ? t('files.deleteFolder') : t('files.deleteFile')}
                      disabled={deletingPath === e.path}
                      onClick={(ev) => void onDeleteEntry(e, ev)}
                    >
                      {deletingPath === e.path ? (
                        <Loader2 size={14} className="agents-session-more-spinner" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {lastCommit && !fileOpen ? (
              <div className="agents-files-foot">
                <span>
                  {lastCommit.hash.slice(0, 7)} {lastCommit.message}
                </span>
              </div>
            ) : null}
          </>
        )}
      </aside>
    </div>
  );
}
