import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Database, Plus, MessageCircle, Trash2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase,
  updateKnowledgeBase,
  type KnowledgeBaseResponse,
} from '../../data/knowledgeBasesApi';
import {
  CARD_PREVIEW_LIMIT,
  LIST_PAGE_SIZE_DEFAULT,
  useStoredViewMode,
  type CardListViewMode,
} from '../../hooks/useStoredViewMode';
import { Pagination, ResourceViewToggle } from '../../styles/design-system';
import './KnowledgeBaseList.scss';

const VIEW_STORAGE_KEY = 'knowledge-bases-list-view';

export function KnowledgeBaseList() {
  const { t } = useTranslation('knowledgeBase');
  const { t: ts } = useTranslation('explore');
  const { t: tc } = useTranslation('common');
  const [viewMode, setViewMode] = useStoredViewMode<CardListViewMode>(VIEW_STORAGE_KEY, 'card');
  const [kbs, setKbs] = useState<KnowledgeBaseResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [listPage, setListPage] = useState(0);
  const [listPageSize, setListPageSize] = useState(LIST_PAGE_SIZE_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editKb, setEditKb] = useState<KnowledgeBaseResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const isCardView = viewMode === 'card';
  const fetchLimit = isCardView ? CARD_PREVIEW_LIMIT : listPageSize;
  const fetchOffset = isCardView ? 0 : listPage * listPageSize;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchKnowledgeBases({
        limit: fetchLimit,
        offset: fetchOffset,
      });
      setKbs(data.items);
      setTotal(data.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('toastLoadFailed'));
      setKbs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [fetchLimit, fetchOffset, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isCardView) return;
    const maxPage = Math.max(0, Math.ceil(total / listPageSize) - 1);
    if (listPage > maxPage) setListPage(maxPage);
  }, [total, listPageSize, listPage, isCardView]);

  const switchView = (mode: CardListViewMode) => {
    setViewMode(mode);
    setListPage(0);
  };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      await createKnowledgeBase({ name: formName.trim(), description: formDesc.trim() || undefined });
      setShowCreate(false);
      setFormName('');
      setFormDesc('');
      toast.success(t('toastCreated'));
      setListPage(0);
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : ts('shared.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editKb || !formName.trim()) return;
    setSaving(true);
    try {
      await updateKnowledgeBase(editKb.id, { name: formName.trim(), description: formDesc.trim() || undefined });
      setEditKb(null);
      setFormName('');
      setFormDesc('');
      toast.success(t('toastUpdated'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : ts('shared.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (kb: KnowledgeBaseResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t('deleteConfirm', { name: kb.name }))) return;
    try {
      await deleteKnowledgeBase(kb.id);
      toast.success(t('toastDeleted'));
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : ts('shared.deleteFailed'));
    }
  };

  const openEdit = (kb: KnowledgeBaseResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditKb(kb);
    setFormName(kb.name);
    setFormDesc(kb.description || '');
  };

  const closeDialog = () => {
    setShowCreate(false);
    setEditKb(null);
    setFormName('');
    setFormDesc('');
  };

  return (
    <div className="kb-list">
      <div className="page-header kb-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="page-subtitle">{t('subtitle')}</p>
        </div>
        <div className="kb-header-actions">
          {!loading ? (
            <ResourceViewToggle modes={['card', 'list']} value={viewMode} onChange={switchView} />
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setShowCreate(true);
              setFormName('');
              setFormDesc('');
            }}
          >
            <Plus size={18} />
            <span>{t('newKb')}</span>
          </button>
        </div>
      </div>

      {loading && <p className="kb-loading">{ts('shared.loading')}</p>}

      {!loading && total === 0 && (
        <div className="kb-empty">
          <Database size={48} strokeWidth={1} />
          <p>{t('empty')}</p>
        </div>
      )}

      {!loading && total > 0 && isCardView && total > kbs.length ? (
        <p className="ds-card-preview-hint">
          {tc('cardPreviewHint', { shown: kbs.length, total })}
          <button type="button" onClick={() => switchView('list')}>
            {tc('viewAllInList')}
          </button>
        </p>
      ) : null}

      {!loading && total > 0 && isCardView ? (
        <div className="kb-grid">
          {kbs.map((kb) => (
            <Link key={kb.id} to={`/knowledge-bases/${kb.id}`} className="kb-card">
              <div className="kb-card-top">
                <div className="kb-icon">
                  <Database size={28} strokeWidth={1.5} />
                </div>
                <div className="kb-card-actions">
                  <button type="button" title={ts('shared.edit')} aria-label={ts('shared.edit')} onClick={(e) => openEdit(kb, e)}>
                    <Pencil size={15} />
                  </button>
                  <button type="button" title={ts('shared.delete')} aria-label={ts('shared.delete')} onClick={(e) => void handleDelete(kb, e)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <h3>{kb.name}</h3>
              <p className="kb-desc">{kb.description || ts('shared.noDescription')}</p>
              <div className="kb-meta">
                <span>{t('metaDocs', { count: kb.document_count })}</span>
                <span>{t('metaWikiSpaces', { count: kb.wiki_space_count ?? 0 })}</span>
                <span>{t('metaFaqs', { count: kb.faq_count })}</span>
                <span>{t('metaChunks', { count: kb.chunk_count })}</span>
                {kb.agent_url ? (
                  <span className="kb-rag-badge">
                    <MessageCircle size={14} />
                    {t('ragBadge')}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {!loading && total > 0 && !isCardView ? (
        <>
          <div className="ds-resource-table-wrap">
            <table className="ds-resource-table">
              <thead>
                <tr>
                  <th>{ts('shared.name')}</th>
                  <th>{ts('shared.description')}</th>
                  <th>{t('listColStats')}</th>
                  <th aria-hidden />
                </tr>
              </thead>
              <tbody>
                {kbs.map((kb) => (
                  <tr key={kb.id}>
                    <td>
                      <Link to={`/knowledge-bases/${kb.id}`} className="ds-resource-table__link">
                        {kb.name}
                      </Link>
                      {kb.agent_url ? (
                        <span className="kb-list-rag-pill">{t('ragBadge')}</span>
                      ) : null}
                    </td>
                    <td>{kb.description || ts('shared.noDescription')}</td>
                    <td className="kb-list-stats">
                      {t('metaDocs', { count: kb.document_count })}
                      {' · '}
                      {t('metaWikiSpaces', { count: kb.wiki_space_count ?? 0 })}
                      {' · '}
                      {t('metaFaqs', { count: kb.faq_count })}
                      {' · '}
                      {t('metaChunks', { count: kb.chunk_count })}
                    </td>
                    <td>
                      <div className="ds-resource-table__actions">
                        <button type="button" title={ts('shared.edit')} aria-label={ts('shared.edit')} onClick={(e) => openEdit(kb, e)}>
                          <Pencil size={15} />
                        </button>
                        <button type="button" title={ts('shared.delete')} aria-label={ts('shared.delete')} onClick={(e) => void handleDelete(kb, e)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            total={total}
            page={listPage}
            pageSize={listPageSize}
            loading={loading}
            onPageChange={setListPage}
            onPageSizeChange={(size) => {
              setListPageSize(size);
              setListPage(0);
            }}
          />
        </>
      ) : null}

      {(showCreate || editKb) && (
        <div className="kb-dialog-overlay" onClick={closeDialog}>
          <div className="kb-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="kb-dialog-header">
              <h2>{editKb ? t('dialogEdit') : t('dialogNew')}</h2>
              <button type="button" className="kb-dialog-close" aria-label={ts('shared.close')} onClick={closeDialog}>
                <X size={20} />
              </button>
            </div>
            <div className="kb-dialog-body">
              <label>
                <span>{ts('shared.name')}</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('placeholderName')}
                  autoFocus
                />
              </label>
              <label>
                <span>{ts('shared.description')}</span>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder={t('placeholderDesc')}
                  rows={3}
                />
              </label>
            </div>
            <div className="kb-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeDialog}>
                {ts('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!formName.trim() || saving}
                onClick={() => void (editKb ? handleEdit() : handleCreate())}
              >
                {saving ? ts('shared.saving') : editKb ? ts('shared.save') : ts('shared.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
