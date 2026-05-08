import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Folder } from 'lucide-react';
import { useArticleChannels } from '../contexts/ArticleChannelsContext';
import { flattenChannels, getFirstLeafChannelId } from '../data/channelUtils';
import { fetchArticleStats } from '../data/articlesApi';
import './DocumentsIndex.css';

export function ArticlesIndex() {
  const { t } = useTranslation('documents');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { channels, loading, error } = useArticleChannels();
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

  const channelCount = flattenChannels(channels).length;
  const firstLeafId = getFirstLeafChannelId(channels);

  if (loading) {
    return (
      <div className="documents-index">
        <div className="page-header">
          <p className="page-subtitle">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="documents-index">
        <div className="page-header">
          <p className="page-subtitle" style={{ color: 'var(--color-error)' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="documents-index">
      <div className="page-header">
        <h1>{t('articlesIndex.title')}</h1>
        <p className="page-subtitle">
          {t('articlesIndex.subtitle')}
        </p>
      </div>

      <section className="documents-index-stats">
        <Link to="/articles/channels" className="documents-index-stat documents-index-stat-channels">
          <div className="documents-index-stat-icon">
            <Folder size={24} strokeWidth={1.75} />
          </div>
          <div className="documents-index-stat-content">
            <span className="documents-index-stat-value">{channelCount}</span>
            <span className="documents-index-stat-label">{t('articlesIndex.statChannels')}</span>
          </div>
        </Link>
        <Link
          to={firstLeafId ? `/articles/channels/${firstLeafId}` : '/articles/channels'}
          className="documents-index-stat documents-index-stat-docs"
        >
          <div className="documents-index-stat-icon">
            <FileText size={24} strokeWidth={1.75} />
          </div>
          <div className="documents-index-stat-content">
            <span className="documents-index-stat-value">{articleCount ?? '–'}</span>
            <span className="documents-index-stat-label">{t('articlesIndex.statArticles')}</span>
          </div>
        </Link>
      </section>

      <div className="documents-index-grid">
        <section className="documents-index-card">
          <h2>{t('articlesIndex.quickActions')}</h2>
          <div className="documents-index-quick-actions">
            <Link to="/articles/channels" className="documents-index-quick-action">
              <Folder size={20} />
              <span>{t('articlesIndex.manageChannels')}</span>
            </Link>
            <Link
              to={firstLeafId ? `/articles/channels/${firstLeafId}` : '/articles/channels'}
              className="documents-index-quick-action"
            >
              <FileText size={20} />
              <span>{t('articlesIndex.browseArticles')}</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
