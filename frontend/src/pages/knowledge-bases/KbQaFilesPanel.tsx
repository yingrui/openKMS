import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FolderOpen, Loader2 } from 'lucide-react';
import { downloadQaSessionFile, fetchQaSessionFiles, type QaSessionFile } from '../../data/knowledgeBasesApi';

/**
 * What this conversation produced, and what it was given.
 *
 * Until now the workspace belonged to the agent alone: an answer could say "saved as industry_count.csv" and the user had no
 * way to open it. This lists the files and links each to a download.
 *
 * Scoped to the **conversation**: `sessionId` is this visit's id, so one user never sees another's files, and a new
 * conversation starts empty.
 */
export function KbQaFilesPanel({ kbId, sessionId }: { kbId: string; sessionId: string | null }) {
  const { t } = useTranslation('knowledgeBase');
  const [files, setFiles] = useState<QaSessionFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

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
    if (!open) return;
    void load();
  }, [open, load]);

  if (!sessionId) return null;

  return (
    <div className="kb-qa-files">
      <button
        type="button"
        className={`kb-qa-files__toggle${open ? ' is-active' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <FolderOpen size={16} aria-hidden />
        <span>{t('detail.qaFiles')}</span>
        {files.length > 0 ? <span className="kb-qa-files__count">{files.length}</span> : null}
      </button>
      {open ? (
        <div className="kb-qa-files__panel" role="region" aria-label={t('detail.qaFiles')}>
          {loading ? (
            <p className="page-subtitle">
              <Loader2 size={14} className="animate-spin" aria-hidden /> {t('detail.qaFilesLoading')}
            </p>
          ) : files.length === 0 ? (
            <p className="page-subtitle">{t('detail.qaFilesEmpty')}</p>
          ) : (
            <ul>
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    className="kb-qa-files__link"
                    onClick={() => void downloadQaSessionFile(kbId, sessionId, f.path)}
                  >
                    <Download size={14} aria-hidden />
                    <span className="kb-qa-files__name">{f.path}</span>
                    <span className="kb-qa-files__size">{formatBytes(f.size ?? 0)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
