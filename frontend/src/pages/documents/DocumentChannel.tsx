import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Upload,
  Search,
  Pencil,
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
} from 'lucide-react';
import { useDocumentChannels } from '../../contexts/DocumentChannelsContext';
import {
  getDocumentChannelName,
  getDocumentChannelDescription,
  flattenChannels,
  findChannel,
  canQueueDocumentProcess,
  isProcessBlockedByMissingPipeline,
} from '../../data/channelUtils';
import {
  fetchDocumentsByChannel,
  uploadDocument,
  deleteDocument,
  updateDocument,
  isAcceptedFile,
  type DocumentListItemResponse,
} from '../../data/documentsApi';
import { toast } from 'sonner';
import {
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
  tableRowActionCellClass,
  Pagination,
} from '../../styles/design-system';
import { createJob } from '../../data/jobsApi';
import './DocumentChannel.scss';

const DOCS_PAGE_SIZE_DEFAULT = 25;

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
  const { t } = useTranslation('documents');
  const navigate = useNavigate();
  const { channelId = '' } = useParams<{ channelId: string }>();
  const { channels, loading, error, refetch: refetchChannels } = useDocumentChannels();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = useCallback(
    (bytes: number) => {
      if (bytes < 1024) return t('channel.sizeB', { n: bytes });
      if (bytes < 1024 * 1024) return t('channel.sizeKB', { n: (bytes / 1024).toFixed(1) });
      return t('channel.sizeMB', { n: (bytes / (1024 * 1024)).toFixed(1) });
    },
    [t],
  );

  const [documents, setDocuments] = useState<DocumentListItemResponse[]>([]);
  const [docsTotal, setDocsTotal] = useState(0);
  const [docsPage, setDocsPage] = useState(0);
  const [docsPageSize, setDocsPageSize] = useState(DOCS_PAGE_SIZE_DEFAULT);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(() => new Set());
  const [moveModalDocIds, setMoveModalDocIds] = useState<string[] | null>(null);
  const [moveTargetChannelId, setMoveTargetChannelId] = useState('');
  const [moveLoading, setMoveLoading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<'delete' | 'process' | 'move' | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const channelIds = useMemo(() => new Set(flattenChannels(channels).map((c) => c.id)), [channels]);
  const channelName = getDocumentChannelName(channels, channelId);
  const channelOptions = flattenChannels(channels);
  const channelDescription = getDocumentChannelDescription(channels, channelId);
  const currentChannel = useMemo(() => findChannel(channels, channelId), [channels, channelId]);
  const channelPipelineId = currentChannel?.pipeline_id;

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const loadDocuments = useCallback(async () => {
    if (!channelId) return;
    setDocsLoading(true);
    setDocsError(null);
    try {
      const res = await fetchDocumentsByChannel(channelId, {
        search: debouncedSearch || undefined,
        offset: docsPage * docsPageSize,
        limit: docsPageSize,
      });
      setDocuments(res.items);
      setDocsTotal(res.total);
    } catch (e) {
      setDocsError(e instanceof Error ? e.message : t('channel.loadDocsFailed'));
      setDocuments([]);
      setDocsTotal(0);
    } finally {
      setDocsLoading(false);
    }
  }, [channelId, debouncedSearch, docsPage, docsPageSize, t]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    setSelectedDocIds(new Set());
    setDocsPage(0);
  }, [channelId, debouncedSearch]);

  useEffect(() => {
    if (docsTotal === 0) return;
    const maxPage = Math.max(0, Math.ceil(docsTotal / docsPageSize) - 1);
    if (docsPage > maxPage) setDocsPage(maxPage);
  }, [docsTotal, docsPageSize, docsPage]);

  const selectedCount = selectedDocIds.size;
  const allDocsSelected = documents.length > 0 && documents.every((d) => selectedDocIds.has(d.id));
  const someDocsSelected = selectedCount > 0 && !allDocsSelected;

  const selectedDocs = useMemo(
    () => documents.filter((d) => selectedDocIds.has(d.id)),
    [documents, selectedDocIds],
  );

  const selectedProcessableDocs = useMemo(
    () => selectedDocs.filter((d) => d.status === 'uploaded' || d.status === 'failed'),
    [selectedDocs],
  );

  const selectedRunnableDocs = useMemo(
    () =>
      selectedProcessableDocs.filter((d) =>
        canQueueDocumentProcess(d.status ?? '', d.file_type, channelPipelineId),
      ),
    [selectedProcessableDocs, channelPipelineId],
  );

  const bulkProcessBlockedByPipeline = useMemo(
    () =>
      selectedProcessableDocs.length > 0 &&
      selectedRunnableDocs.length === 0 &&
      selectedProcessableDocs.some((d) =>
        isProcessBlockedByMissingPipeline(d.file_type, channelPipelineId),
      ),
    [selectedProcessableDocs, selectedRunnableDocs, channelPipelineId],
  );

  const moveModalDocs = useMemo(() => {
    if (!moveModalDocIds?.length) return [];
    const idSet = new Set(moveModalDocIds);
    return documents.filter((d) => idSet.has(d.id));
  }, [documents, moveModalDocIds]);

  const toggleDocSelection = useCallback((docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allDocsSelected) {
      setSelectedDocIds(new Set());
      return;
    }
    setSelectedDocIds(new Set(documents.map((d) => d.id)));
  }, [allDocsSelected, documents]);

  const clearSelection = useCallback(() => {
    setSelectedDocIds(new Set());
  }, []);

  const handleUploadClick = () => {
    setUploadError(null);
    setSelectedFiles([]);
    setShowUploadModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const accepted = files.filter((f) => isAcceptedFile(f));
    if (accepted.length !== files.length) {
      setUploadError(t('channel.filesSkipped'));
    }
    setSelectedFiles(accepted);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0 || !channelId) return;
    const count = selectedFiles.length;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of selectedFiles) {
        await uploadDocument(channelId, file);
      }
      setSelectedFiles([]);
      setShowUploadModal(false);
      toast.success(t('channel.uploadToast', { count }));
      await loadDocuments();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('channel.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const closeUploadModal = () => {
    if (!uploading) {
      setShowUploadModal(false);
      setUploadError(null);
      setSelectedFiles([]);
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent, doc: DocumentListItemResponse) => {
    e.stopPropagation();
    if (!window.confirm(t('channel.deleteConfirm', { name: doc.name }))) return;
    setDeletingId(doc.id);
    try {
      await deleteDocument(doc.id);
      toast.success(t('channel.deletedToast', { name: doc.name }));
      await loadDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('channel.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleProcessClick = async (e: React.MouseEvent, doc: DocumentListItemResponse) => {
    e.stopPropagation();
    if (!canQueueDocumentProcess(doc.status ?? '', doc.file_type, channelPipelineId)) return;
    setProcessingId(doc.id);
    try {
      await createJob({ document_id: doc.id });
      toast.success(t('channel.processJobCreated'));
      await loadDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('channel.processJobFailed'));
    } finally {
      setProcessingId(null);
    }
  };

  const openMoveModal = useCallback(
    (docIds: string[]) => {
      if (docIds.length === 0) return;
      const first = documents.find((d) => d.id === docIds[0]);
      setMoveModalDocIds(docIds);
      setMoveTargetChannelId(first?.channel_id ?? channelId);
    },
    [documents, channelId],
  );

  const handleMoveClick = (e: React.MouseEvent, doc: DocumentListItemResponse) => {
    e.stopPropagation();
    openMoveModal([doc.id]);
  };

  const closeMoveModal = () => {
    if (!moveLoading && !bulkBusy) {
      setMoveModalDocIds(null);
      setMoveTargetChannelId('');
    }
  };

  const handleMoveConfirm = async () => {
    if (!moveModalDocIds?.length || !moveTargetChannelId) {
      closeMoveModal();
      return;
    }
    const toMove = moveModalDocs.filter((d) => d.channel_id !== moveTargetChannelId);
    if (toMove.length === 0) {
      closeMoveModal();
      return;
    }
    const isBulk = moveModalDocIds.length > 1;
    setMoveLoading(true);
    if (isBulk) setBulkBusy('move');
    try {
      let ok = 0;
      for (const doc of toMove) {
        await updateDocument(doc.id, { channel_id: moveTargetChannelId });
        ok += 1;
      }
      if (ok === toMove.length) {
        toast.success(
          isBulk && ok > 1
            ? t('channel.movedBulkToast', { count: ok })
            : t('channel.movedToast', { name: toMove[0].name }),
        );
      } else {
        toast.success(t('channel.moveBulkPartial', { ok, total: toMove.length }));
      }
      setSelectedDocIds((prev) => {
        const next = new Set(prev);
        toMove.forEach((d) => next.delete(d.id));
        return next;
      });
      await loadDocuments();
      if (refetchChannels) await refetchChannels();
      closeMoveModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('channel.moveFailed'));
    } finally {
      setMoveLoading(false);
      setBulkBusy(null);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedDocIds];
    if (ids.length === 0) return;
    if (!window.confirm(t('channel.deleteBulkConfirm', { count: ids.length }))) return;
    setBulkBusy('delete');
    let ok = 0;
    try {
      for (const docId of ids) {
        try {
          await deleteDocument(docId);
          ok += 1;
        } catch {
          /* continue with remaining */
        }
      }
      if (ok === ids.length) {
        toast.success(t('channel.deletedBulkToast', { count: ok }));
      } else if (ok > 0) {
        toast.success(t('channel.deleteBulkPartial', { ok, total: ids.length }));
      } else {
        toast.error(t('channel.deleteFailed'));
      }
      clearSelection();
      await loadDocuments();
    } finally {
      setBulkBusy(null);
    }
  };

  const handleBulkProcess = async () => {
    const docs = selectedRunnableDocs;
    if (docs.length === 0) {
      toast.error(
        bulkProcessBlockedByPipeline ? t('channel.processBulkNoPipeline') : t('channel.processBulkNone'),
      );
      return;
    }
    setBulkBusy('process');
    let ok = 0;
    try {
      for (const doc of docs) {
        try {
          await createJob({ document_id: doc.id });
          ok += 1;
        } catch {
          /* continue */
        }
      }
      const skipped = selectedCount - docs.length;
      if (ok === docs.length && skipped === 0) {
        toast.success(t('channel.processBulkToast', { count: ok }));
      } else if (ok > 0) {
        toast.success(t('channel.processBulkPartial', { ok, skipped }));
      } else {
        toast.error(t('channel.processJobFailed'));
      }
      await loadDocuments();
    } finally {
      setBulkBusy(null);
    }
  };

  const handleBulkMoveClick = () => {
    openMoveModal([...selectedDocIds]);
  };

  const bulkActionsDisabled = bulkBusy !== null || moveLoading;

  const bulkProcessDisabled = bulkActionsDisabled || selectedRunnableDocs.length === 0;
  const bulkProcessTitle = bulkProcessBlockedByPipeline
    ? t('channel.processBulkNoPipeline')
    : selectedRunnableDocs.length === 0
      ? t('channel.processBulkNone')
      : t('channel.bulkProcess');

  if (loading) {
    return (
      <div className="documents">
        <div className="page-header">
          <p className="page-subtitle">{t('channel.loadingChannels')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="documents">
        <div className="page-header">
          <p className="page-subtitle page-subtitle--error">{error}</p>
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="documents">
        <div className="documents-empty-state">
          <Folder size={64} />
          <h2>{t('channel.noChannelsTitle')}</h2>
          <p>{t('channel.noChannelsHint')}</p>
          <Link to="/documents/channels" className="btn btn-primary">
            <Folder size={18} />
            <span>{t('channel.createChannel')}</span>
          </Link>
        </div>
      </div>
    );
  }

  if (!channelId || !channelIds.has(channelId)) {
    return (
      <div className="documents">
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
    <div className="documents">
      <div className="page-header documents-header">
        <div>
          <div className="documents-header-title">
            <h1>{channelName}</h1>
          </div>
          <p className="page-subtitle">
            {channelDescription ?? t('channel.defaultDescription')}
          </p>
        </div>
        <div className="documents-header-actions">
          <Link
            to={`/documents/channels/${channelId}/settings`}
            className="btn btn-secondary"
          >
            <Settings size={18} />
            <span>{t('channel.channelSettings')}</span>
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleUploadClick}
          >
            <Upload size={18} />
            <span>{t('common.upload')}</span>
          </button>
        </div>
      </div>

      <div className="documents-main">
        <div className="documents-toolbar">
          <div className="documents-search">
            <Search size={18} />
            <input
              type="search"
              aria-label={t('channel.searchAria')}
              placeholder={t('channel.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select aria-label={t('channel.filterTypeAria')}>
            <option>{t('channel.filterAll')}</option>
            <option>{t('channel.filterPdf')}</option>
            <option>{t('channel.filterHtml')}</option>
            <option>{t('channel.filterZip')}</option>
            <option>{t('channel.filterImage')}</option>
          </select>
        </div>
        {selectedCount > 0 && (
          <div className="documents-bulk-bar" role="toolbar" aria-label={t('channel.selectedCount', { count: selectedCount })}>
            <span className="documents-bulk-count">{t('channel.selectedCount', { count: selectedCount })}</span>
            <div className="documents-bulk-actions">
              {bulkProcessDisabled ? (
                <span className="documents-bulk-action-wrap" title={bulkProcessTitle}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled
                    aria-label={bulkProcessTitle}
                  >
                    {bulkBusy === 'process' ? (
                      <Loader2 size={16} className="documents-loading-spinner" />
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
                  onClick={() => void handleBulkProcess()}
                  title={bulkProcessTitle}
                >
                  {bulkBusy === 'process' ? (
                    <Loader2 size={16} className="documents-loading-spinner" />
                  ) : (
                    <Play size={16} />
                  )}
                  <span>{t('channel.bulkProcess')}</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleBulkMoveClick}
                disabled={bulkActionsDisabled}
              >
                {bulkBusy === 'move' ? (
                  <Loader2 size={16} className="documents-loading-spinner" />
                ) : (
                  <FolderInput size={16} />
                )}
                <span>{t('channel.bulkMove')}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm documents-bulk-delete"
                onClick={() => void handleBulkDelete()}
                disabled={bulkActionsDisabled}
              >
                {bulkBusy === 'delete' ? (
                  <Loader2 size={16} className="documents-loading-spinner" />
                ) : (
                  <Trash2 size={16} />
                )}
                <span>{t('channel.bulkDelete')}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={clearSelection}
                disabled={bulkActionsDisabled}
              >
                <X size={16} />
                <span>{t('channel.clearSelection')}</span>
              </button>
            </div>
          </div>
        )}
        <div className="documents-table-wrap">
          {docsLoading ? (
            <div className="documents-loading">
              <Loader2 size={32} className="documents-loading-spinner" />
              <p>{t('channel.loadingDocs')}</p>
            </div>
          ) : docsError ? (
            <div className="documents-error">
              <p>{docsError}</p>
            </div>
          ) : docsTotal > 0 ? (
            <>
              <table className="documents-table">
              <thead>
                <tr>
                  <th className="documents-table-select-col">
                    <input
                      type="checkbox"
                      checked={allDocsSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someDocsSelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label={t('channel.selectAllAria')}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <th>{t('channel.tableName')}</th>
                  <th>{t('channel.tableType')}</th>
                  <th>{t('channel.tableSize')}</th>
                  <th>{t('channel.tableStatus')}</th>
                  <th>{t('channel.tableUploaded')}</th>
                  <th className={tableRowActionCellClass}>{t('channel.tableActions')}</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const Icon = fileTypeIcons[doc.file_type] || FileText;
                  const isSelected = selectedDocIds.has(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      className={`documents-table-row-clickable${isSelected ? ' documents-table-row-selected' : ''}`}
                      onClick={() => navigate(`/documents/view/${doc.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/documents/view/${doc.id}`)}
                    >
                      <td className="documents-table-select-col" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleDocSelection(doc.id)}
                          aria-label={t('channel.selectDocAria', { name: doc.name })}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>
                        <div className="documents-table-name">
                          <Icon size={18} strokeWidth={1.5} />
                          <span>{doc.name}</span>
                        </div>
                      </td>
                      <td>{doc.file_type}</td>
                      <td>{formatSize(doc.size_bytes)}</td>
                      <td>
                        <span className={`doc-status doc-status-${doc.status || 'completed'}`}>
                          {doc.status || 'completed'}
                        </span>
                      </td>
                      <td>{formatDate(doc.created_at)}</td>
                      <TableRowActionCell>
                        <TableRowActions>
                          {(doc.status === 'uploaded' || doc.status === 'failed') && (
                            <TableRowActionButton
                              title={
                                isProcessBlockedByMissingPipeline(doc.file_type, channelPipelineId)
                                  ? t('channel.processNoPipeline')
                                  : t('common.process')
                              }
                              aria-label={t('channel.ariaProcess', { name: doc.name })}
                              onClick={(e) => void handleProcessClick(e, doc)}
                              disabled={isProcessBlockedByMissingPipeline(doc.file_type, channelPipelineId)}
                              loading={processingId === doc.id}
                              icon={<Play size={16} />}
                            />
                          )}
                          <TableRowActionButton
                            title={t('common.edit')}
                            aria-label={t('channel.ariaEdit')}
                            icon={<Pencil size={16} />}
                          />
                          <TableRowActionButton
                            title={t('common.move')}
                            aria-label={t('channel.ariaMoveDoc', { name: doc.name })}
                            onClick={(e) => handleMoveClick(e, doc)}
                            icon={<FolderInput size={16} />}
                          />
                          <TableRowActionButton
                            title={t('common.download')}
                            aria-label={t('channel.ariaDownload')}
                            icon={<Download size={16} />}
                          />
                          <TableRowActionButton
                            title={t('common.delete')}
                            aria-label={t('channel.ariaDeleteDoc', { name: doc.name })}
                            variant="danger"
                            onClick={(e) => void handleDeleteClick(e, doc)}
                            loading={deletingId === doc.id}
                            icon={<Trash2 size={16} />}
                          />
                        </TableRowActions>
                      </TableRowActionCell>
                    </tr>
                  );
                })}
              </tbody>
              </table>
              <Pagination
                total={docsTotal}
                page={docsPage}
                pageSize={docsPageSize}
                loading={docsLoading}
                onPageChange={(page) => {
                  setDocsPage(page);
                  setSelectedDocIds(new Set());
                }}
                onPageSizeChange={(size) => {
                  setDocsPageSize(size);
                  setDocsPage(0);
                  setSelectedDocIds(new Set());
                }}
              />
            </>
          ) : (
            <div className="documents-empty">
              <Folder size={48} />
              <p>{t('channel.emptyTitle')}</p>
              <p className="documents-empty-hint">{t('channel.emptyHint')}</p>
            </div>
          )}
        </div>
      </div>

      {showUploadModal && (
        <div
          className="documents-upload-modal-overlay"
          onClick={closeUploadModal}
          onKeyDown={(e) => e.key === 'Escape' && closeUploadModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-modal-title"
        >
          <div
            className="documents-upload-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="documents-upload-modal-header">
              <h2 id="upload-modal-title">{t('channel.uploadModalTitle')}</h2>
              <button
                type="button"
                className="documents-upload-modal-close"
                onClick={closeUploadModal}
                disabled={uploading}
                aria-label={t('common.close')}
              >
                <X size={20} />
              </button>
            </div>
            <p className="documents-upload-modal-hint">
              {t('channel.uploadModalHint')}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.epub,.xmind,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/epub+zip,application/vnd.xmind.workbook"
              multiple
              className="documents-upload-input"
              onChange={handleFileChange}
              aria-hidden
              tabIndex={-1}
            />
            <div
              className="documents-upload-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('documents-upload-dropzone-drag');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('documents-upload-dropzone-drag');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('documents-upload-dropzone-drag');
                const files = Array.from(e.dataTransfer.files).filter(
                  (f) => isAcceptedFile(f)
                );
                setSelectedFiles((prev) => [...prev, ...files]);
              }}
            >
              <Upload size={32} />
              <span>{t('channel.dropzone')}</span>
            </div>
            {uploadError && (
              <p className="documents-upload-error">{uploadError}</p>
            )}
            {selectedFiles.length > 0 && (
              <div className="documents-upload-filelist">
                {selectedFiles.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="documents-upload-file">
                    <FileText size={18} />
                    <span>{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      disabled={uploading}
                      aria-label={`${t('common.close')} ${file.name}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="documents-upload-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeUploadModal}
                disabled={uploading}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleUploadSubmit}
                disabled={selectedFiles.length === 0 || uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 size={18} className="documents-upload-spinner" />
                    <span>{t('common.uploading')}</span>
                  </>
                ) : (
                  <>
                    <Upload size={18} />
                    <span>{t('common.upload')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {moveModalDocIds && moveModalDocIds.length > 0 && (
        <div
          className="documents-upload-modal-overlay"
          onClick={closeMoveModal}
          onKeyDown={(e) => e.key === 'Escape' && closeMoveModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-modal-title"
        >
          <div
            className="documents-upload-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="documents-upload-modal-header">
              <h2 id="move-modal-title">
                {moveModalDocIds.length > 1
                  ? t('channel.moveModalTitleBulk')
                  : t('channel.moveModalTitle')}
              </h2>
              <button
                type="button"
                className="documents-upload-modal-close"
                onClick={closeMoveModal}
                disabled={moveLoading}
                aria-label={t('common.close')}
              >
                <X size={20} />
              </button>
            </div>
            <p className="documents-upload-modal-hint">
              {moveModalDocIds.length > 1
                ? t('channel.moveModalHintBulk', { count: moveModalDocIds.length })
                : t('channel.moveModalHint', { name: moveModalDocs[0]?.name ?? '' })}
            </p>
            <div className="documents-move-form">
              <label htmlFor="move-target-channel">{t('common.targetChannel')}</label>
              <select
                id="move-target-channel"
                value={moveTargetChannelId}
                onChange={(e) => setMoveTargetChannelId(e.target.value)}
                className="documents-move-select"
              >
                {channelOptions.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {'—'.repeat(ch.depth)} {ch.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="documents-upload-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeMoveModal}
                disabled={moveLoading}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleMoveConfirm()}
                disabled={
                  moveLoading ||
                  !moveTargetChannelId ||
                  moveModalDocs.every((d) => d.channel_id === moveTargetChannelId)
                }
              >
                {moveLoading ? (
                  <>
                    <Loader2 size={18} className="documents-upload-spinner" />
                    <span>{t('common.moving')}</span>
                  </>
                ) : (
                  <>
                    <FolderInput size={18} />
                    <span>{t('common.move')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
