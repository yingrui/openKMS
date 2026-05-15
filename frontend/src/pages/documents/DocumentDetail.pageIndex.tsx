import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, FileText, Loader2, X as XIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  richMarkdownRemarkPlugins,
  richMarkdownRehypePlugins,
} from '../../components/markdown/richMarkdown';
import type { PageIndexNode } from '../../data/documentsApi';
import type { ExampleDocumentConfig } from './DocumentDetail.types';

/** For each node, endLine = next sibling's startLine - 1 (or parent's end if last child).
 *  This makes parent content include all descendants. */
function buildNodeLineRanges(
  nodes: PageIndexNode[],
  parentEndLine: number | null = null
): Map<string | undefined, { startLine: number; endLine: number }> {
  const map = new Map<string | undefined, { startLine: number; endLine: number }>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const start = node.line_num ?? 1;
    const nextSibling = nodes[i + 1];
    const nextSiblingStart = nextSibling?.line_num ?? null;
    const end = nextSiblingStart != null ? nextSiblingStart - 1 : (parentEndLine ?? 999999);
    map.set(node.node_id, { startLine: start, endLine: end });
    if (node.nodes && node.nodes.length > 0) {
      const childMap = buildNodeLineRanges(node.nodes, end);
      childMap.forEach((v, k) => map.set(k, v));
    }
  }
  return map;
}

function PageIndexTreeNode({
  node,
  depth = 0,
  markdown,
  lineRangeMap,
  onContentClick,
}: {
  node: PageIndexNode;
  depth?: number;
  markdown: string | null;
  lineRangeMap: Map<string | undefined, { startLine: number; endLine: number }>;
  onContentClick: (content: string, node: PageIndexNode) => void;
}) {
  const { t } = useTranslation('documents');
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.nodes && node.nodes.length > 0;
  const lineRange = lineRangeMap.get(node.node_id);

  const handleContentClick = () => {
    if (!markdown || !lineRange) return;
    const lines = markdown.split('\n');
    const start = Math.max(0, lineRange.startLine - 1);
    const end = Math.min(lines.length, lineRange.endLine);
    const content = lines.slice(start, end).join('\n').trim();
    onContentClick(content, node);
  };

  return (
    <div className="document-detail-pageindex-node" style={{ marginLeft: depth * 12 }}>
      <div className="document-detail-pageindex-node-header">
        {hasChildren ? (
          <button
            type="button"
            className="document-detail-pageindex-expand"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="document-detail-pageindex-expand-placeholder" />
        )}
        <span className="document-detail-pageindex-node-title">{node.title}</span>
        {lineRange && (
          <button
            type="button"
            className="document-detail-pageindex-content-btn"
            onClick={handleContentClick}
            title={t('detail.showContent')}
            aria-label={t('detail.showContentAria', { title: node.title })}
          >
            <FileText size={14} />
          </button>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="document-detail-pageindex-children">
          {node.nodes!.map((child, i) => (
            <PageIndexTreeNode
              key={child.node_id ?? i}
              node={child}
              depth={depth + 1}
              markdown={markdown}
              lineRangeMap={lineRangeMap}
              onContentClick={onContentClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PageIndexTree({
  pageIndex,
  loading,
  error,
  docConfig,
  markdown,
  markdownComponents,
}: {
  pageIndex: { structure: PageIndexNode[]; doc_name?: string | null } | null;
  loading: boolean;
  error: string | null;
  docConfig: ExampleDocumentConfig | null;
  markdown: string | null;
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
}) {
  const { t } = useTranslation('documents');
  const [contentPopover, setContentPopover] = useState<{ content: string; title: string } | null>(null);
  const lineRangeMap = useMemo(
    () => (pageIndex?.structure?.length ? buildNodeLineRanges(pageIndex.structure) : new Map()),
    [pageIndex]
  );

  const handleContentClick = useCallback((content: string, node: PageIndexNode) => {
    setContentPopover({ content, title: node.title });
  }, []);

  if (docConfig) {
    return <p className="document-detail-muted">{t('detail.pageIndexExampleDoc')}</p>;
  }
  if (loading) {
    return (
      <div className="document-detail-pageindex-loading">
        <Loader2 size={20} className="doc-detail-spinner" />
        <span>{t('detail.loadingPageIndex')}</span>
      </div>
    );
  }
  if (error) {
    return <p className="document-detail-muted document-detail-pageindex-error">{error}</p>;
  }
  if (!pageIndex || !pageIndex.structure?.length) {
    return (
      <p className="document-detail-muted">
        {t('detail.noPageIndex')}
      </p>
    );
  }

  return (
    <div className="document-detail-pageindex">
      {contentPopover && (
        <div
          className="document-detail-pageindex-dialog-overlay"
          onClick={() => setContentPopover(null)}
        >
          <div
            className="document-detail-pageindex-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pageindex-dialog-title"
          >
            <div className="document-detail-pageindex-dialog-header">
              <h2 id="pageindex-dialog-title">{contentPopover.title}</h2>
              <button
                type="button"
                className="document-detail-pageindex-dialog-close"
                onClick={() => setContentPopover(null)}
                aria-label={t('common.close')}
              >
                <XIcon size={18} />
              </button>
            </div>
            <div className="document-detail-pageindex-dialog-body">
              <ReactMarkdown
                remarkPlugins={richMarkdownRemarkPlugins}
                rehypePlugins={richMarkdownRehypePlugins}
                components={markdownComponents}
              >
                {contentPopover.content || t('detail.popoverNoContent')}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
      {pageIndex.structure.map((node, i) => (
        <PageIndexTreeNode
          key={node.node_id ?? i}
          node={node}
          markdown={markdown}
          lineRangeMap={lineRangeMap}
          onContentClick={handleContentClick}
        />
      ))}
    </div>
  );
}
