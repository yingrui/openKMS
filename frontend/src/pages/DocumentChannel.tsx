import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useDocumentChannels } from '../contexts/DocumentChannelsContext';
import {
  getDocumentChannelName,
  getDocumentChannelDescription,
  flattenChannels,
} from '../data/channelUtils';
import {
  fetchDocumentsByChannel,
  uploadDocument,
  deleteDocument,
  updateDocument,
  isAcceptedFile,
  type DocumentResponse,
} from '../data/documentsApi';
import { toast } from 'sonner';
import { createJob } from '../data/jobsApi';
import './DocumentChannel.css';

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

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [moveDoc, setMoveDoc] = useState<DocumentResponse | null>(null);
  const [moveTargetChannelId, setMoveTargetChannelId] = useState('');
  const [moveLoading, setMoveLoading] = useState(false);

  const channelName = getDocumentChannelName(channels, channelId);
  const channelOptions = flattenChannels(channels);
  const channelDescription = getDocumentChannelDescription(channels, channelId);

  const loadDocuments = useCallback(async () => {
    if (!channelId) return;
    setDocsLoading(true);
    setDocsError(null);
    try {
      const res = await fetchDocumentsByChannel(channelId);
      setDocuments(res.items);
    } catch (e) {
      setDocsError(e instanceof Error ? e.message : t('channel.loadDocsFailed'));
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  }, [channelId, t]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

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

  const handleDeleteClick = async (e: React.MouseEvent, doc: DocumentResponse) => {
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

  const handleProcessClick = async (e: React.MouseEvent, doc: DocumentResponse) => {
    e.stopPropagation();
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

  const handleMoveClick = (e: React.MouseEvent, doc: DocumentResponse) => {
    e.stopPropagation();
    setMoveDoc(doc);
    setMoveTargetChannelId(doc.channel_id);
  };

  const closeMoveModal = () => {
    if (!moveLoading) {
      setMoveDoc(null);
      setMoveTargetChannelId('');
    }
  };

  const handleMoveConfirm = async () => {
    if (!moveDoc || !moveTargetChannelId || moveTargetChannelId === moveDoc.channel_id) {
      closeMoveModal();
      return;
    }
    setMoveLoading(true);
    try {
      await updateDocument(moveDoc.id, { channel_id: moveTargetChannelId });
      toast.success(t('channel.movedToast', { name: moveDoc.name }));
      await loadDocuments();
      if (refetchChannels) await refetchChannels();
      closeMoveModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('channel.moveFailed'));
    } finally {
      setMoveLoading(false);
    }
  };

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
          <p className="page-subtitle" style={{ color: 'var(--color-error)' }}>{error}</p>
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
            <input type="search" aria-label={t('channel.searchAria')} placeholder={t('channel.searchPlaceholder')} />
          </div>
          <select aria-label={t('channel.filterTypeAria')}>
            <option>{t('channel.filterAll')}</option>
            <option>{t('channel.filterPdf')}</option>
            <option>{t('channel.filterHtml')}</option>
            <option>{t('channel.filterZip')}</option>
            <option>{t('channel.filterImage')}</option>
          </select>
        </div>
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
          ) : documents.length > 0 ? (
            <table className="documents-table">
              <thead>
                <tr>
                  <th>{t('channel.tableName')}</th>
                  <th>{t('channel.tableType')}</th>
                  <th>{t('channel.tableSize')}</th>
                  <th>{t('channel.tableStatus')}</th>
                  <th>{t('channel.tableUploaded')}</th>
                  <th className="documents-table-actions">{t('channel.tableActions')}</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const Icon = fileTypeIcons[doc.file_type] || FileText;
                  return (
                    <tr
                      key={doc.id}
                      className="documents-table-row-clickable"
                      onClick={() => navigate(`/documents/view/${doc.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/documents/view/${doc.id}`)}
                    >
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
                      <td className="documents-table-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="documents-table-btns">
                          {(doc.status === 'uploaded' || doc.status === 'failed') && (
                            <button
                              type="button"
                              title={t('common.process')}
                              aria-label={t('channel.ariaProcess', { name: doc.name })}
                              onClick={(e) => handleProcessClick(e, doc)}
                              disabled={processingId === doc.id}
                            >
                              {processingId === doc.id ? (
                                <Loader2 size={16} className="documents-loading-spinner" />
                              ) : (
                                <Play size={16} />
                              )}
                            </button>
                          )}
                          <button type="button" title={t('common.edit')} aria-label={t('channel.ariaEdit')}>
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            title={t('common.move')}
                            aria-label={t('channel.ariaMoveDoc', { name: doc.name })}
                            onClick={(e) => handleMoveClick(e, doc)}
                          >
                            <FolderInput size={16} />
                          </button>
                          <button type="button" title={t('common.download')} aria-label={t('channel.ariaDownload')}>
                            <Download size={16} />
                          </button>
                          <button
                            type="button"
                            title={t('common.delete')}
                            aria-label={t('channel.ariaDeleteDoc', { name: doc.name })}
                            onClick={(e) => handleDeleteClick(e, doc)}
                            disabled={deletingId === doc.id}
                          >
                            {deletingId === doc.id ? (
                              <Loader2 size={16} className="documents-loading-spinner" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

      {moveDoc && (
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
              <h2 id="move-modal-title">{t('channel.moveModalTitle')}</h2>
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
              {t('channel.moveModalHint', { name: moveDoc.name })}
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
                onClick={handleMoveConfirm}
                disabled={moveLoading || moveTargetChannelId === moveDoc.channel_id}
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
