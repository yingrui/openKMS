import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { ChannelIndexPage } from '../../components/channels/ChannelIndexPage';
import { useEnsureArticleChannels } from '../../contexts/ArticleChannelsContext';
import { fetchArticleStats } from '../../data/articlesApi';

export function ArticlesIndex() {
  const { t } = useTranslation('documents');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { channels, loading, error } = useEnsureArticleChannels();
  const [articleCount, setArticleCount] = useState<number | null>(null);

  useEffect(() => {
    const legacyChannel = searchParams.get('channel');
    if (legacyChannel) {
      navigate(`/articles/channels/${encodeURIComponent(legacyChannel)}`, { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    fetchArticleStats()
      .then((s) => setArticleCount(s.total))
      .catch(() => setArticleCount(0));
  }, []);

  return (
    <ChannelIndexPage
      basePath="/articles"
      channels={channels}
      loading={loading}
      error={error}
      itemCount={articleCount}
      ItemIcon={FileText}
      labels={{
        loading: t('common.loading'),
        title: t('articlesIndex.title'),
        subtitle: t('articlesIndex.subtitle'),
        statChannels: t('articlesIndex.statChannels'),
        statItems: t('articlesIndex.statArticles'),
        quickActions: t('articlesIndex.quickActions'),
        manageChannels: t('articlesIndex.manageChannels'),
        browse: t('articlesIndex.browseArticles'),
      }}
    />
  );
}
