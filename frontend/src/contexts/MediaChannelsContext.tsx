import { mediaChannelTreeApi } from '../data/mediaChannelsApi';
import { createChannelTreeContext } from './createChannelTreeContext';
import { useFeatureToggles } from './FeatureTogglesContext';

function useMediaEnabled() {
  return useFeatureToggles().toggles.media;
}

const { Provider, useChannels, useEnsureChannels } = createChannelTreeContext(
  'MediaChannels',
  mediaChannelTreeApi.fetchAll,
  useMediaEnabled,
);

export const MediaChannelsProvider = Provider;
export const useMediaChannels = useChannels;
export const useEnsureMediaChannels = useEnsureChannels;
