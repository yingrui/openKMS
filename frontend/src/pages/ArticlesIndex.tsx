import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Folder } from 'lucide-react';
import { useArticleChannels } from '../contexts/ArticleChannelsContext';
import { flattenChannels, getFirstLeafChannelId } from '../data/channelUtils';
import { fetchArticleStats } from '../data/articlesApi';
import './DocumentsIndex.css';

export function ArticlesIndex() {
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
          <p className="page-subtitle">Loading…</p>
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
        <h1>Articles</h1>
        <p className="page-subtitle">
          Organize articles in channel trees. Write markdown, attach files, and track versions. Manage channels to match
          how you structure knowledge.
        </p>
      </div>

      <section className="documents-index-stats">
        <Link to="/articles/channels" className="documents-index-stat documents-index-stat-channels">
          <div className="documents-index-stat-icon">
            <Folder size={24} strokeWidth={1.75} />
          </div>
          <div className="documents-index-stat-content">
            <span className="documents-index-stat-value">{channelCount}</span>
            <span className="documents-index-stat-label">Channels</span>
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
            <span className="documents-index-stat-label">Articles</span>
          </div>
        </Link>
      </section>

      <div className="documents-index-grid">
        <section className="documents-index-card">
          <h2>Quick Actions</h2>
          <div className="documents-index-quick-actions">
            <Link to="/articles/channels" className="documents-index-quick-action">
              <Folder size={20} />
              <span>Manage channels</span>
            </Link>
            <Link
              to={firstLeafId ? `/articles/channels/${firstLeafId}` : '/articles/channels'}
              className="documents-index-quick-action"
            >
              <FileText size={20} />
              <span>Browse articles</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
