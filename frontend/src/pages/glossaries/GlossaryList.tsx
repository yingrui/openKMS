import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Trash2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchGlossaries,
  createGlossary,
  deleteGlossary,
  updateGlossary,
  type GlossaryResponse,
} from '../../data/glossariesApi';
import {
  CARD_PREVIEW_LIMIT,
  LIST_PAGE_SIZE_DEFAULT,
  useStoredViewMode,
  type CardListViewMode,
} from '../../hooks/useStoredViewMode';
import { Pagination, ResourceViewToggle } from '../../styles/design-system';
import './GlossaryList.scss';

const VIEW_STORAGE_KEY = 'glossaries-list-view';

export function GlossaryList() {
  const { t } = useTranslation('explore');
  const { t: tc } = useTranslation('common');
  const [viewMode, setViewMode] = useStoredViewMode<CardListViewMode>(VIEW_STORAGE_KEY, 'card');
  const [glossaries, setGlossaries] = useState<GlossaryResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [listPage, setListPage] = useState(0);
  const [listPageSize, setListPageSize] = useState(LIST_PAGE_SIZE_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editGlossary, setEditGlossary] = useState<GlossaryResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const isCardView = viewMode === 'card';
  const fetchLimit = isCardView ? CARD_PREVIEW_LIMIT : listPageSize;
  const fetchOffset = isCardView ? 0 : listPage * listPageSize;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchGlossaries({
        limit: fetchLimit,
        offset: fetchOffset,
      });
      setGlossaries(data.items);
      setTotal(data.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('glossary.toastLoadFailed'));
      setGlossaries([]);
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
      await createGlossary({ name: formName.trim(), description: formDesc.trim() || undefined });
      setShowCreate(false);
      setFormName('');
      setFormDesc('');
      toast.success(t('glossary.toastCreated'));
      setListPage(0);
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('shared.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editGlossary || !formName.trim()) return;
    setSaving(true);
    try {
      await updateGlossary(editGlossary.id, {
        name: formName.trim(),
        description: formDesc.trim() || undefined,
      });
      setEditGlossary(null);
      setFormName('');
      setFormDesc('');
      toast.success(t('glossary.toastUpdated'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('shared.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g: GlossaryResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t('glossary.deleteConfirm', { name: g.name }))) return;
    try {
      await deleteGlossary(g.id);
      toast.success(t('glossary.toastDeleted'));
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('shared.deleteFailed'));
    }
  };

  const openEdit = (g: GlossaryResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditGlossary(g);
    setFormName(g.name);
    setFormDesc(g.description || '');
  };

  const closeDialog = () => {
    setShowCreate(false);
    setEditGlossary(null);
    setFormName('');
    setFormDesc('');
  };

  return (
    <div className="glossary-list">
      <div className="page-header glossary-header">
        <div>
          <h1>{t('glossary.title')}</h1>
          <p className="page-subtitle">{t('glossary.subtitle')}</p>
        </div>
        <div className="glossary-header-actions">
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
            <span>{t('glossary.newGlossary')}</span>
          </button>
        </div>
      </div>

      {loading && <p className="glossary-loading">{t('shared.loading')}</p>}

      {!loading && total === 0 && (
        <div className="glossary-empty">
          <BookOpen size={48} strokeWidth={1} />
          <p>{t('glossary.empty')}</p>
        </div>
      )}

      {!loading && total > 0 && isCardView && total > glossaries.length ? (
        <p className="ds-card-preview-hint">
          {tc('cardPreviewHint', { shown: glossaries.length, total })}
          <button type="button" onClick={() => switchView('list')}>
            {tc('viewAllInList')}
          </button>
        </p>
      ) : null}

      {!loading && total > 0 && isCardView ? (
        <div className="glossary-grid">
          {glossaries.map((g) => (
            <Link key={g.id} to={`/glossaries/${g.id}`} className="glossary-card">
              <div className="glossary-card-top">
                <div className="glossary-icon">
                  <BookOpen size={28} strokeWidth={1.5} />
                </div>
                <div className="glossary-card-actions">
                  <button type="button" title={t('shared.edit')} aria-label={t('shared.edit')} onClick={(e) => openEdit(g, e)}>
                    <Pencil size={15} />
                  </button>
                  <button type="button" title={t('shared.delete')} aria-label={t('shared.delete')} onClick={(e) => void handleDelete(g, e)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <h3>{g.name}</h3>
              <p className="glossary-desc">{g.description || t('shared.noDescription')}</p>
              <div className="glossary-meta">
                <span>{t('glossary.termCount', { count: g.term_count })}</span>
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
                  <th>{t('shared.name')}</th>
                  <th>{t('shared.description')}</th>
                  <th>{t('glossary.listColTerms')}</th>
                  <th aria-hidden />
                </tr>
              </thead>
              <tbody>
                {glossaries.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <Link to={`/glossaries/${g.id}`} className="ds-resource-table__link">
                        {g.name}
                      </Link>
                    </td>
                    <td>{g.description || t('shared.noDescription')}</td>
                    <td>{t('glossary.termCount', { count: g.term_count })}</td>
                    <td>
                      <div className="ds-resource-table__actions">
                        <button type="button" title={t('shared.edit')} aria-label={t('shared.edit')} onClick={(e) => openEdit(g, e)}>
                          <Pencil size={15} />
                        </button>
                        <button type="button" title={t('shared.delete')} aria-label={t('shared.delete')} onClick={(e) => void handleDelete(g, e)}>
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

      {(showCreate || editGlossary) && (
        <div className="glossary-dialog-overlay" onClick={closeDialog}>
          <div className="glossary-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="glossary-dialog-header">
              <h2>{editGlossary ? t('glossary.dialogEdit') : t('glossary.dialogNew')}</h2>
              <button type="button" className="glossary-dialog-close" aria-label={t('shared.close')} onClick={closeDialog}>
                <X size={20} />
              </button>
            </div>
            <div className="glossary-dialog-body">
              <label>
                <span>{t('shared.name')}</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('glossary.placeholderName')}
                  autoFocus
                />
              </label>
              <label>
                <span>{t('shared.description')}</span>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder={t('glossary.placeholderDesc')}
                  rows={3}
                />
              </label>
            </div>
            <div className="glossary-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeDialog}>
                {t('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!formName.trim() || saving}
                onClick={() => void (editGlossary ? handleEdit() : handleCreate())}
              >
                {saving ? t('shared.saving') : editGlossary ? t('shared.save') : t('shared.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
