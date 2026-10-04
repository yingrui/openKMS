import { useTranslation } from 'react-i18next';
import { ChannelTreeManager } from '../../components/channels/ChannelTreeManager';
import { useMediaChannels } from '../../contexts/MediaChannelsContext';
import { mediaChannelTreeApi } from '../../data/mediaChannelsApi';

export function MediaChannels() {
  const { t } = useTranslation('media');
  return (
    <ChannelTreeManager
      ns="media"
      basePath="/media"
      backLabel={t('channels.backToMedia')}
      tree={useMediaChannels()}
      api={mediaChannelTreeApi}
      linkChannelNames
    />
  );
}
