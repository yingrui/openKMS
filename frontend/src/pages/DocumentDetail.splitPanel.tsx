import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Edit3,
  FileText,
  Image as ImageIcon,
  ListTree,
  Loader2,
  Maximize2,
  Minimize2,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Table,
  X as XIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import {
  richMarkdownRemarkPlugins,
  richMarkdownRehypePlugins,
} from '../components/markdown/richMarkdown';
import type { DocumentResponse, PageIndexNode } from '../data/documentsApi';
import { PageIndexTree } from './DocumentDetail.pageIndex';
import type {
  ExampleDocumentConfig,
  LayoutDetItem,
  PageBlock,
  ParsingResult,
  SpreadsheetSheet,
} from './DocumentDetail.types';

export interface DocumentDetailSplitPanelProps {
  extendedPanel: 'images' | 'markdown' | null;
  isSpreadsheetLayout: boolean;
  isMindmapLayout: boolean;
  isStructuredNonVlmLayout: boolean;
  parsingResult: ParsingResult | null;
  spreadsheetSheets: SpreadsheetSheet[] | null;
  spreadsheetSheetIndex: number;
  onSpreadsheetSheetIndex: (index: number) => void;
  activeSpreadsheetSheet: SpreadsheetSheet | null;
  mindmapSheets: SpreadsheetSheet[] | null;
  mindmapAttachments: NonNullable<ParsingResult['attachments']> | null;
  deferLargeDocImages: boolean;
  pageImageItems: LayoutDetItem[];
  pageBlocks: PageBlock[];
  pageDimensions: Record<number, { w: number; h: number }>;
  hoveredBlockKey: string | null;
  selectedBlock: PageBlock | null;
  onHoveredBlockKey: (key: string | null) => void;
  onSelectedBlock: (block: PageBlock | null) => void;
  onPageMouseMove: (e: MouseEvent<HTMLDivElement>, pageIndex: number) => void;
  onPageImageLoad: (pageIndex: number, img: HTMLImageElement) => void;
  getImageUrl: (path: string) => string;
  folderId: string | null;
  onLoadDeferredImages: () => void;
  onToggleImagesPanel: () => void;
  rightPanelView: 'markdown' | 'pageIndex';
  onRightPanelView: (view: 'markdown' | 'pageIndex') => void;
  markdownEditMode: boolean;
  onMarkdownEditMode: (value: boolean) => void;
  markdown: string | null;
  onMarkdownChange: (value: string) => void;
  document: DocumentResponse | null;
  docConfig: ExampleDocumentConfig | null;
  showPrintButton: boolean;
  saving: boolean;
  onSaveMarkdown: () => void;
  onCancelMarkdownEdit: () => void;
  onEnterMarkdownEdit: () => void;
  onRebuildPageIndex: () => void;
  pageIndexRebuilding: boolean;
  pageIndex: { structure: PageIndexNode[]; doc_name?: string | null } | null;
  pageIndexLoading: boolean;
  pageIndexError: string | null;
  markdownComponents: Components;
  restoring: boolean;
  fileHash: string;
  onRestoreMarkdown: () => void;
  markdownBaseUrl: string;
  onToggleMarkdownExtend: () => void;
}

export function DocumentDetailSplitPanel({
  extendedPanel,
  isSpreadsheetLayout,
  isMindmapLayout,
  isStructuredNonVlmLayout,
  parsingResult,
  spreadsheetSheets,
  spreadsheetSheetIndex,
  onSpreadsheetSheetIndex,
  activeSpreadsheetSheet,
  mindmapSheets,
  mindmapAttachments,
  deferLargeDocImages,
  pageImageItems,
  pageBlocks,
  pageDimensions,
  hoveredBlockKey,
  selectedBlock,
  onHoveredBlockKey,
  onSelectedBlock,
  onPageMouseMove,
  onPageImageLoad,
  getImageUrl,
  folderId,
  onLoadDeferredImages,
  onToggleImagesPanel,
  rightPanelView,
  onRightPanelView,
  markdownEditMode,
  onMarkdownEditMode,
  markdown,
  onMarkdownChange,
  document,
  docConfig,
  showPrintButton,
  saving,
  onSaveMarkdown,
  onCancelMarkdownEdit,
  onEnterMarkdownEdit,
  onRebuildPageIndex,
  pageIndexRebuilding,
  pageIndex,
  pageIndexLoading,
  pageIndexError,
  markdownComponents,
  restoring,
  fileHash,
  onRestoreMarkdown,
  markdownBaseUrl,
  onToggleMarkdownExtend,
}: DocumentDetailSplitPanelProps) {
  const { t } = useTranslation('documents');

  return (
    <div
      className="document-detail-split"
      data-extended-images={extendedPanel === 'images'}
      data-extended-markdown={extendedPanel === 'markdown'}
    >
      <section className="document-detail-panel document-detail-images">
        <h2 className="document-detail-panel-header">
          {isSpreadsheetLayout ? <Table size={16} /> : isMindmapLayout ? <ListTree size={16} /> : <ImageIcon size={16} />}
          <span>
            {isSpreadsheetLayout
              ? t('detail.panelWorkbook')
              : isMindmapLayout
                ? t('detail.panelMindmap')
                : t('detail.panelPages')}
          </span>
          <button
            type="button"
            className="document-detail-extend-btn"
            onClick={onToggleImagesPanel}
            title={extendedPanel === 'images' ? t('detail.restoreSplit') : t('detail.extendView')}
            aria-label={extendedPanel === 'images' ? t('detail.restoreSplit') : t('detail.ariaExtendPages')}
          >
            {extendedPanel === 'images' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </h2>
        <div className="document-detail-images-body">
          {isSpreadsheetLayout ? (
            <div className="document-detail-spreadsheet">
              {parsingResult?.error ? (
                <p className="document-detail-spreadsheet-error">{parsingResult.error}</p>
              ) : null}
              {spreadsheetSheets && spreadsheetSheets.length > 0 ? (
                <>
                  <div className="document-detail-spreadsheet-tabs" role="tablist">
                    {spreadsheetSheets.map((sh, i) => (
                      <button
                        key={sh.name + i}
                        type="button"
                        role="tab"
                        aria-selected={i === spreadsheetSheetIndex}
                        className={`document-detail-spreadsheet-tab ${i === spreadsheetSheetIndex ? 'document-detail-spreadsheet-tab--active' : ''}`}
                        onClick={() => onSpreadsheetSheetIndex(i)}
                      >
                        {sh.name}
                      </button>
                    ))}
                  </div>
                  {activeSpreadsheetSheet ? (
                    <>
                      {(activeSpreadsheetSheet.truncated_rows || activeSpreadsheetSheet.truncated_cols) && (
                        <p className="document-detail-spreadsheet-note">
                          {t('detail.spreadsheetPreview', {
                            rows: activeSpreadsheetSheet.truncated_rows ? t('detail.spreadsheetRowsTrunc') : '',
                            cols: activeSpreadsheetSheet.truncated_cols ? t('detail.spreadsheetColsTrunc') : '',
                          })}
                        </p>
                      )}
                      <div className="document-detail-spreadsheet-scroll">
                        <table className="document-detail-spreadsheet-table">
                          <tbody>
                            {activeSpreadsheetSheet.rows.map((row, ri) => (
                              <tr key={ri}>
                                {row.map((cell, ci) => (
                                  <td key={ci}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                </>
              ) : !parsingResult?.error ? (
                <p className="document-detail-muted">{t('detail.noSheetData')}</p>
              ) : null}
            </div>
          ) : isMindmapLayout ? (
            <div className="document-detail-mindmap">
              {parsingResult?.error ? (
                <p className="document-detail-spreadsheet-error">{parsingResult.error}</p>
              ) : null}
              {mindmapSheets && mindmapSheets.length > 0 ? (
                <ul className="document-detail-mindmap-sheets">
                  {mindmapSheets.map((sheet, i) => (
                    <li key={`${sheet.name}-${i}`}>
                      <span className="document-detail-mindmap-sheet-name">{sheet.name}</span>
                      {typeof sheet.topic_count === 'number' ? (
                        <span className="document-detail-mindmap-sheet-meta">
                          {t('detail.mindmapTopicCount', { count: sheet.topic_count })}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : !parsingResult?.error ? (
                <p className="document-detail-muted">{t('detail.noMindmapData')}</p>
              ) : null}
              {mindmapAttachments && mindmapAttachments.length > 0 ? (
                <div className="document-detail-mindmap-attachments">
                  <h3>{t('detail.mindmapAttachments')}</h3>
                  <ul>
                    {mindmapAttachments.map((att) => (
                      <li key={att.path}>
                        <code>{att.path}</code>
                        {typeof att.size_bytes === 'number' ? (
                          <span>{t('detail.mindmapAttachmentSize', { size: att.size_bytes })}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : deferLargeDocImages && pageImageItems.length > 0 ? (
            <div className="document-detail-large-doc-notice">
              <p className="document-detail-large-doc-title">{t('detail.largeDocImagesDeferredTitle')}</p>
              <p className="document-detail-muted">{t('detail.largeDocImagesDeferredBody', { count: pageImageItems.length })}</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm document-detail-large-doc-btn"
                onClick={onLoadDeferredImages}
              >
                {t('detail.loadPageImages')}
              </button>
            </div>
          ) : pageImageItems.length > 0 ? (
            pageImageItems.map((item, pageIndex) => {
              const dims = pageDimensions[pageIndex];
              const blocks = pageBlocks.filter((b) => b.pageIndex === pageIndex);
              return (
                <div key={pageIndex} className="document-detail-page-item">
                  <span className="document-detail-page-no">{t('detail.pageN', { n: pageIndex + 1 })}</span>
                  <div
                    className="document-detail-page-img-wrap"
                    onMouseMove={(e) => onPageMouseMove(e, pageIndex)}
                    onMouseLeave={() => onHoveredBlockKey(null)}
                  >
                    <img
                      onLoad={(e) => onPageImageLoad(pageIndex, e.currentTarget)}
                      src={folderId ? `/examples/${item.input_img}` : (item.input_img ? getImageUrl(item.input_img) : '')}
                      alt={t('detail.pageAlt', { n: pageIndex + 1 })}
                      className="document-detail-layout-img"
                      loading="lazy"
                      crossOrigin={!folderId ? 'use-credentials' : undefined}
                    />
                    {dims && blocks.map((block, bi) => {
                      const [x1, y1, x2, y2] = block.coordinate;
                      const left = (x1 / dims.w) * 100;
                      const top = (y1 / dims.h) * 100;
                      const width = ((x2 - x1) / dims.w) * 100;
                      const height = ((y2 - y1) / dims.h) * 100;
                      const blockKey = `${pageIndex}-${bi}`;
                      const isSelected = selectedBlock === block;
                      const isHovered = hoveredBlockKey === blockKey;
                      const isHighlighted = isSelected || isHovered;
                      return (
                        <div
                          key={bi}
                          className={`document-detail-bbox ${isHighlighted ? 'document-detail-bbox--visible' : ''} ${isSelected ? 'document-detail-bbox--selected' : ''}`}
                          style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                          onMouseEnter={() => onHoveredBlockKey(blockKey)}
                          onMouseLeave={() => onHoveredBlockKey(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectedBlock(block);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && onSelectedBlock(block)}
                          title={block.parsingItem.content?.slice(0, 50) || block.label}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="document-detail-muted">{t('detail.noLayoutImages')}</p>
          )}
        </div>
      </section>
      <section className="document-detail-panel document-detail-markdown">
        <h2 className="document-detail-panel-header">
          <div className="document-detail-panel-tabs">
            <button
              type="button"
              className={`document-detail-panel-tab ${rightPanelView === 'markdown' ? 'document-detail-panel-tab--active' : ''}`}
              onClick={() => onRightPanelView('markdown')}
              aria-pressed={rightPanelView === 'markdown'}
            >
              <FileText size={14} />
              <span>{t('detail.tabMarkdown')}</span>
            </button>
            {!isStructuredNonVlmLayout ? (
              <button
                type="button"
                className={`document-detail-panel-tab ${rightPanelView === 'pageIndex' ? 'document-detail-panel-tab--active' : ''}`}
                onClick={() => onRightPanelView('pageIndex')}
                aria-pressed={rightPanelView === 'pageIndex'}
              >
                <ListTree size={14} />
                <span>{t('detail.tabPageIndex')}</span>
              </button>
            ) : null}
          </div>
          {rightPanelView === 'markdown' && !docConfig && (
            markdownEditMode ? (
              <>
                <button
                  type="button"
                  className="document-detail-edit-toggle document-detail-save-btn"
                  onClick={onSaveMarkdown}
                  disabled={saving}
                  title={t('detail.titleSaveMarkdown')}
                >
                  {saving ? (
                    <Loader2 size={14} className="doc-detail-spinner" aria-hidden />
                  ) : (
                    <Save size={14} aria-hidden />
                  )}
                  <span>{saving ? t('detail.savingInfo') : t('detail.saveInfo')}</span>
                </button>
                <button
                  type="button"
                  className="document-detail-edit-toggle"
                  onClick={onCancelMarkdownEdit}
                  disabled={saving}
                  title={t('detail.titleCancelEdit')}
                >
                  <XIcon size={14} />
                  <span>{t('common.cancel')}</span>
                </button>
              </>
            ) : (
              <>
                {showPrintButton && (
                  <button
                    type="button"
                    className="document-detail-edit-toggle"
                    onClick={() => window.print()}
                    title={t('detail.titlePrintMarkdown')}
                    aria-label={t('detail.titlePrintMarkdown')}
                  >
                    <Printer size={14} />
                    <span>{t('detail.printMarkdown')}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="document-detail-edit-toggle"
                  onClick={onEnterMarkdownEdit}
                  title={t('detail.titleEditMarkdown')}
                  aria-pressed={false}
                >
                  <Edit3 size={14} />
                  <span>{t('common.edit')}</span>
                </button>
              </>
            )
          )}
          {rightPanelView === 'pageIndex' && !docConfig && (
            <button
              type="button"
              className="document-detail-edit-toggle"
              onClick={onRebuildPageIndex}
              disabled={pageIndexRebuilding}
              title={t('detail.titleRebuildPageIndex')}
              aria-label={t('detail.ariaRebuildPageIndex')}
            >
              {pageIndexRebuilding ? (
                <Loader2 size={14} className="doc-detail-spinner" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
          )}
          <button
            type="button"
            className="document-detail-extend-btn"
            onClick={onToggleMarkdownExtend}
            title={extendedPanel === 'markdown' ? t('detail.restoreSplit') : t('detail.extendView')}
            aria-label={extendedPanel === 'markdown' ? t('detail.restoreSplit') : t('detail.ariaExtendMarkdown')}
          >
            {extendedPanel === 'markdown' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </h2>
        <div className="document-detail-markdown-body">
          {rightPanelView === 'pageIndex' ? (
            <PageIndexTree
              pageIndex={pageIndex}
              loading={pageIndexLoading}
              error={pageIndexError}
              docConfig={docConfig}
              markdown={markdown}
              markdownComponents={markdownComponents}
            />
          ) : selectedBlock && !markdownEditMode ? (
            <div key="block-view" className="document-detail-block-view">
              <button
                type="button"
                className="document-detail-block-back"
                onClick={() => onSelectedBlock(null)}
              >
                {t('detail.blockBack')}
              </button>
              <div className="document-detail-block-meta">
                <span className="document-detail-block-label">{selectedBlock.label}</span>
              </div>
              {selectedBlock.parsingItem.image_path ? (
                <img
                  src={folderId ? `/examples/${selectedBlock.parsingItem.image_path}` : getImageUrl(selectedBlock.parsingItem.image_path)}
                  alt={selectedBlock.parsingItem.label || t('detail.blockAlt')}
                  className="document-detail-block-img"
                  loading="lazy"
                  crossOrigin={!folderId ? 'use-credentials' : undefined}
                />
              ) : selectedBlock.parsingItem.content ? (
                <div className="document-detail-block-content">
                  <ReactMarkdown
                    remarkPlugins={richMarkdownRemarkPlugins}
                    rehypePlugins={richMarkdownRehypePlugins}
                    components={markdownComponents}
                  >
                    {selectedBlock.parsingItem.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="document-detail-muted">{t('detail.noBlockContent')}</p>
              )}
            </div>
          ) : markdownEditMode && !docConfig ? (
            <div key="edit-view" className="document-detail-markdown-edit">
              <textarea
                className="document-detail-markdown-textarea"
                value={markdown ?? ''}
                onChange={(e) => onMarkdownChange(e.target.value)}
                placeholder={t('detail.placeholderMarkdown')}
              />
              <div className="document-detail-markdown-actions">
                <button
                  type="button"
                  className="document-detail-restore-btn"
                  onClick={onRestoreMarkdown}
                  disabled={restoring || !fileHash}
                  title={!fileHash ? t('detail.noFileHashRestore') : t('detail.restoreFromStorage')}
                >
                  {restoring ? <Loader2 size={14} className="doc-detail-spinner" /> : <RotateCcw size={14} />}
                  <span>{restoring ? t('common.restoring') : t('detail.restoreVersion')}</span>
                </button>
              </div>
            </div>
          ) : markdown && (folderId || markdownBaseUrl) ? (
            <div key="markdown-view">
              {document && (
                <div className="document-detail-print-header" aria-hidden>
                  <h1 className="document-detail-print-title">{document.name}</h1>
                  <p className="document-detail-print-subtitle">
                    {document.file_type}
                    {document.created_at ? ` • ${new Date(document.created_at).toLocaleString()}` : ''}
                  </p>
                </div>
              )}
              <ReactMarkdown
                remarkPlugins={richMarkdownRemarkPlugins}
                rehypePlugins={richMarkdownRehypePlugins}
                components={markdownComponents}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          ) : (
            <p key="empty-view" className="document-detail-muted">{t('detail.noMarkdownContent')}</p>
          )}
        </div>
      </section>
    </div>
  );
}
