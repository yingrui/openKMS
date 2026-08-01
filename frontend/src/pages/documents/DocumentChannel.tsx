import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FileText,
  Upload,
  Search,
  FolderInput,
  Download,
  Trash2,
  Image,
  FileCode,
  Archive,
  Folder,
  Settings,
  X,
  Loader2,
  Play,
  BookOpen,
  GitBranch,
  RotateCcw,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { isProcessBlockedByMissingPipeline } from '../../data/channelUtils';
import {
  TableRowActionButton,
  TableRowActions,
  Pagination,
  EmptyState,
} from '../../styles/design-system';
import { useDocumentChannel, DOCUMENT_STATUS_FILTER_VALUES, APPLICABLE_FILTER_VALUES } from './useDocumentChannel';
import { DocumentChannelModals } from './DocumentChannel.modals';
import '../../styles/channel-page.scss';
import './DocumentChannel.scss';

const fileTypeIcons: Record<string, typeof FileText> = {
  PDF: FileText,
  HTML: FileCode,
  ZIP: Archive,
  PNG: Image,
  JPG: Image,
  JPEG: Image,
  WEBP: Image,
  DOCX: FileText,
  PPTX: FileText,
  XLSX: FileText,
  XMIND: GitBranch,
  EPUB: BookOpen,
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DocumentChannel() {
  const navigate = useNavigate();
  const { channelId = '' } = useParams<{ channelId: string }>();
  const v = useDocumentChannel(channelId);
  const { t } = v;

  if (v.loading) {
    return (
      <div className="channel-page">
        <div className="page-header">
          <p className="page-subtitle">{t('channel.loadingChannels')}</p>
        </div>
      </div>
    );
  }

  if (v.error) {
    return (
      <div className="channel-page">
        <div className="page-header">
          <p className="page-subtitle page-subtitle--error">{v.error}</p>
        </div>
      </div>
    );
  }

  if (v.channels.length === 0) {
    return (
      <div className="channel-page">
        <EmptyState
          variant="page"
          icon={<Folder size={64} />}
          title={t('channel.noChannelsTitle')}
          description={t('channel.noChannelsHint')}
          action={
            <Link to="/documents/channels" className="btn btn-primary">
              <Folder size={18} />
              <span>{t('channel.createChannel')}</span>
            </Link>
          }
        />
      </div>
    );
  }

  if (!channelId || !v.channelIds.has(channelId)) {
    return (
      <div className="channel-page">
        <div className="page-header">
          <h1>{t('channel.notFoundTitle')}</h1>
          <p className="page-subtitle">{t('channel.notFoundSubtitle')}</p>
          <Link to="/documents" className="btn btn-secondary openkms-link-spaced">
            {t('channel.backToDocuments')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="channel-page">
      <Link to="/documents" className="channel-browse-back">
        <ArrowLeft size={16} strokeWidth={1.75} />
        <span>{t('channel.backToTree')}</span>
      </Link>
      <div className="page-header channel-page-header">
        <div>
          <div className="channel-page-header-title">
            <h1>{v.channelName}</h1>
          </div>
          <p className="page-subtitle">
            {v.channelDescription ?? t('channel.defaultDescription')}
          </p>
        </div>
        <div className="channel-page-header-actions">
          <Link
            to={`/documents/channels/${channelId}/settings`}
            className="btn btn-secondary"
          >
            <Settings size={18} />
            <span className="ds-compact-label">{t('channel.channelSettings')}</span>
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={v.handleUploadClick}
          >
            <Upload size={18} />
            <span className="ds-compact-label">{t('common.upload')}</span>
          </button>
        </div>
      </div>

      <div className="channel-page-main">
        <div className="channel-page-toolbar">
          <div className="channel-page-search">
            <Search size={18} />
            <input
              type="search"
              aria-label={t('channel.searchAria')}
              placeholder={t('channel.searchPlaceholder')}
              value={v.search}
              onChange={(e) => v.setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label={t('channel.filterStatusAria')}
            value={v.statusFilter}
            onChange={(e) => v.setStatusFilter(e.target.value as typeof v.statusFilter)}
          >
            {DOCUMENT_STATUS_FILTER_VALUES.map((value) => (
              <option key={value || 'all'} value={value}>
                {v.statusFilterLabel(value)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('channel.filterApplicableAria')}
            value={v.applicableFilter}
            onChange={(e) => v.setApplicableFilter(e.target.value as typeof v.applicableFilter)}
          >
            {APPLICABLE_FILTER_VALUES.map((value) => (
              <option key={value || 'all-applicable'} value={value}>
                {v.applicableFilterLabel(value)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary channel-page-toolbar-refresh"
            onClick={() => void v.loadDocuments()}
            disabled={v.docsLoading}
            title={t('channel.refreshTitle')}
            aria-label={t('channel.refreshAria')}
          >
            <RefreshCw size={18} className={v.docsLoading ? 'channel-page-spinner' : undefined} />
          </button>
        </div>
        {v.selectedCount > 0 && (
          <div className="channel-page-bulk-bar" role="toolbar" aria-label={t('channel.selectedCount', { count: v.selectedCount })}>
            <span className="channel-page-bulk-count">{t('channel.selectedCount', { count: v.selectedCount })}</span>
            <div className="channel-page-bulk-actions">
              {v.bulkProcessDisabled ? (
                <span className="channel-page-bulk-action-wrap" title={v.bulkProcessTitle}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled
                    aria-label={v.bulkProcessTitle}
                  >
                    {v.bulkBusy === 'process' ? (
                      <Loader2 size={16} className="channel-page-spinner" />
                    ) : (
                      <Play size={16} />
                    )}
                    <span>{t('channel.bulkProcess')}</span>
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void v.handleBulkProcess()}
                  title={v.bulkProcessTitle}
                >
                  {v.bulkBusy === 'process' ? (
                    <Loader2 size={16} className="channel-page-spinner" />
                  ) : (
                    <Play size={16} />
                  )}
                  <span>{t('channel.bulkProcess')}</span>
                </button>
              )}
              {v.bulkResetDisabled ? (
                <span className="channel-page-bulk-action-wrap" title={v.bulkResetTitle}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled
                    aria-label={v.bulkResetTitle}
                  >
                    {v.bulkBusy === 'reset' ? (
                      <Loader2 size={16} className="channel-page-spinner" />
                    ) : (
                      <RotateCcw size={16} />
                    )}
                    <span>{t('channel.bulkResetStatus')}</span>
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void v.handleBulkResetStatus()}
                  title={v.bulkResetTitle}
                >
                  {v.bulkBusy === 'reset' ? (
                    <Loader2 size={16} className="channel-page-spinner" />
                  ) : (
                    <RotateCcw size={16} />
                  )}
                  <span>{t('channel.bulkResetStatus')}</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={v.handleBulkMoveClick}
                disabled={v.bulkActionsDisabled}
              >
                {v.bulkBusy === 'move' ? (
                  <Loader2 size={16} className="channel-page-spinner" />
                ) : (
                  <FolderInput size={16} />
                )}
                <span>{t('channel.bulkMove')}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm channel-page-bulk-delete"
                onClick={() => void v.handleBulkDelete()}
                disabled={v.bulkActionsDisabled}
              >
                {v.bulkBusy === 'delete' ? (
                  <Loader2 size={16} className="channel-page-spinner" />
                ) : (
                  <Trash2 size={16} />
                )}
                <span>{t('channel.bulkDelete')}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={v.clearSelection}
                disabled={v.bulkActionsDisabled}
              >
                <X size={16} />
                <span>{t('channel.clearSelection')}</span>
              </button>
            </div>
          </div>
        )}
        <div className="ds-table-wrap channel-table-wrap">
          {v.docsLoading ? (
            <div className="channel-page-loading">
              <Loader2 size={32} className="channel-page-spinner" />
              <p>{t('channel.loadingDocs')}</p>
            </div>
          ) : v.docsError ? (
            <div className="channel-page-error">
              <p>{v.docsError}</p>
            </div>
          ) : v.docsTotal > 0 ? (
            <>
              <table className="channel-table">
              <thead>
                <tr>
                  <th className="channel-table-select-col">
                    <input
                      type="checkbox"
                      checked={v.allDocsSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = v.someDocsSelected;
                      }}
                      onChange={v.toggleSelectAll}
                      aria-label={t('channel.selectAllAria')}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <th className="channel-table-cell--primary">{t('channel.tableName')}</th>
                  <th>{t('channel.tableType')}</th>
                  <th>{t('channel.tableSize')}</th>
                  <th>{t('channel.tableStatus')}</th>
                  <th>{t('channel.tableUploaded')}</th>
                </tr>
              </thead>
              <tbody>
                {v.documents.map((doc) => {
                  const Icon = fileTypeIcons[doc.file_type] || FileText;
                  const isSelected = v.selectedDocIds.has(doc.id);
                  const statusLabel = doc.status || 'completed';
                  /** Always in primary meta-row; desktop/mobile placement is CSS-only. */
                  const rowActions = (
                    <TableRowActions>
                      {(doc.status === 'uploaded' || doc.status === 'failed') && (
                        <TableRowActionButton
                          title={
                            isProcessBlockedByMissingPipeline(doc.file_type, v.channelPipelineId)
                              ? t('channel.processNoPipeline')
                              : t('common.process')
                          }
                          aria-label={t('channel.ariaProcess', { name: doc.name })}
                          onClick={(e) => void v.handleProcessClick(e, doc)}
                          disabled={isProcessBlockedByMissingPipeline(doc.file_type, v.channelPipelineId)}
                          loading={v.processingId === doc.id}
                          icon={<Play size={16} />}
                        />
                      )}
                      <TableRowActionButton
                        title={t('common.move')}
                        aria-label={t('channel.ariaMoveDoc', { name: doc.name })}
                        onClick={(e) => v.handleMoveClick(e, doc)}
                        icon={<FolderInput size={16} />}
                      />
                      <TableRowActionButton
                        title={t('common.download')}
                        aria-label={t('channel.ariaDownload')}
                        onClick={(e) => void v.handleDownloadClick(e, doc)}
                        icon={<Download size={16} />}
                      />
                      <TableRowActionButton
                        title={t('common.delete')}
                        aria-label={t('channel.ariaDeleteDoc', { name: doc.name })}
                        variant="danger"
                        onClick={(e) => void v.handleDeleteClick(e, doc)}
                        loading={v.deletingId === doc.id}
                        icon={<Trash2 size={16} />}
                      />
                    </TableRowActions>
                  );
                  return (
                    <tr
                      key={doc.id}
                      className={`channel-table-row${isSelected ? ' channel-table-row--selected' : ''}`}
                      onClick={() => navigate(`/documents/view/${doc.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/documents/view/${doc.id}`)}
                    >
                      <td className="channel-table-select-col" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => v.toggleDocSelection(doc.id)}
                          aria-label={t('channel.selectDocAria', { name: doc.name })}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="channel-table-cell--primary">
                        <div className="channel-item">
                          <Icon size={18} strokeWidth={1.5} />
                          <div className="channel-item-text">
                            <span className="channel-item-title">{doc.name}</span>
                            <div className="channel-item-meta-row">
                              <span className="channel-item-meta">
                                {doc.file_type}
                                {' · '}
                                {v.formatSize(doc.size_bytes)}
                                {' · '}
                                {statusLabel}
                              </span>
                              <div
                                className="channel-item-actions"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {rowActions}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{doc.file_type}</td>
                      <td>{v.formatSize(doc.size_bytes)}</td>
                      <td>
                        <span className={`doc-status doc-status-${statusLabel}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td>{formatDate(doc.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
              <Pagination
                total={v.docsTotal}
                page={v.docsPage}
                pageSize={v.docsPageSize}
                loading={v.docsLoading}
                onPageChange={(page) => {
                  v.setDocsPage(page);
                  v.clearSelection();
                }}
                onPageSizeChange={(size) => {
                  v.setDocsPageSize(size);
                  v.setDocsPage(0);
                  v.clearSelection();
                }}
              />
            </>
          ) : (
            <div className="channel-page-empty">
              <Folder size={48} />
              <p>{t('channel.emptyTitle')}</p>
              <p className="channel-page-empty-hint">{t('channel.emptyHint')}</p>
            </div>
          )}
        </div>
      </div>

      <DocumentChannelModals
        t={t}
        showUploadModal={v.showUploadModal}
        uploading={v.uploading}
        uploadError={v.uploadError}
        selectedFiles={v.selectedFiles}
        fileInputRef={v.fileInputRef}
        onCloseUploadModal={v.closeUploadModal}
        onFileChange={v.handleFileChange}
        onRemoveFile={v.removeFile}
        onAddDroppedFiles={v.addDroppedFiles}
        onUploadSubmit={() => void v.handleUploadSubmit()}
        moveModalDocIds={v.moveModalDocIds}
        moveModalDocs={v.moveModalDocs}
        moveTargetChannelId={v.moveTargetChannelId}
        moveLoading={v.moveLoading}
        channelOptions={v.channelOptions}
        onCloseMoveModal={v.closeMoveModal}
        onMoveTargetChannelChange={v.setMoveTargetChannelId}
        onMoveConfirm={() => void v.handleMoveConfirm()}
      />
    </div>
  );
}
