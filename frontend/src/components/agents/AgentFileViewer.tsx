import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
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

  const lines = useMemo(() => content.split('\n'), [content]);

  return (
    <section className="agents-file-viewer" aria-label={t('files.viewer', { name: fileName })}>
      <div className="agents-file-viewer-tabs">
        <div className="agents-file-viewer-tab agents-file-viewer-tab--active">{fileName}</div>
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
          <p className="agents-file-viewer-status">{t('loading')}</p>
        ) : isBinary ? (
          <p className="agents-file-viewer-status">{content}</p>
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
