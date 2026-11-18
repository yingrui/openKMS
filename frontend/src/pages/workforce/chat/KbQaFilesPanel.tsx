import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, File, Loader2, PanelRightClose, RefreshCw } from 'lucide-react';
import { downloadQaSessionFile, fetchQaSessionFiles, type QaSessionFile } from '../../data/knowledgeBasesApi';
import '../../styles/files-rail.scss';

/**
 * What this conversation produced, and what it was given.
 *
 * Until now the workspace belonged to the agent alone: an answer could say "saved as industry_count.csv" and the user had no
 * way to open it. This lists the files and links each to a download.
 *
 * The head is the project agent's (`src/styles/files-rail.scss`): title, icon buttons, a chip. The one control per state rule
 * still holds — the rail opens from the shell's chip and closes from the head, never both at once.
 *
 * Scoped to the **conversation**: `sessionId` is this visit's id, so one user never sees another's files, and a new
 * conversation starts empty.
 */
export function KbQaFilesPanel({
  kbId,
  sessionId,
  onCollapse,
}: {
  kbId: string;
  sessionId: string | null;
  onCollapse: () => void;
}) {
  const { t } = useTranslation('knowledgeBase');
  const [files, setFiles] = useState<QaSessionFile[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await fetchQaSessionFiles(kbId, sessionId);
      setFiles(res.files ?? []);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [kbId, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="files-rail-head">
        <div className="files-rail-head-title-row">
          <span className="files-rail-head-title" title={t('detail.qaFiles')}>
            {t('detail.qaFiles')}
          </span>
          {files.length > 0 ? (
            <span className="files-rail-chip files-rail-chip--static">{files.length}</span>
          ) : null}
        </div>
        <div className="files-rail-head-actions">
          <button
            type="button"
            className="files-rail-icon-btn"
            onClick={() => void load()}
            disabled={loading || !sessionId}
            title={t('detail.qaFilesRefresh')}
            aria-label={t('detail.qaFilesRefresh')}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
          <button
            type="button"
            className="files-rail-icon-btn"
            onClick={onCollapse}
            title={t('detail.qaFilesClose')}
            aria-label={t('detail.qaFilesClose')}
          >
            <PanelRightClose size={16} />
          </button>
        </div>
      </div>
      {sessionId && files.length > 0 ? (
        <ul className="files-rail-list">
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                className="files-rail-row"
                onClick={() => void downloadQaSessionFile(kbId, sessionId, f.path)}
                title={f.path}
              >
                <File size={14} aria-hidden />
                <span className="files-rail-row-name">{f.path}</span>
                <span className="files-rail-row-meta">{formatBytes(f.size ?? 0)}</span>
                <Download size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : loading ? (
        <p className="files-rail-empty">
          <Loader2 size={14} className="animate-spin" aria-hidden /> {t('detail.qaFilesLoading')}
        </p>
      ) : (
        <p className="files-rail-empty">{t('detail.qaFilesEmpty')}</p>
      )}
    </>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
