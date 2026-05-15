import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileStack, Folder, Upload } from 'lucide-react';
import { useDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { flattenChannels, getFirstLeafChannelId } from '../../data/channelUtils';
import { fetchDocumentStats } from '../../data/documentsApi';
import './DocumentsIndex.css';

export function DocumentsIndex() {
  const { t } = useTranslation('documents');
  const { channels, loading, error } = useDocumentChannels();
  const [documentCount, setDocumentCount] = useState<number | null>(null);

  useEffect(() => {
    fetchDocumentStats()
      .then((stats) => setDocumentCount(stats.total))
      .catch(() => setDocumentCount(0));
  }, []);
  const channelCount = flattenChannels(channels).length;
  const firstLeafId = getFirstLeafChannelId(channels);

  if (loading) {
    return (
      <div className="documents-index">
        <div className="page-header">
          <p className="page-subtitle">{t('common.loading')}</p>
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
        <h1>{t('index.title')}</h1>
        <p className="page-subtitle">
          {t('index.subtitle')}
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
            <span className="documents-index-stat-label">{t('index.statChannels')}</span>
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
            <span className="documents-index-stat-value">{documentCount ?? '–'}</span>
            <span className="documents-index-stat-label">{t('index.statDocuments')}</span>
          </div>
        </Link>
      </section>

      <div className="documents-index-grid">
        <section className="documents-index-card">
          <h2>{t('index.quickActions')}</h2>
          <div className="documents-index-quick-actions">
            <Link to="/documents/channels" className="documents-index-quick-action">
              <Folder size={20} />
              <span>{t('index.manageChannels')}</span>
            </Link>
            <Link
              to={firstLeafId ? `/documents/channels/${firstLeafId}` : '/documents/channels'}
              className="documents-index-quick-action"
            >
              <Upload size={20} />
              <span>{t('index.uploadDocument')}</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
