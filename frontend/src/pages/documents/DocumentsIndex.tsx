import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileStack, Folder, Upload } from 'lucide-react';
import { useEnsureDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { flattenChannels, getFirstLeafChannelId } from '../../data/channelUtils';
import { fetchDocumentStats } from '../../data/documentsApi';
import '../../styles/list-index.scss';

export function DocumentsIndex() {
  const { t } = useTranslation('documents');
  const { channels, loading, error } = useEnsureDocumentChannels();
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
      <div className="list-index">
        <div className="page-header">
          <p className="page-subtitle">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="list-index">
        <div className="page-header">
          <p className="page-subtitle page-subtitle--error">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="list-index">
      <div className="page-header">
        <h1>{t('index.title')}</h1>
        <p className="page-subtitle">
          {t('index.subtitle')}
        </p>
      </div>

      <section className="list-index-stats">
        <Link
          to="/documents/channels"
          className="list-index-stat list-index-stat--channels"
        >
          <div className="list-index-stat-icon">
            <Folder size={24} strokeWidth={1.75} />
          </div>
          <div className="list-index-stat-content">
            <span className="list-index-stat-value">{channelCount}</span>
            <span className="list-index-stat-label">{t('index.statChannels')}</span>
          </div>
        </Link>
        <Link
          to={firstLeafId ? `/documents/channels/${firstLeafId}` : '/documents/channels'}
          className="list-index-stat list-index-stat--items"
        >
          <div className="list-index-stat-icon">
            <FileStack size={24} strokeWidth={1.75} />
          </div>
          <div className="list-index-stat-content">
            <span className="list-index-stat-value">{documentCount ?? '–'}</span>
            <span className="list-index-stat-label">{t('index.statDocuments')}</span>
          </div>
        </Link>
      </section>

      <div className="list-index-grid">
        <section className="list-index-card">
          <h2>{t('index.quickActions')}</h2>
          <div className="list-index-quick-actions">
            <Link to="/documents/channels" className="list-index-quick-action">
              <Folder size={20} />
              <span>{t('index.manageChannels')}</span>
            </Link>
            <Link
              to={firstLeafId ? `/documents/channels/${firstLeafId}` : '/documents/channels'}
              className="list-index-quick-action"
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
