import { useSearchParams, useNavigate, Link } from 'react-router-dom';
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
} from 'lucide-react';
import { defaultDocumentChannel, getDocumentLeafChannelIds } from '../data/channels';
import { mockDocumentsByChannel } from '../data/documents';
import './Documents.css';

const fileTypeIcons: Record<string, typeof FileText> = {
  PDF: FileText,
  HTML: FileCode,
  ZIP: Archive,
  PNG: Image,
  JPG: Image,
};


export function Documents() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const channelId = searchParams.get('channel') || defaultDocumentChannel;
  const leafIds = getDocumentLeafChannelIds(channelId);
  const documents = leafIds.flatMap((id) => mockDocumentsByChannel[id] ?? []);

  return (
    <div className="documents">
      <div className="page-header documents-header">
        <div>
          <h1>Documents</h1>
          <p className="page-subtitle">
            Select a channel in the sidebar. Upload PDF, HTML, ZIP, or images → Markdown.
          </p>
        </div>
        <div className="documents-header-actions">
          <Link
            to={`/documents/settings?channel=${channelId}`}
            className="btn btn-secondary"
          >
            <Settings size={18} />
            <span>Channel settings</span>
          </Link>
          <button type="button" className="btn btn-primary">
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
          {documents.length > 0 ? (
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
                  const Icon = fileTypeIcons[doc.type] || FileText;
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
                      <td>{doc.type}</td>
                      <td>{doc.size}</td>
                      <td>{doc.uploaded}</td>
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
                          <button type="button" title="Delete" aria-label="Delete">
                            <Trash2 size={16} />
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
    </div>
  );
}
