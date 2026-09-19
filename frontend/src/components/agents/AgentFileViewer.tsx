import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { RichMarkdown, richMarkdownPreComponent } from '../markdown/richMarkdown';
import { AgentsFileSkeleton } from './AgentsPageSkeleton';
import '../../styles/document-detail.scss';
import './AgentsWorkspace.scss';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightMarkdownLine(line: string): string {
  let s = escapeHtml(line);
  s = s.replace(
    /^(#{1,6}\s+)(.+)$/,
    '<span class="agents-hl-hash">$1</span><span class="agents-hl-heading">$2</span>',
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, '<span class="agents-hl-bold">**$1**</span>');
  s = s.replace(/`([^`]+)`/g, '<span class="agents-hl-code">`$1`</span>');
  s = s.replace(/^(\s*[-*]\s+)/, '<span class="agents-hl-list">$1</span>');
  return s;
}

function highlightLine(line: string, ext: string): string {
  if (ext === 'md' || ext === 'markdown') return highlightMarkdownLine(line);
  return escapeHtml(line);
}

type PreviewKind = 'markdown' | 'html' | null;
type ViewMode = 'preview' | 'source';

function previewKindForExt(ext: string): PreviewKind {
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'html' || ext === 'htm') return 'html';
  return null;
}

interface Props {
  path: string;
  content: string;
  isBinary: boolean;
  loading?: boolean;
  onClose: () => void;
}

export function AgentFileViewer({ path, content, isBinary, loading, onClose }: Props) {
  const { t } = useTranslation('agents');
  const fileName = path.split('/').pop() ?? path;
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  const kind = previewKindForExt(ext);
  const canPreview = Boolean(kind) && !isBinary && !loading;

  const [mode, setMode] = useState<ViewMode>('preview');

  useEffect(() => {
    setMode(kind ? 'preview' : 'source');
  }, [path, kind]);

  const lines = useMemo(() => content.split('\n'), [content]);
  const markdownComponents = useMemo(
    () => ({
      pre: richMarkdownPreComponent(),
    }),
    [],
  );
  const showPreview = canPreview && mode === 'preview' && kind != null;

  return (
    <section className="agents-file-viewer" aria-label={t('files.viewer', { name: fileName })}>
      <div className="agents-file-viewer-tabs">
        <div className="agents-file-viewer-tab agents-file-viewer-tab--active">{fileName}</div>
        {canPreview ? (
          <div className="agents-file-viewer-modes" role="group" aria-label={t('files.viewMode')}>
            <button
              type="button"
              className={
                mode === 'preview'
                  ? 'agents-file-viewer-mode agents-file-viewer-mode--active'
                  : 'agents-file-viewer-mode'
              }
              onClick={() => setMode('preview')}
            >
              {t('files.preview')}
            </button>
            <button
              type="button"
              className={
                mode === 'source'
                  ? 'agents-file-viewer-mode agents-file-viewer-mode--active'
                  : 'agents-file-viewer-mode'
              }
              onClick={() => setMode('source')}
            >
              {t('files.source')}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="agents-file-viewer-close"
          onClick={onClose}
          aria-label={t('files.closeFile')}
        >
          <X size={14} />
        </button>
      </div>
      <div className="agents-file-viewer-body">
        {loading ? (
          <AgentsFileSkeleton />
        ) : isBinary ? (
          <p className="agents-file-viewer-status">{content}</p>
        ) : showPreview && kind === 'markdown' ? (
          <div className="agents-file-viewer-preview agents-file-viewer-preview--markdown document-detail-markdown-body">
            <RichMarkdown components={markdownComponents}>{content}</RichMarkdown>
          </div>
        ) : showPreview && kind === 'html' ? (
          <div className="agents-file-viewer-preview agents-file-viewer-preview--html">
            <iframe
              className="agents-file-viewer-html-frame"
              title={t('files.htmlPreview', { name: fileName })}
              srcDoc={content}
              sandbox=""
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className="agents-file-viewer-code" role="document">
            {lines.map((line, i) => (
              <div className="agents-file-viewer-line" key={i}>
                <span className="agents-file-viewer-gutter" aria-hidden>
                  {i + 1}
                </span>
                <code
                  className="agents-file-viewer-text"
                  dangerouslySetInnerHTML={{ __html: highlightLine(line, ext) || '&nbsp;' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
