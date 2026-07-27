import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Image, Folder } from 'lucide-react';
import { useEnsureMediaChannels } from '../../contexts/MediaChannelsContext';
import { flattenChannels, getFirstLeafChannelId } from '../../data/channelUtils';
import { config } from '../../config';
import { getAuthHeaders, authAwareFetch } from '../../data/apiClient';
import '../../styles/list-index.scss';

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
        <p className="page-subtitle">{t('index.subtitle')}</p>
      </div>
      <section className="list-index-stats">
        <Link to="/media/channels" className="list-index-stat list-index-stat--channels">
          <div className="list-index-stat-icon">
            <Folder size={24} strokeWidth={1.75} />
          </div>
          <div className="list-index-stat-content">
            <span className="list-index-stat-value">{channelCount}</span>
            <span className="list-index-stat-label">{t('index.statChannels')}</span>
          </div>
        </Link>
        <Link
          to={firstLeafId ? `/media/channels/${firstLeafId}` : '/media/channels'}
          className="list-index-stat list-index-stat--items"
        >
          <div className="list-index-stat-icon">
            <Image size={24} strokeWidth={1.75} />
          </div>
          <div className="list-index-stat-content">
            <span className="list-index-stat-value">{assetCount ?? '–'}</span>
            <span className="list-index-stat-label">{t('index.statAssets')}</span>
          </div>
        </Link>
      </section>
      <div className="list-index-grid">
        <section className="list-index-card">
          <h2>{t('index.quickActions')}</h2>
          <div className="list-index-quick-actions">
            <Link to="/media/channels" className="list-index-quick-action">
              <Folder size={20} />
              <span>{t('index.manageChannels')}</span>
            </Link>
            <button
              type="button"
              className="list-index-quick-action"
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
