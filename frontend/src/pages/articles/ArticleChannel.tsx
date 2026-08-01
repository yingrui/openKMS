import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, Search, Folder, Settings, X, FolderInput, Trash2, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  TableRowActionButton,
  TableRowActions,
  Pagination,
} from '../../styles/design-system';
import { useEnsureArticleChannels } from '../../contexts/ArticleChannelsContext';
import { flattenChannels, getDocumentChannelDescription, getDocumentChannelName } from '../../data/channelUtils';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useListFetch } from '../../hooks/useListFetch';
import { createArticle, deleteArticle, fetchArticles, patchArticle } from '../../data/articlesApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import '../../styles/channel-page.scss';
import './Articles.scss';

const ARTICLES_PAGE_SIZE_DEFAULT = 25;

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
  const confirm = useConfirm();
  const { channels, loading, error, refetch: refetchChannels } = useEnsureArticleChannels();

  const channelIds = useMemo(() => new Set(flattenChannels(channels).map((c) => c.id)), [channels]);
  const channelName = getDocumentChannelName(channels, channelId);
  const channelDescription = getDocumentChannelDescription(channels, channelId);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
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
  const listFilters = useMemo(
    () => ({ channelId, channelReady: channelIds.has(channelId), search: debouncedSearch }),
    [channelId, channelIds, debouncedSearch],
  );

  const {
    items,
    total,
    page: listPage,
    setPage: setListPage,
    pageSize: listPageSize,
    setPageSize: setListPageSize,
    loading: listLoading,
    error: listFetchError,
    reload: load,
  } = useListFetch({
    fetcher: async ({ offset, limit, channelId, channelReady, search }) => {
      if (!channelId || !channelReady) return { items: [], total: 0 };
      const res = await fetchArticles({ channel_id: channelId, search: search || undefined, offset, limit });
      return { items: res.items, total: res.total };
    },
    filters: listFilters,
    pageSize: ARTICLES_PAGE_SIZE_DEFAULT,
  });

  useEffect(() => {
    if (listFetchError) toast.error(listFetchError.message || t('channel.loadFailed'));
  }, [listFetchError, t]);

  const selectedCount = selectedArticleIds.size;
  const allVisibleSelected = items.length > 0 && items.every((a) => selectedArticleIds.has(a.id));
  const someVisibleSelected = items.some((a) => selectedArticleIds.has(a.id));
  const bulkActionsDisabled = bulkBusy !== null || moveLoading;

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(total / listPageSize) - 1);
    if (listPage > maxPage) setListPage(maxPage);
  }, [total, listPageSize, listPage, setListPage]);

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
    if (
      !(await confirm({
        title: t('channel.delete'),
        message: msg,
        confirmLabel: t('channel.delete'),
        danger: true,
      }))
    )
      return;

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
      <div className="channel-page">
        <div className="page-header">
          <p className="page-subtitle">{t('channel.loadingChannels')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="channel-page">
        <div className="page-header">
          <p className="page-subtitle page-subtitle--error">{error}</p>
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="channel-page">
        <div className="channel-page-empty-state">
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
      <div className="channel-page">
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
    <div className="channel-page">
      <Link to="/articles" className="channel-browse-back">
        <ArrowLeft size={16} strokeWidth={1.75} />
        <span>{t('channel.backToTree')}</span>
      </Link>
      <div className="page-header channel-page-header">
        <div>
          <div className="channel-page-header-title">
            <h1>{channelName}</h1>
          </div>
          <p className="page-subtitle">
            {channelDescription?.trim()
              ? channelDescription
              : t('channel.defaultDescription')}
          </p>
        </div>
        <div className="channel-page-header-actions">
          <Link to={`/articles/channels/${channelId}/settings`} className="btn btn-secondary">
            <Settings size={18} />
            <span className="ds-compact-label">{t('channel.channelSettings')}</span>
          </Link>
          <button type="button" className="btn btn-primary" onClick={openNewArticleModal}>
            <Plus size={18} />
            <span className="ds-compact-label">{t('channel.newArticle')}</span>
          </button>
        </div>
      </div>

      <div className="channel-page-main">
        <div className="channel-page-toolbar">
          <div className="channel-page-search">
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
          <div className="channel-page-bulk-bar" role="toolbar" aria-label={t('channel.selectedCount', { count: selectedCount })}>
            <span className="channel-page-bulk-count">{t('channel.selectedCount', { count: selectedCount })}</span>
            <div className="channel-page-bulk-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={bulkActionsDisabled || moveChannelOptions.length === 0}
                onClick={() => openMoveModal([...selectedArticleIds])}
              >
                {bulkBusy === 'move' ? (
                  <Loader2 size={16} className="channel-page-spinner" />
                ) : (
                  <FolderInput size={16} />
                )}
                <span>{t('channel.bulkMove')}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm channel-page-bulk-delete"
                disabled={bulkActionsDisabled}
                onClick={() => void deleteArticlesById([...selectedArticleIds])}
              >
                {bulkBusy === 'delete' ? (
                  <Loader2 size={16} className="channel-page-spinner" />
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
        <div className="ds-table-wrap channel-table-wrap">
          {listLoading ? (
            <p className="channel-page-empty-hint">{t('channel.loading')}</p>
          ) : items.length > 0 ? (
            <>
            <table className="channel-table">
              <thead>
                <tr>
                  <th className="channel-table-select-col">
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
                  <th className="channel-table-cell--primary">{t('channel.colTitle')}</th>
                  <th>{t('channel.colSource')}</th>
                  <th>{t('channel.colLifecycle')}</th>
                  <th>{t('channel.colApplicable')}</th>
                  <th>{t('channel.colUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((article) => {
                  /** Always in primary meta-row; desktop/mobile placement is CSS-only. */
                  const rowActions = (
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
                  );
                  return (
                    <tr
                      key={article.id}
                      className={`channel-table-row${selectedArticleIds.has(article.id) ? ' channel-table-row--selected' : ''}`}
                      onClick={() => navigate(`/articles/view/${article.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/articles/view/${article.id}`)}
                    >
                      <td className="channel-table-select-col" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedArticleIds.has(article.id)}
                          onChange={() => toggleArticleSelected(article.id)}
                          aria-label={t('channel.selectArticleAria', { name: article.name })}
                        />
                      </td>
                      <td className="channel-table-cell--primary">
                        <div className="channel-item">
                          <FileText size={18} strokeWidth={1.5} />
                          <div className="channel-item-text">
                            <span className="channel-item-title">{article.name}</span>
                            <div className="channel-item-meta-row">
                              <span className="channel-item-meta">
                                {article.lifecycle_status ?? t('channel.dash')}
                                {' · '}
                                {formatUpdated(article.updated_at)}
                              </span>
                              <div
                                className="channel-item-actions"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {rowActions}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="article-source-cell">
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
                      <td>
                        {article.is_current_for_rag ? t('channel.yes') : t('channel.no')}
                      </td>
                      <td>{formatUpdated(article.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              total={total}
              page={listPage}
              pageSize={listPageSize}
              loading={listLoading}
              onPageChange={(page) => {
                setListPage(page);
                setSelectedArticleIds(new Set());
              }}
              onPageSizeChange={(size) => {
                setListPageSize(size);
                setListPage(0);
                setSelectedArticleIds(new Set());
              }}
            />
            </>
          ) : (
            <div className="channel-page-empty">
              <Folder size={48} />
              <p>{t('channel.emptyTitle')}</p>
              <p className="channel-page-empty-hint">
                {total === 0 && debouncedSearch ? t('channel.emptyHintSearch') : t('channel.emptyHintDefault')}
              </p>
            </div>
          )}
        </div>
      </div>

      {moveModalArticleIds && moveModalArticleIds.length > 0 && (
        <div
          className="channel-page-modal-overlay"
          onClick={closeMoveModal}
          onKeyDown={(e) => e.key === 'Escape' && closeMoveModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="article-move-title"
        >
          <div className="channel-page-modal" onClick={(e) => e.stopPropagation()}>
            <div className="channel-page-modal-header">
              <h2 id="article-move-title">
                {moveModalArticleIds.length === 1 ? t('channel.moveModalTitle') : t('channel.moveModalTitleBulk')}
              </h2>
              <button
                type="button"
                className="channel-page-modal-close"
                onClick={closeMoveModal}
                disabled={moveLoading}
                aria-label={t('channel.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <p className="channel-page-modal-hint">
              {moveModalArticleIds.length === 1
                ? t('channel.moveModalHint', {
                    name: items.find((a) => a.id === moveModalArticleIds[0])?.name ?? '',
                  })
                : t('channel.moveModalHintBulk', { count: moveModalArticleIds.length })}
            </p>
            <div className="channel-page-move-form">
              <label htmlFor="article-move-channel">{t('channel.targetChannel')}</label>
              <select
                id="article-move-channel"
                className="channel-page-move-select"
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
            </div>
            <div className="channel-page-modal-actions">
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
          className="channel-page-modal-overlay"
          onClick={closeNewArticleModal}
          onKeyDown={(e) => e.key === 'Escape' && closeNewArticleModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="article-new-title"
        >
          <div className="channel-page-modal" onClick={(e) => e.stopPropagation()}>
            <div className="channel-page-modal-header">
              <h2 id="article-new-title">{t('channel.modalTitle')}</h2>
              <button
                type="button"
                className="channel-page-modal-close"
                onClick={closeNewArticleModal}
                disabled={newCreating}
                aria-label={t('channel.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <p className="channel-page-modal-hint">{t('channel.modalHint')}</p>
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
            <div className="channel-page-modal-actions">
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
