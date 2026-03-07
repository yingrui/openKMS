import { Link } from 'react-router-dom';
import { FileStack, Folder, Upload } from 'lucide-react';
import { useDocumentChannels } from '../contexts/DocumentChannelsContext';
import { flattenChannels, getFirstLeafChannelId } from '../data/channelUtils';
import { mockDocumentsByChannel } from '../data/documents';
import './DocumentsIndex.css';

const totalDocuments = Object.values(mockDocumentsByChannel).reduce(
  (sum, arr) => sum + arr.length,
  0
);

export function DocumentsIndex() {
  const { channels, loading, error } = useDocumentChannels();
  const flatChannels = flattenChannels(channels);
  const channelCount = flatChannels.length;
  const firstLeafId = getFirstLeafChannelId(channels);

  if (loading) {
    return (
      <div className="documents-index">
        <div className="page-header">
          <p className="page-subtitle">Loading…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="documents-index">
        <div className="page-header">
          <p className="page-subtitle" style={{ color: 'var(--color-error)' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="documents-index">
      <div className="page-header">
        <h1>Documents</h1>
        <p className="page-subtitle">
          Organize documents in channel trees. Upload PDF, HTML, ZIP, or images. Manage channels to create your structure.
        </p>
      </div>

      <section className="documents-index-stats">
        <Link
          to="/documents/channels"
          className="documents-index-stat documents-index-stat-channels"
        >
          <div className="documents-index-stat-icon">
            <Folder size={24} strokeWidth={1.75} />
          </div>
          <div className="documents-index-stat-content">
            <span className="documents-index-stat-value">{channelCount}</span>
            <span className="documents-index-stat-label">Channels</span>
          </div>
        </Link>
        <Link
          to={firstLeafId ? `/documents/channels/${firstLeafId}` : '/documents/channels'}
          className="documents-index-stat documents-index-stat-docs"
        >
          <div className="documents-index-stat-icon">
            <FileStack size={24} strokeWidth={1.75} />
          </div>
          <div className="documents-index-stat-content">
            <span className="documents-index-stat-value">{totalDocuments}</span>
            <span className="documents-index-stat-label">Documents</span>
          </div>
        </Link>
      </section>

      <div className="documents-index-grid">
        <section className="documents-index-card">
          <h2>Quick Actions</h2>
          <div className="documents-index-quick-actions">
            <Link to="/documents/channels" className="documents-index-quick-action">
              <Folder size={20} />
              <span>Manage channels</span>
            </Link>
            <Link
              to={firstLeafId ? `/documents/channels/${firstLeafId}` : '/documents/channels'}
              className="documents-index-quick-action"
            >
              <Upload size={20} />
              <span>Upload document</span>
            </Link>
          </div>
        </section>

        <section className="documents-index-card">
          <h2>Channels</h2>
          {flatChannels.length === 0 ? (
            <div className="documents-index-empty">
              <Folder size={40} />
              <p>No channels yet</p>
              <Link to="/documents/channels" className="btn btn-primary">
                Create first channel
              </Link>
            </div>
          ) : (
            <ul className="documents-index-channel-list">
              {flatChannels.map(({ id, name, depth }) => (
                <li key={id} style={{ paddingLeft: depth * 16 }}>
                  <Link to={`/documents/channels/${id}`} className="documents-index-channel-item">
                    <Folder size={16} />
                    <span>{name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
