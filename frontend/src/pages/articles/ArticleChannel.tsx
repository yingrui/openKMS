import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, Search, Folder, Settings, X, FolderInput, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
  tableRowActionCellClass,
} from '../../styles/design-system';
import { useArticleChannels } from '../../contexts/ArticleChannelsContext';
import { flattenChannels, getDocumentChannelDescription, getDocumentChannelName } from '../../data/channelUtils';
import {
  createArticle,
  deleteArticle,
  fetchArticles,
  patchArticle,
  type ArticleOut,
} from '../../data/articlesApi';
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
  const { channels, loading, error, refetch: refetchChannels } = useArticleChannels();

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
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(() => new Set());
  const [moveModalArticleIds, setMoveModalArticleIds] = useState<string[] | null>(null);
  const [moveTargetChannelId, setMoveTargetChannelId] = useState('');
  const [moveLoading, setMoveLoading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<'delete' | 'move' | null>(null);

  const flatChannels = useMemo(() => flattenChannels(channels), [channels]);
  const moveChannelOptions = useMemo(
    () => flatChannels.filter((c) => c.id !== channelId),
    [flatChannels, channelId],
  );
  const selectedCount = selectedArticleIds.size;
  const allVisibleSelected = items.length > 0 && items.every((a) => selectedArticleIds.has(a.id));
  const someVisibleSelected = items.some((a) => selectedArticleIds.has(a.id));
  const bulkActionsDisabled = bulkBusy !== null || moveLoading;

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

  useEffect(() => {
    setSelectedArticleIds(new Set());
  }, [channelId, debouncedSearch]);

  const toggleArticleSelected = (articleId: string) => {
    setSelectedArticleIds((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedArticleIds((prev) => {
        const next = new Set(prev);
        for (const a of items) next.delete(a.id);
        return next;
      });
    } else {
      setSelectedArticleIds((prev) => {
        const next = new Set(prev);
        for (const a of items) next.add(a.id);
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedArticleIds(new Set());

  const openMoveModal = (articleIds: string[]) => {
    if (articleIds.length === 0) return;
    setMoveModalArticleIds(articleIds);
    setMoveTargetChannelId(moveChannelOptions[0]?.id ?? '');
  };

  const closeMoveModal = () => {
    if (!moveLoading) {
      setMoveModalArticleIds(null);
      setMoveTargetChannelId('');
    }
  };

  const confirmMove = async () => {
    const ids = moveModalArticleIds;
    if (!ids?.length || !moveTargetChannelId) return;
    setMoveLoading(true);
    setBulkBusy('move');
    let ok = 0;
    try {
      for (const id of ids) {
        try {
          await patchArticle(id, { channel_id: moveTargetChannelId });
          ok += 1;
        } catch {
          /* continue */
        }
      }
      if (ok === ids.length) {
        toast.success(
          ids.length === 1
            ? t('channel.movedToast', { name: items.find((a) => a.id === ids[0])?.name ?? '' })
            : t('channel.movedBulkToast', { count: ok }),
        );
      } else if (ok > 0) {
        toast.warning(t('channel.moveBulkPartial', { ok, total: ids.length }));
      } else {
        toast.error(t('channel.moveFailed'));
      }
      setMoveModalArticleIds(null);
      setMoveTargetChannelId('');
      setSelectedArticleIds(new Set());
      await load();
      await refetchChannels();
    } finally {
      setMoveLoading(false);
      setBulkBusy(null);
    }
  };

  const deleteArticlesById = async (ids: string[]) => {
    if (ids.length === 0) return;
    const label =
      ids.length === 1
        ? items.find((a) => a.id === ids[0])?.name ?? ''
        : String(ids.length);
    const msg =
      ids.length === 1
        ? t('channel.deleteConfirm', { name: label })
        : t('channel.deleteBulkConfirm', { count: ids.length });
    if (!window.confirm(msg)) return;

    setBulkBusy('delete');
    let ok = 0;
    try {
      for (const id of ids) {
        try {
          await deleteArticle(id);
          ok += 1;
        } catch {
          /* continue */
        }
      }
      if (ok === ids.length) {
        toast.success(
          ids.length === 1
            ? t('channel.deletedToast', { name: label })
            : t('channel.deletedBulkToast', { count: ok }),
        );
      } else if (ok > 0) {
        toast.warning(t('channel.deleteBulkPartial', { ok, total: ids.length }));
      } else {
        toast.error(t('channel.deleteFailed'));
      }
      setSelectedArticleIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      await load();
      await refetchChannels();
    } finally {
      setBulkBusy(null);
    }
  };

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
        {selectedCount > 0 && (
          <div className="documents-bulk-bar" role="toolbar" aria-label={t('channel.selectedCount', { count: selectedCount })}>
            <span className="documents-bulk-count">{t('channel.selectedCount', { count: selectedCount })}</span>
            <div className="documents-bulk-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={bulkActionsDisabled || moveChannelOptions.length === 0}
                onClick={() => openMoveModal([...selectedArticleIds])}
              >
                {bulkBusy === 'move' ? (
                  <Loader2 size={16} className="documents-loading-spinner" />
                ) : (
                  <FolderInput size={16} />
                )}
                <span>{t('channel.bulkMove')}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm documents-bulk-delete"
                disabled={bulkActionsDisabled}
                onClick={() => void deleteArticlesById([...selectedArticleIds])}
              >
                {bulkBusy === 'delete' ? (
                  <Loader2 size={16} className="documents-loading-spinner" />
                ) : (
                  <Trash2 size={16} />
                )}
                <span>{t('channel.bulkDelete')}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={clearSelection}
                disabled={bulkActionsDisabled}
              >
                <X size={16} />
                <span>{t('channel.clearSelection')}</span>
              </button>
            </div>
          </div>
        )}
        <div className="articles-table-wrap">
          {listLoading ? (
            <p className="articles-empty-hint">{t('channel.loading')}</p>
          ) : items.length > 0 ? (
            <table className="articles-table">
              <thead>
                <tr>
                  <th className="documents-table-select-col">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                      }}
                      onChange={toggleSelectAllVisible}
                      aria-label={t('channel.selectAllAria')}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <th>{t('channel.colTitle')}</th>
                  <th>{t('channel.colSource')}</th>
                  <th>{t('channel.colLifecycle')}</th>
                  <th>{t('channel.colApplicable')}</th>
                  <th>{t('channel.colUpdated')}</th>
                  <th className={tableRowActionCellClass}>{t('channel.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((article) => (
                  <tr
                    key={article.id}
                    className={`articles-table-row-clickable${selectedArticleIds.has(article.id) ? ' documents-table-row-selected' : ''}`}
                    onClick={() => navigate(`/articles/view/${article.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/articles/view/${article.id}`)}
                  >
                    <td className="documents-table-select-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedArticleIds.has(article.id)}
                        onChange={() => toggleArticleSelected(article.id)}
                        aria-label={t('channel.selectArticleAria', { name: article.name })}
                      />
                    </td>
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
                    <TableRowActionCell>
                      <TableRowActions>
                        <TableRowActionButton
                          title={t('channel.move')}
                          aria-label={t('channel.ariaMoveArticle', { name: article.name })}
                          disabled={bulkBusy !== null || moveChannelOptions.length === 0}
                          onClick={() => openMoveModal([article.id])}
                          icon={<FolderInput size={16} />}
                        />
                        <TableRowActionButton
                          title={t('channel.delete')}
                          aria-label={t('channel.ariaDeleteArticle', { name: article.name })}
                          variant="danger"
                          disabled={bulkBusy !== null}
                          onClick={() => void deleteArticlesById([article.id])}
                          icon={<Trash2 size={16} />}
                        />
                      </TableRowActions>
                    </TableRowActionCell>
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

      {moveModalArticleIds && moveModalArticleIds.length > 0 && (
        <div
          className="documents-upload-modal-overlay"
          onClick={closeMoveModal}
          onKeyDown={(e) => e.key === 'Escape' && closeMoveModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="article-move-title"
        >
          <div className="documents-upload-modal documents-move-modal" onClick={(e) => e.stopPropagation()}>
            <div className="documents-upload-modal-header">
              <h2 id="article-move-title">
                {moveModalArticleIds.length === 1 ? t('channel.moveModalTitle') : t('channel.moveModalTitleBulk')}
              </h2>
              <button
                type="button"
                className="documents-upload-modal-close"
                onClick={closeMoveModal}
                disabled={moveLoading}
                aria-label={t('channel.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <p className="documents-upload-modal-hint">
              {moveModalArticleIds.length === 1
                ? t('channel.moveModalHint', {
                    name: items.find((a) => a.id === moveModalArticleIds[0])?.name ?? '',
                  })
                : t('channel.moveModalHintBulk', { count: moveModalArticleIds.length })}
            </p>
            <label className="documents-move-modal-label" htmlFor="article-move-channel">
              {t('channel.targetChannel')}
            </label>
            <select
              id="article-move-channel"
              className="documents-move-modal-select"
              value={moveTargetChannelId}
              onChange={(e) => setMoveTargetChannelId(e.target.value)}
              disabled={moveLoading || moveChannelOptions.length === 0}
            >
              {moveChannelOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="documents-upload-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeMoveModal} disabled={moveLoading}>
                {t('channel.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void confirmMove()}
                disabled={moveLoading || !moveTargetChannelId}
              >
                {moveLoading ? t('channel.moving') : t('channel.move')}
              </button>
            </div>
          </div>
        </div>
      )}

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
