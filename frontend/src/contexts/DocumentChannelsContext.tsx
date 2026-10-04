import { documentChannelTreeApi } from '../data/channelsApi';
import { createChannelTreeContext } from './createChannelTreeContext';

const { Provider, useChannels, useEnsureChannels } = createChannelTreeContext(
  'DocumentChannels',
  documentChannelTreeApi.fetchAll,
);

export const DocumentChannelsProvider = Provider;
export const useDocumentChannels = useChannels;
export const useEnsureDocumentChannels = useEnsureChannels;
