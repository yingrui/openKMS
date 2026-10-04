import { useTranslation } from 'react-i18next';
import { ChannelTreeManager } from '../../components/channels/ChannelTreeManager';
import { useDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { documentChannelTreeApi } from '../../data/channelsApi';

export function DocumentChannels() {
  const { t } = useTranslation('documents');
  return (
    <ChannelTreeManager
      ns="documents"
      basePath="/documents"
      backLabel={t('common.backToDocuments')}
      tree={useDocumentChannels()}
      api={documentChannelTreeApi}
    />
  );
}
