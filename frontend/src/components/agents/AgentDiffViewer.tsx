import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { AgentsFileSkeleton } from './AgentsPageSkeleton';
import './AgentsWorkspace.scss';

type DiffKind = 'meta' | 'hunk' | 'add' | 'del' | 'ctx';

interface DiffRow {
  kind: DiffKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function parseUnifiedDiff(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNo = 0;
  let newNo = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) {
      const m = HUNK_HEADER.exec(line);
      if (m) {
        oldNo = parseInt(m[1], 10);
        newNo = parseInt(m[2], 10);
      }
      rows.push({ kind: 'hunk', text: line, oldNo: null, newNo: null });
    } else if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('similarity index') ||
      line.startsWith('rename ') ||
      line.startsWith('Binary files')
    ) {
      rows.push({ kind: 'meta', text: line, oldNo: null, newNo: null });
    } else if (line.startsWith('+')) {
      rows.push({ kind: 'add', text: line.slice(1), oldNo: null, newNo: newNo++ });
    } else if (line.startsWith('-')) {
      rows.push({ kind: 'del', text: line.slice(1), oldNo: oldNo++, newNo: null });
    } else {
      rows.push({ kind: 'ctx', text: line.startsWith(' ') ? line.slice(1) : line, oldNo: oldNo++, newNo: newNo++ });
    }
  }
  return rows;
}

interface Props {
  path: string;
  diff: string;
  loading?: boolean;
  onClose: () => void;
}

export function AgentDiffViewer({ path, diff, loading, onClose }: Props) {
  const { t } = useTranslation('agents');
  const fileName = path.split('/').pop() ?? path;
  const rows = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const changed = rows.some((r) => r.kind === 'add' || r.kind === 'del');

  return (
    <section className="agents-file-viewer" aria-label={t('files.diffViewer', { name: fileName })}>
      <div className="agents-file-viewer-tabs">
        <div className="agents-file-viewer-tab agents-file-viewer-tab--active">
          <span className="agents-diff-path">{path}</span>
        </div>
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
        ) : !changed ? (
          <p className="agents-file-viewer-status">{t('files.noTextDiff')}</p>
        ) : (
          <div className="agents-diff" role="document">
            {rows.map((row, i) => {
              if (row.kind === 'meta') {
                return (
                  <div className="agents-diff-row agents-diff-row--meta" key={i}>
                    <span className="agents-diff-text">{row.text}</span>
                  </div>
                );
              }
              if (row.kind === 'hunk') {
                return (
                  <div className="agents-diff-row agents-diff-row--hunk" key={i}>
                    <span className="agents-diff-text">{row.text}</span>
                  </div>
                );
              }
              return (
                <div className={`agents-diff-row agents-diff-row--${row.kind}`} key={i}>
                  <span className="agents-diff-gutter" aria-hidden>
                    {row.oldNo ?? ''}
                  </span>
                  <span className="agents-diff-gutter" aria-hidden>
                    {row.newNo ?? ''}
                  </span>
                  <span className="agents-diff-sign" aria-hidden>
                    {row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '}
                  </span>
                  <code className="agents-diff-text">{row.text || ' '}</code>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
