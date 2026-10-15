import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { File, Loader2, Plus, Minus, Undo2 } from 'lucide-react';
import { gitStatusLabel } from './gitStatusLabel';
import { getProjectFileContent, getProjectSettings, gitCommit, gitDiff, gitDiscard, gitInit, gitLog, gitPull, gitPush, gitStage, gitStatus, gitUnstage, deleteProjectFile, listProjectFiles, uploadProjectFiles, type GitLogEntry, type GitStatusEntry, type ProjectFileEntry } from '../../data/projectsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  type AgentFilesPanelProps, INNER_HANDLE_PX, TREE_WIDTH_KEY, VIEWER_MIN_PX, VIEWER_WIDTH_KEY, clampTreeWidth, isPathUnder, isProtectedProjectPath, parentPath, readTreeWidth, readViewerWidth,
} from './agentsFilesUtils';

/** The agent files panel's state machine — every hook and handler, no markup. */
export function useAgentFiles({
  projectId,
  gitInitialized,
  railWidthPx,
  onRailWidthChange,
  onGitChange,
  variant = 'rail',
}: AgentFilesPanelProps) {
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


  return {
    t, confirm, cwd, setCwd, entries, setEntries, selected, setSelected, preview, setPreview,
    previewBinary, setPreviewBinary, previewLoading, setPreviewLoading, gitEntries, setGitEntries,
    gitBranch, setGitBranch, gitAhead, setGitAhead, gitBehind, setGitBehind, gitRemoteUrl,
    setGitRemoteUrl, gitCredentialId, setGitCredentialId, lastCommit, setLastCommit, gitLogEntries,
    setGitLogEntries, panelMode, setPanelMode, commitMenuOpen, setCommitMenuOpen, commitMenuRef,
    commitMsg, setCommitMsg, committing, setCommitting, syncing, setSyncing, busyPath, setBusyPath,
    diffPath, setDiffPath, diffText, setDiffText, diffLoading, setDiffLoading, uploadFilesRef,
    uploadFolderRef, uploadMenuRef, uploadMenuOpen, setUploadMenuOpen, uploading, setUploading,
    refreshing, setRefreshing, deletingPath, setDeletingPath, treeWidthPx, setTreeWidthPx,
    viewerWidthPx, setViewerWidthPx, fileOpen, onTreeResizePointerDown, refresh, stagedFiles,
    unstagedFiles, gitBadge, closeFile, beginOpenPane, openFile, openDiff, onRefresh, goUp,
    onDeleteEntry, onUploadPick, onGitInit, onCommit, onSync, onStageToggle, onDiscard, onStageAll,
    onUnstageAll, openChangedPath, renderScmRow, changeCount, stagedCount, unstagedCount,
    canPush, scmOpen, uploadTargetLabel, cwdLabel, headTitle, treeWidth, isSheet, railStyle,
    treeStyle,
  };
}
