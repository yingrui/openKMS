import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, Search, Folder, Settings, X } from 'lucide-react';
import { toast } from 'sonner';
import { useArticleChannels } from '../../contexts/ArticleChannelsContext';
import { flattenChannels, getDocumentChannelDescription, getDocumentChannelName } from '../../data/channelUtils';
import { createArticle, fetchArticles, type ArticleOut } from '../../data/articlesApi';
import '../documents/DocumentChannel.scss';
import './Articles.scss';

function formatUpdated(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ArticleChannel() {
  const { t } = useTranslation('articles');
  const navigate = useNavigate();
  const { channelId = '' } = useParams<{ channelId: string }>();
  const { channels, loading, error } = useArticleChannels();

  const channelIds = useMemo(() => new Set(flattenChannels(channels).map((c) => c.id)), [channels]);
  const channelName = getDocumentChannelName(channels, channelId);
  const channelDescription = getDocumentChannelDescription(channels, channelId);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [items, setItems] = useState<ArticleOut[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [newArticleOpen, setNewArticleOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSourceRef, setNewSourceRef] = useState('');
  const [newMarkdown, setNewMarkdown] = useState('');
  const [newCreating, setNewCreating] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!channelId || !channelIds.has(channelId)) {
      setItems([]);
      setTotal(0);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    try {
      const res = await fetchArticles({
        channel_id: channelId,
        search: debouncedSearch || undefined,
        limit: 200,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('channel.loadFailed'));
      setItems([]);
      setTotal(0);
    } finally {
      setListLoading(false);
    }
  }, [channelId, debouncedSearch, channelIds, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNewArticleModal = () => {
    setNewTitle('');
    setNewSourceRef('');
    setNewMarkdown('');
    setNewArticleOpen(true);
  };

  const closeNewArticleModal = () => {
    if (!newCreating) setNewArticleOpen(false);
  };

  const submitNewArticle = async () => {
    if (!channelId || !channelIds.has(channelId)) return;
    const name = newTitle.trim();
    if (!name) {
      toast.error(t('channel.titleRequired'));
      return;
    }
    setNewCreating(true);
    try {
      const row = await createArticle({
        channel_id: channelId,
        name,
        markdown: newMarkdown.trim() || null,
        origin_article_id: newSourceRef.trim() || null,
      });
      toast.success(t('channel.created'));
      setNewArticleOpen(false);
      navigate(`/articles/view/${row.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('channel.createFailed'));
    } finally {
      setNewCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="documents">
        <div className="page-header">
          <p className="page-subtitle">{t('channel.loadingChannels')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="documents">
        <div className="page-header">
          <p className="page-subtitle page-subtitle--error">{error}</p>
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="documents">
        <div className="documents-empty-state">
          <Folder size={64} />
          <h2>{t('channel.noChannelsTitle')}</h2>
          <p>{t('channel.noChannelsHint')}</p>
          <Link to="/articles/channels" className="btn btn-primary">
            <Folder size={18} />
            <span>{t('channel.createChannel')}</span>
          </Link>
        </div>
      </div>
    );
  }

  if (!channelId || !channelIds.has(channelId)) {
    return (
      <div className="documents">
        <div className="page-header">
          <h1>{t('channel.notFoundTitle')}</h1>
          <p className="page-subtitle">{t('channel.notFoundSubtitle')}</p>
          <Link to="/articles" className="btn btn-secondary openkms-link-spaced">
            {t('channel.backToArticles')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="documents">
      <div className="page-header documents-header">
        <div>
          <div className="documents-header-title">
            <h1>{channelName}</h1>
          </div>
          <p className="page-subtitle">
            {channelDescription?.trim()
              ? channelDescription
              : t('channel.defaultDescription')}
          </p>
        </div>
        <div className="documents-header-actions">
          <Link to={`/articles/channels/${channelId}/settings`} className="btn btn-secondary">
            <Settings size={18} />
            <span>{t('channel.channelSettings')}</span>
          </Link>
          <button type="button" className="btn btn-primary" onClick={openNewArticleModal}>
            <Plus size={18} />
            <span>{t('channel.newArticle')}</span>
          </button>
        </div>
      </div>

      <div className="documents-main">
        <div className="articles-toolbar">
          <div className="articles-search">
            <Search size={18} />
            <input
              type="search"
              aria-label={t('channel.searchAria')}
              placeholder={t('channel.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="articles-table-wrap">
          {listLoading ? (
            <p className="articles-empty-hint">{t('channel.loading')}</p>
          ) : items.length > 0 ? (
            <table className="articles-table">
              <thead>
                <tr>
                  <th>{t('channel.colTitle')}</th>
                  <th>{t('channel.colSource')}</th>
                  <th>{t('channel.colLifecycle')}</th>
                  <th>{t('channel.colApplicable')}</th>
                  <th>{t('channel.colUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((article) => (
                  <tr
                    key={article.id}
                    className="articles-table-row-clickable"
                    onClick={() => navigate(`/articles/view/${article.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/articles/view/${article.id}`)}
                  >
                    <td>
                      <div className="articles-table-title">
                        <FileText size={18} strokeWidth={1.5} />
                        <span>{article.name}</span>
                      </div>
                    </td>
                    <td className="articles-table-source">
                      {article.origin_article_id?.trim() ? (
                        /^https?:\/\//i.test(article.origin_article_id.trim()) ? (
                          <a
                            href={article.origin_article_id.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {article.origin_article_id.trim().length > 40
                              ? `${article.origin_article_id.trim().slice(0, 38)}…`
                              : article.origin_article_id.trim()}
                          </a>
                        ) : (
                          <span title={article.origin_article_id}>
                            {article.origin_article_id.length > 40
                              ? `${article.origin_article_id.slice(0, 38)}…`
                              : article.origin_article_id}
                          </span>
                        )
                      ) : (
                        t('channel.dash')
                      )}
                    </td>
                    <td>
                      <span
                        className={`article-status article-status-${(article.lifecycle_status ?? 'unset').toLowerCase()}`}
                      >
                        {article.lifecycle_status ?? t('channel.dash')}
                      </span>
                    </td>
                    <td>{article.is_current_for_rag ? t('channel.yes') : t('channel.no')}</td>
                    <td>{formatUpdated(article.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="articles-empty">
              <Folder size={48} />
              <p>{t('channel.emptyTitle')}</p>
              <p className="articles-empty-hint">
                {total === 0 && debouncedSearch ? t('channel.emptyHintSearch') : t('channel.emptyHintDefault')}
              </p>
            </div>
          )}
        </div>
      </div>

      {newArticleOpen && (
        <div
          className="documents-upload-modal-overlay"
          onClick={closeNewArticleModal}
          onKeyDown={(e) => e.key === 'Escape' && closeNewArticleModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="article-new-title"
        >
          <div className="documents-upload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="documents-upload-modal-header">
              <h2 id="article-new-title">{t('channel.modalTitle')}</h2>
              <button
                type="button"
                className="documents-upload-modal-close"
                onClick={closeNewArticleModal}
                disabled={newCreating}
                aria-label={t('channel.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <p className="documents-upload-modal-hint">{t('channel.modalHint')}</p>
            <div className="articles-new-modal-fields">
              <div className="articles-new-modal-field">
                <label htmlFor="article-new-name">{t('channel.titleLabel')}</label>
                <input
                  id="article-new-name"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={t('channel.titlePlaceholder')}
                  autoFocus
                  disabled={newCreating}
                />
              </div>
              <div className="articles-new-modal-field">
                <label htmlFor="article-new-source">{t('channel.sourceLabel')}</label>
                <input
                  id="article-new-source"
                  type="text"
                  value={newSourceRef}
                  onChange={(e) => setNewSourceRef(e.target.value)}
                  placeholder={t('channel.sourcePlaceholder')}
                  disabled={newCreating}
                />
              </div>
              <div className="articles-new-modal-field">
                <label htmlFor="article-new-md">{t('channel.initialContentLabel')}</label>
                <textarea
                  id="article-new-md"
                  value={newMarkdown}
                  onChange={(e) => setNewMarkdown(e.target.value)}
                  placeholder={t('channel.markdownPlaceholder')}
                  rows={6}
                  disabled={newCreating}
                />
              </div>
            </div>
            <div className="documents-upload-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeNewArticleModal} disabled={newCreating}>
                {t('channel.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void submitNewArticle()}
                disabled={newCreating || !newTitle.trim()}
              >
                {newCreating ? t('channel.creating') : t('channel.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
