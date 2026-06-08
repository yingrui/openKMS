import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Folder, File, FolderUp, Upload, GitBranch, Loader2, RefreshCw, ChevronLeft, Trash2 } from 'lucide-react';
import { AgentFileViewer } from './AgentFileViewer';
import { gitStatusLabel } from './gitStatusLabel';
import {
  getProjectFileContent,
  gitCommit,
  gitInit,
  gitLog,
  gitStatus,
  deleteProjectFile,
  listProjectFiles,
  uploadProjectFiles,
  type GitLogEntry,
  type GitStatusEntry,
  type ProjectFileEntry,
} from '../../data/projectsApi';
import './AgentsWorkspace.scss';

const TREE_MIN_PX = 160;
const TREE_MAX_PX = 480;
const TREE_DEFAULT_PX = 240;
const VIEWER_MIN_PX = 160;
const TREE_WIDTH_KEY = 'openkms_agents_files_tree_width_px_v1';

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

function clampTreeWidth(w: number, railWidthPx: number): number {
  const max = Math.max(TREE_MIN_PX, railWidthPx - VIEWER_MIN_PX - 8);
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
  onGitChange?: () => void;
}

export function AgentFilesPanel({ projectId, gitInitialized, railWidthPx, onGitChange }: Props) {
  const { t } = useTranslation('agents');
  const [cwd, setCwd] = useState('');
  const [entries, setEntries] = useState<ProjectFileEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBinary, setPreviewBinary] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [gitEntries, setGitEntries] = useState<GitStatusEntry[]>([]);
  const [lastCommit, setLastCommit] = useState<GitLogEntry | null>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const uploadFilesRef = useRef<HTMLInputElement>(null);
  const uploadFolderRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [treeWidthPx, setTreeWidthPx] = useState(readTreeWidth);

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
    setTreeWidthPx((w) => clampTreeWidth(w, railWidthPx));
  }, [railWidthPx]);

  const onTreeResizePointerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = treeWidthPx;
      let latest = startW;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      const onMove = (ev: MouseEvent) => {
        latest = clampTreeWidth(startW - (ev.clientX - startX), railWidthPx);
        setTreeWidthPx(latest);
      };
      const onUp = () => {
        document.body.style.userSelect = prevUserSelect;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const final = clampTreeWidth(latest, railWidthPx);
        setTreeWidthPx(final);
        try {
          localStorage.setItem(TREE_WIDTH_KEY, String(final));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [treeWidthPx, railWidthPx],
  );

  const refresh = useCallback(async () => {
    const data = await listProjectFiles(projectId, cwd);
    setEntries(data.entries);
    if (gitInitialized) {
      const st = await gitStatus(projectId);
      setGitEntries(st.entries);
      const log = await gitLog(projectId);
      setLastCommit(log.entries[0] ?? null);
    }
  }, [projectId, cwd, gitInitialized]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

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
    setSelected(null);
    setPreview(null);
    setPreviewBinary(false);
    setPreviewLoading(false);
  };

  const openFile = async (path: string, isDir: boolean) => {
    if (isDir) {
      setCwd(path);
      closeFile();
      return;
    }
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
    if (!window.confirm(msg)) return;

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
  };

  const onCommit = async () => {
    if (!commitMsg.trim()) return;
    await gitCommit(projectId, commitMsg.trim());
    setCommitOpen(false);
    setCommitMsg('');
    await refresh();
  };

  const changeCount = gitEntries.length;
  const fileOpen = selected !== null;
  const uploadTargetLabel = cwd || t('files.projectRoot');
  const cwdLabel = cwd ? (cwd.split('/').pop() ?? cwd) : null;
  const headTitle = cwdLabel
    ? cwdLabel
    : gitInitialized
      ? t('files.changes', { count: changeCount })
      : t('files.title');
  const treeWidth = clampTreeWidth(treeWidthPx, railWidthPx);
  const railStyle = {
    flex: `0 0 ${railWidthPx}px`,
    width: railWidthPx,
  } as CSSProperties;
  const treeStyle = fileOpen
    ? ({
        flex: `0 0 ${treeWidth}px`,
        width: treeWidth,
      } as CSSProperties)
    : ({
        flex: '1 1 auto',
        width: '100%',
      } as CSSProperties);

  return (
    <div
      className={`agents-files-rail${fileOpen ? ' agents-files-rail--open' : ''}`}
      style={railStyle}
    >
      {fileOpen ? (
        <AgentFileViewer
          path={selected}
          content={preview ?? ''}
          isBinary={previewBinary}
          loading={previewLoading}
          onClose={closeFile}
        />
      ) : null}
      {fileOpen ? (
        <div
          className="agents-pane-resize-handle agents-pane-resize-handle--inner"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={treeWidth}
          aria-valuemin={TREE_MIN_PX}
          aria-valuemax={clampTreeWidth(TREE_MAX_PX, railWidthPx)}
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
            {cwd ? (
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
            <span className="agents-files-head-title" title={cwd || undefined}>
              {headTitle}
            </span>
          </div>
          <div className="agents-files-head-actions">
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
                onClick={onGitInit}
                title={t('files.gitInit')}
                aria-label={t('files.gitInit')}
              >
                <GitBranch size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="agents-files-icon-btn"
                onClick={() => setCommitOpen((v) => !v)}
                title={t('files.gitCommit')}
                aria-label={t('files.gitCommit')}
              >
                <GitBranch size={15} />
              </button>
            )}
            {!cwd ? (
              <span className="agents-files-all-btn agents-files-all-btn--static">{t('files.allFiles')}</span>
            ) : (
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
            )}
          </div>
        </div>
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
        {commitOpen ? (
          <div className="agents-files-commit">
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder={t('files.commitMessage')}
            />
            <button type="button" className="btn btn-sm btn-primary" onClick={onCommit}>
              {t('files.commit')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setCommitOpen(false)}>
              {t('files.cancel')}
            </button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
