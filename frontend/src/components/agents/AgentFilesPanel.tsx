import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, File, Upload, GitBranch } from 'lucide-react';
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
    return e?.status ?? '';
  };

  const openFile = async (path: string, isDir: boolean) => {
    if (isDir) {
      setCwd(path);
      setSelected(null);
      setPreview(null);
      return;
    }
    setSelected(path);
    const data = await getProjectFileContent(projectId, path);
    setPreviewBinary(data.is_binary);
    setPreview(data.is_binary ? t('files.binaryPreview', { size: data.size }) : data.content);
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

  return (
    <aside className="agents-files-panel" aria-label={t('files.title')}>
      <div className="agents-files-head">
        <button type="button" className="btn btn-sm" onClick={() => uploadRef.current?.click()}>
          <Upload size={14} /> {t('files.upload')}
        </button>
        <input ref={uploadRef} type="file" hidden onChange={(e) => onUpload(e.target.files)} />
        {!gitInitialized ? (
          <button type="button" className="btn btn-sm" onClick={onGitInit}>
            <GitBranch size={14} /> {t('files.gitInit')}
          </button>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => setCommitOpen(true)}>
            {t('files.gitCommit')}
          </button>
        )}
        {cwd ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCwd('')}>
            /
          </button>
        ) : null}
      </div>
      <div className="agents-files-split">
        <div className="agents-files-tree">
          <div style={{ flex: 1, overflow: 'auto' }}>
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
                {gitBadge(e.path) ? (
                  <span className="badge" title={gitBadge(e.path)}>
                    {gitBadge(e.path)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          {lastCommit ? (
            <div style={{ padding: '8px 10px', fontSize: '0.75rem', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
              {lastCommit.hash} {lastCommit.message}
            </div>
          ) : null}
        </div>
        <div className="agents-files-preview">
          {previewBinary ? <p>{preview}</p> : <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{preview ?? t('files.selectFile')}</pre>}
        </div>
      </div>
      {commitOpen ? (
        <div className="agents-interrupt-bar">
          <input
            type="text"
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder={t('files.commitMessage')}
            style={{ flex: 1 }}
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
  );
}
