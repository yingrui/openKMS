import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image } from 'lucide-react';
import { ChannelIndexPage } from '../../components/channels/ChannelIndexPage';
import { useEnsureMediaChannels } from '../../contexts/MediaChannelsContext';
import { config } from '../../config';
import { getAuthHeaders, authAwareFetch } from '../../data/apiClient';

export function MediaIndex() {
  const { t } = useTranslation('media');
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

  return (
    <ChannelIndexPage
      basePath="/media"
      channels={channels}
      loading={loading}
      error={error}
      itemCount={assetCount}
      ItemIcon={Image}
      labels={{
        loading: t('common.loading'),
        title: t('index.title'),
        subtitle: t('index.subtitle'),
        statChannels: t('index.statChannels'),
        statItems: t('index.statAssets'),
        quickActions: t('index.quickActions'),
        manageChannels: t('index.manageChannels'),
        browse: t('index.browseMedia'),
      }}
    />
  );
}
