import { useSearchParams, Link } from 'react-router-dom';
import {
  FileText,
  Upload,
  Search,
  Eye,
  Pencil,
  FolderInput,
  Download,
  Trash2,
  Image,
  FileCode,
  Archive,
  Folder,
} from 'lucide-react';
import { defaultDocumentChannel, getDocumentLeafChannelIds } from '../data/channels';
import './Documents.css';

const fileTypeIcons: Record<string, typeof FileText> = {
  PDF: FileText,
  HTML: FileCode,
  ZIP: Archive,
  PNG: Image,
  JPG: Image,
};

interface DocumentItem {
  id: string;
  name: string;
  type: string;
  size: string;
  uploaded: string;
  markdown: boolean;
}

const mockDocumentsByChannel: Record<string, DocumentItem[]> = {
  dc1a: [
    { id: '1', name: 'Life_Insurance_Brochure.pdf', type: 'PDF', size: '1.2 MB', uploaded: '2 days ago', markdown: true },
    { id: '2', name: 'Auto_Coverage_Guide.html', type: 'HTML', size: '256 KB', uploaded: '1 week ago', markdown: true },
  ],
  dc1b: [
    { id: '3', name: 'Commission_Structure_2024.pdf', type: 'PDF', size: '456 KB', uploaded: '3 days ago', markdown: true },
  ],
  dc2a: [
    { id: '4', name: 'Risk_Selection_Guidelines.pdf', type: 'PDF', size: '892 KB', uploaded: '2 weeks ago', markdown: true },
  ],
  dc2b: [
    { id: '5', name: 'Policy_Terms_Standard.pdf', type: 'PDF', size: '1.5 MB', uploaded: '1 week ago', markdown: true },
  ],
  dc3a: [
    { id: '6', name: 'Claims_Process_Flow.pdf', type: 'PDF', size: '324 KB', uploaded: '5 days ago', markdown: true },
  ],
  dc3b: [
    { id: '7', name: 'Renewal_Checklist.pdf', type: 'PDF', size: '128 KB', uploaded: '3 days ago', markdown: true },
  ],
  dc3c: [],
  root: [],
  dc1: [],
  dc2: [],
  dc3: [],
};

export function Documents() {
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
        <button type="button" className="btn btn-primary">
          <Upload size={18} />
          <span>Upload</span>
        </button>
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
                    <tr key={doc.id}>
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
                      <td className="documents-table-actions">
                        <div className="documents-table-btns">
                          <Link to={`/documents/view/${doc.id}`} title="View" aria-label="View">
                            <Eye size={16} />
                          </Link>
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
