import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileStack, Upload } from 'lucide-react';
import { ChannelIndexPage } from '../../components/channels/ChannelIndexPage';
import { useEnsureDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { fetchDocumentStats } from '../../data/documentsApi';

export function DocumentsIndex() {
  const { t } = useTranslation('documents');
  const { channels, loading, error } = useEnsureDocumentChannels();
  const [documentCount, setDocumentCount] = useState<number | null>(null);

  useEffect(() => {
    fetchDocumentStats()
      .then((stats) => setDocumentCount(stats.total))
      .catch(() => setDocumentCount(0));
  }, []);

  return (
    <ChannelIndexPage
      basePath="/documents"
      channels={channels}
      loading={loading}
      error={error}
      itemCount={documentCount}
      ItemIcon={FileStack}
      BrowseIcon={Upload}
      labels={{
        loading: t('common.loading'),
        title: t('index.title'),
        subtitle: t('index.subtitle'),
        statChannels: t('index.statChannels'),
        statItems: t('index.statDocuments'),
        quickActions: t('index.quickActions'),
        manageChannels: t('index.manageChannels'),
        browse: t('index.uploadDocument'),
      }}
    />
  );
}
