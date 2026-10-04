import { articleChannelTreeApi } from '../data/articleChannelsApi';
import { createChannelTreeContext } from './createChannelTreeContext';

const { Provider, useChannels, useEnsureChannels } = createChannelTreeContext(
  'ArticleChannels',
  articleChannelTreeApi.fetchAll,
);

export const ArticleChannelsProvider = Provider;
export const useArticleChannels = useChannels;
export const useEnsureArticleChannels = useEnsureChannels;
