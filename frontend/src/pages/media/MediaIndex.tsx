import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Image, Folder } from 'lucide-react';
import { useEnsureMediaChannels } from '../../contexts/MediaChannelsContext';
import { flattenChannels, getFirstLeafChannelId } from '../../data/channelUtils';
import { config } from '../../config';
import { getAuthHeaders, authAwareFetch } from '../../data/apiClient';
import '../documents/DocumentsIndex.scss';

export function MediaIndex() {
  const { t } = useTranslation('media');
  const navigate = useNavigate();
  const { channels, loading, error } = useEnsureMediaChannels();
  const [assetCount, setAssetCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await authAwareFetch(`${config.apiUrl}/api/media/stats`, {
          headers,
          credentials: 'include',
        });
        if (res.ok) {
          const s = await res.json();
          setAssetCount(s.total);
        } else setAssetCount(0);
      } catch {
        setAssetCount(0);
      }
    })();
  }, []);

  const channelCount = flattenChannels(channels).length;
  const firstLeafId = getFirstLeafChannelId(channels);

  if (loading) {
    return (
      <div className="documents-index">
        <div className="page-header">
          <p className="page-subtitle">{t('index.title')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="documents-index">
        <div className="page-header">
          <p className="page-subtitle page-subtitle--error">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="documents-index">
      <div className="page-header">
        <h1>{t('index.title')}</h1>
        <p className="page-subtitle">{t('index.subtitle')}</p>
      </div>
      <section className="documents-index-stats">
        <Link to="/media/channels" className="documents-index-stat documents-index-stat-channels">
          <div className="documents-index-stat-icon">
            <Folder size={24} strokeWidth={1.75} />
          </div>
          <div className="documents-index-stat-content">
            <span className="documents-index-stat-value">{channelCount}</span>
            <span className="documents-index-stat-label">{t('index.statChannels')}</span>
          </div>
        </Link>
        <Link
          to={firstLeafId ? `/media/channels/${firstLeafId}` : '/media/channels'}
          className="documents-index-stat documents-index-stat-docs"
        >
          <div className="documents-index-stat-icon">
            <Image size={24} strokeWidth={1.75} />
          </div>
          <div className="documents-index-stat-content">
            <span className="documents-index-stat-value">{assetCount ?? '–'}</span>
            <span className="documents-index-stat-label">{t('index.statAssets')}</span>
          </div>
        </Link>
      </section>
      <div className="documents-index-grid">
        <section className="documents-index-card">
          <h2>{t('index.quickActions')}</h2>
          <div className="documents-index-quick-actions">
            <Link to="/media/channels" className="documents-index-quick-action">
              <Folder size={20} />
              <span>{t('index.manageChannels')}</span>
            </Link>
            <button
              type="button"
              className="documents-index-quick-action"
              onClick={() => navigate(firstLeafId ? `/media/channels/${firstLeafId}` : '/media/channels')}
            >
              <Image size={20} />
              <span>{t('index.browseMedia')}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
