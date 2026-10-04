import { useTranslation } from 'react-i18next';
import { ChannelTreeManager } from '../../components/channels/ChannelTreeManager';
import { useArticleChannels } from '../../contexts/ArticleChannelsContext';
import { articleChannelTreeApi } from '../../data/articleChannelsApi';

export function ArticleChannels() {
  const { t } = useTranslation('articles');
  return (
    <ChannelTreeManager
      ns="articles"
      basePath="/articles"
      backLabel={t('channels.backToArticles')}
      tree={useArticleChannels()}
      api={articleChannelTreeApi}
    />
  );
}
