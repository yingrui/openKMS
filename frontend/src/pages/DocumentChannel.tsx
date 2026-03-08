import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import { useDocumentChannels } from '../contexts/DocumentChannelsContext';
import {
  getDocumentChannelName,
  getDocumentChannelDescription,
} from '../data/channelUtils';
import {
  fetchDocumentsByChannel,
  uploadDocument,
  deleteDocument,
  isAcceptedFile,
  type DocumentResponse,
} from '../data/documentsApi';
import './DocumentChannel.css';

const fileTypeIcons: Record<string, typeof FileText> = {
  PDF: FileText,
  HTML: FileCode,
  ZIP: Archive,
  PNG: Image,
  JPG: Image,
  JPEG: Image,
  WEBP: Image,
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const { channels, loading, error } = useDocumentChannels();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const channelName = getDocumentChannelName(channels, channelId);
  const channelDescription = getDocumentChannelDescription(channels, channelId);

  const loadDocuments = useCallback(async () => {
    if (!channelId) return;
    setDocsLoading(true);
    setDocsError(null);
    try {
      const res = await fetchDocumentsByChannel(channelId);
      setDocuments(res.items);
    } catch (e) {
      setDocsError(e instanceof Error ? e.message : 'Failed to load documents');
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  }, [channelId]);

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
      setUploadError(
        'Some files were skipped. Supported: PDF, PNG, JPG, JPEG, WEBP'
      );
    }
    setSelectedFiles(accepted);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0 || !channelId) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of selectedFiles) {
        await uploadDocument(channelId, file);
      }
      setSelectedFiles([]);
      setShowUploadModal(false);
      await loadDocuments();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
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
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    setDeletingId(doc.id);
    try {
      await deleteDocument(doc.id);
      await loadDocuments();
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="documents">
        <div className="page-header">
          <p className="page-subtitle">Loading channels…</p>
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
          <h2>No channels yet</h2>
          <p>Create your first channel to organize documents.</p>
          <Link to="/documents/channels" className="btn btn-primary">
            <Folder size={18} />
            <span>Create channel</span>
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
            {channelDescription ?? 'Upload PDF, HTML, ZIP, or images. Documents are converted to Markdown. Organize by channel.'}
          </p>
        </div>
        <div className="documents-header-actions">
          <Link
            to={`/documents/channels/${channelId}/settings`}
            className="btn btn-secondary"
          >
            <Settings size={18} />
            <span>Channel settings</span>
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleUploadClick}
          >
            <Upload size={18} />
            <span>Upload</span>
          </button>
        </div>
      </div>

      <div className="documents-main">
        <div className="documents-toolbar">
          <div className="documents-search">
            <Search size={18} />
            <input type="search" placeholder="Search in channel..." />
          </div>
          <select aria-label="Filter by type">
            <option>All types</option>
            <option>PDF</option>
            <option>HTML</option>
            <option>ZIP</option>
            <option>Image</option>
          </select>
        </div>
        <div className="documents-table-wrap">
          {docsLoading ? (
            <div className="documents-loading">
              <Loader2 size={32} className="documents-loading-spinner" />
              <p>Loading documents…</p>
            </div>
          ) : docsError ? (
            <div className="documents-error">
              <p>{docsError}</p>
            </div>
          ) : documents.length > 0 ? (
            <table className="documents-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Markdown</th>
                  <th className="documents-table-actions">Actions</th>
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
                      <td>{formatDate(doc.created_at)}</td>
                      <td>
                        {doc.markdown ? (
                          <span className="documents-table-badge">Yes</span>
                        ) : (
                          <span className="documents-table-muted">—</span>
                        )}
                      </td>
                      <td className="documents-table-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="documents-table-btns">
                          <button type="button" title="Edit" aria-label="Edit">
                            <Pencil size={16} />
                          </button>
                          <button type="button" title="Move" aria-label="Move to channel">
                            <FolderInput size={16} />
                          </button>
                          <button type="button" title="Download" aria-label="Download">
                            <Download size={16} />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            aria-label={`Delete ${doc.name}`}
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
              <p>No documents in this channel</p>
              <p className="documents-empty-hint">Upload or move documents here</p>
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
              <h2 id="upload-modal-title">Upload documents</h2>
              <button
                type="button"
                className="documents-upload-modal-close"
                onClick={closeUploadModal}
                disabled={uploading}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <p className="documents-upload-modal-hint">
              PDF, PNG, JPG, JPEG, WEBP supported.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
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
              <span>Choose files or drag and drop</span>
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
                      aria-label={`Remove ${file.name}`}
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
                Cancel
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
                    <span>Uploading…</span>
                  </>
                ) : (
                  <>
                    <Upload size={18} />
                    <span>Upload</span>
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
