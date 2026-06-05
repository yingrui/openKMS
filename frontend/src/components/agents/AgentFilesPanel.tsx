import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, File, Upload, GitBranch } from 'lucide-react';
import { AgentFileViewer } from './AgentFileViewer';
import { gitStatusLabel } from './gitStatusLabel';
import {
  getProjectFileContent,
  gitCommit,
  gitInit,
  gitLog,
  gitStatus,
  listProjectFiles,
  uploadProjectFile,
  type GitLogEntry,
  type GitStatusEntry,
  type ProjectFileEntry,
} from '../../data/projectsApi';
import './AgentsWorkspace.scss';

interface Props {
  projectId: string;
  gitInitialized: boolean;
  onGitChange?: () => void;
}

export function AgentFilesPanel({ projectId, gitInitialized, onGitChange }: Props) {
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
  const uploadRef = useRef<HTMLInputElement>(null);

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

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    await uploadProjectFile(projectId, files[0], cwd);
    await refresh();
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

  return (
    <div className={`agents-files-rail${fileOpen ? ' agents-files-rail--open' : ''}`}>
      {fileOpen ? (
        <AgentFileViewer
          path={selected}
          content={preview ?? ''}
          isBinary={previewBinary}
          loading={previewLoading}
          onClose={closeFile}
        />
      ) : null}
      <aside className="agents-files-panel" aria-label={t('files.title')}>
        <div className="agents-files-head">
          <span className="agents-files-head-title">
            {gitInitialized ? t('files.changes', { count: changeCount }) : t('files.title')}
          </span>
          <div className="agents-files-head-actions">
            <button
              type="button"
              className="agents-files-icon-btn"
              onClick={() => uploadRef.current?.click()}
              title={t('files.upload')}
              aria-label={t('files.upload')}
            >
              <Upload size={15} />
            </button>
            <input ref={uploadRef} type="file" hidden onChange={(e) => onUpload(e.target.files)} />
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
            {cwd ? (
              <button type="button" className="agents-files-all-btn" onClick={() => setCwd('')}>
                {t('files.allFiles')}
              </button>
            ) : (
              <span className="agents-files-all-btn agents-files-all-btn--static">{t('files.allFiles')}</span>
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
              <span>{e.name}</span>
              {(() => {
                const badge = gitBadge(e.path);
                return badge ? (
                  <span className="agents-file-badge" title={badge.title}>
                    {badge.short}
                  </span>
                ) : null;
              })()}
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
