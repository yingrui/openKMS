import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchEvaluations,
  createEvaluation,
  deleteEvaluation,
  updateEvaluation,
  type EvaluationResponse,
} from '../../data/evaluationsApi';
import { fetchAllKnowledgeBases, type KnowledgeBaseResponse } from '../../data/knowledgeBasesApi';
import {
  fetchOntologyFunctions,
  type OntologyFunctionResponse,
} from '../../data/ontologyFunctionsApi';
import { fetchAllWikiSpaces, type WikiSpaceResponse } from '../../data/wikiSpacesApi';
import {
  CARD_PREVIEW_LIMIT,
  LIST_PAGE_SIZE_DEFAULT,
  useStoredViewMode,
  type CardListViewMode,
} from '../../hooks/useStoredViewMode';
import { Dialog, FormField, Pagination, ResourceViewToggle } from '../../styles/design-system';
import './EvaluationDatasetList.scss';

const VIEW_STORAGE_KEY = 'evaluations-list-view';

export function EvaluationDatasetList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  /** Arriving from a function: open its evaluation, or offer to create one for it. */
  const requestedFunctionId = searchParams.get('function') ?? '';
  const { t } = useTranslation('workspace');
  const { t: tc } = useTranslation('common');
  const [viewMode, setViewMode] = useStoredViewMode<CardListViewMode>(VIEW_STORAGE_KEY, 'card');
  const [datasets, setDatasets] = useState<EvaluationResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [listPage, setListPage] = useState(0);
  const [listPageSize, setListPageSize] = useState(LIST_PAGE_SIZE_DEFAULT);
  const [kbs, setKbs] = useState<KnowledgeBaseResponse[]>([]);
  const [functions, setFunctions] = useState<OntologyFunctionResponse[]>([]);
  const [wikiSpaces, setWikiSpaces] = useState<WikiSpaceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editDs, setEditDs] = useState<EvaluationResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formKbId, setFormKbId] = useState('');
  /** Which thing this evaluation measures: a knowledge base, or a function. */
  const [formTarget, setFormTarget] = useState<'kb' | 'function'>('kb');
  const [formFunctionId, setFormFunctionId] = useState('');
  const [formWikiSpaceId, setFormWikiSpaceId] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const isCardView = viewMode === 'card';
  const fetchLimit = isCardView ? CARD_PREVIEW_LIMIT : listPageSize;
  const fetchOffset = isCardView ? 0 : listPage * listPageSize;

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    try {
      const dsData = await fetchEvaluations({
        limit: fetchLimit,
        offset: fetchOffset,
      });
      setDatasets(dsData.items);
      setTotal(dsData.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluation.loadFailed'));
      setDatasets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [fetchLimit, fetchOffset, t]);

  // Arriving with ?function=<id> from the editor: go to the evaluation that already measures it, or offer to
  // create one with the target prefilled. Then drop the parameter, so a refresh does not reopen the dialog.
  useEffect(() => {
    if (!requestedFunctionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchEvaluations({ function_id: requestedFunctionId, limit: 1, offset: 0 });
        if (cancelled) return;
        const existing = res.items[0];
        if (existing) {
          navigate(`/evaluations/${existing.id}`, { replace: true });
          return;
        }
      } catch {
        /* fall through to the create dialog */
      }
      if (cancelled) return;
      setFormTarget('function');
      setFormFunctionId(requestedFunctionId);
      setShowCreate(true);
      setSearchParams({}, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedFunctionId, navigate, setSearchParams]);

  const loadDropdowns = useCallback(async () => {
    try {
      const [kbItems, wikiData, fns] = await Promise.all([
        fetchAllKnowledgeBases(),
        fetchAllWikiSpaces().catch(() => []),
        fetchOntologyFunctions().catch(() => ({ items: [] })),
      ]);
      setKbs(kbItems);
      setWikiSpaces(Array.isArray(wikiData) ? wikiData : []);
      // Only published functions can be evaluated: a run measures the published version.
      setFunctions((fns?.items ?? []).filter((fn) => fn.published_version_id));
    } catch {
      // Dropdown options are optional; list load shows its own error.
    }
  }, []);

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    void loadDropdowns();
  }, [loadDropdowns]);

  useEffect(() => {
    if (isCardView) return;
    const maxPage = Math.max(0, Math.ceil(total / listPageSize) - 1);
    if (listPage > maxPage) setListPage(maxPage);
  }, [total, listPageSize, listPage, isCardView]);

  const switchView = (mode: CardListViewMode) => {
    setViewMode(mode);
    setListPage(0);
  };

  const reload = () => {
    void loadDatasets();
    void loadDropdowns();
  };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    if (formTarget === 'kb' && !formKbId) return;
    if (formTarget === 'function' && !formFunctionId) return;
    setSaving(true);
    try {
      await createEvaluation({
        name: formName.trim(),
        kind: formTarget === 'function' ? 'function' : 'answer',
        ...(formTarget === 'function'
          ? { function_id: formFunctionId }
          : {
              knowledge_base_id: formKbId,
              wiki_space_id: formWikiSpaceId.trim() || null,
            }),
        description: formDesc.trim() || undefined,
      });
      setShowCreate(false);
      setFormName('');
      setFormKbId('');
      setFormFunctionId('');
      setFormWikiSpaceId('');
      setFormDesc('');
      toast.success(t('evaluation.createdToast'));
      setListPage(0);
      reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluation.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editDs || !formName.trim()) return;
    setSaving(true);
    try {
      await updateEvaluation(editDs.id, {
        name: formName.trim(),
        description: formDesc.trim() || undefined,
      });
      setEditDs(null);
      setFormName('');
      setFormDesc('');
      toast.success(t('evaluation.updatedToast'));
      reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluation.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ds: EvaluationResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t('evaluation.deleteConfirm', { name: ds.name }))) return;
    try {
      await deleteEvaluation(ds.id);
      toast.success(t('evaluation.deletedToast'));
      reload();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('shared.deleteFailed'));
    }
  };

  const openEdit = (ds: EvaluationResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditDs(ds);
    setFormName(ds.name);
    setFormDesc(ds.description || '');
  };

  const closeDialog = () => {
    setShowCreate(false);
    setEditDs(null);
    setFormName('');
    setFormKbId('');
    setFormWikiSpaceId('');
    setFormDesc('');
  };

  return (
    <div className="eval-list">
      <div className="page-header eval-header">
        <div>
          <h1>{t('evaluation.title')}</h1>
          <p className="page-subtitle">{t('evaluation.subtitle')}</p>
        </div>
        <div className="eval-header-actions">
          {!loading ? (
            <ResourceViewToggle modes={['card', 'list']} value={viewMode} onChange={switchView} />
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setShowCreate(true);
              setFormName('');
              setFormKbId(kbs[0]?.id ?? '');
              setFormWikiSpaceId('');
              setFormDesc('');
            }}
          >
            <Plus size={18} />
            <span>{t('evaluation.newEvaluation')}</span>
          </button>
        </div>
      </div>

      {loading && <p className="eval-loading">{t('evaluation.loading')}</p>}

      {!loading && total === 0 && (
        <div className="eval-empty">
          <ClipboardList size={48} strokeWidth={1} />
          <p>{t('evaluation.empty')}</p>
        </div>
      )}

      {!loading && total > 0 && isCardView && total > datasets.length ? (
        <p className="ds-card-preview-hint">
          {tc('cardPreviewHint', { shown: datasets.length, total })}
          <button type="button" onClick={() => switchView('list')}>
            {tc('viewAllInList')}
          </button>
        </p>
      ) : null}

      {!loading && total > 0 && isCardView ? (
      <div className="eval-grid">
        {datasets.map((ds) => (
          <Link key={ds.id} to={`/evaluations/${ds.id}`} className="eval-card">
            <div className="eval-card-top">
              <div className="eval-icon">
                <ClipboardList size={28} strokeWidth={1.5} />
              </div>
              <div className="eval-card-actions">
                <button type="button" title={t('shared.edit')} aria-label={t('shared.edit')} onClick={(e) => openEdit(ds, e)}>
                  <Pencil size={15} />
                </button>
                <button type="button" title={t('shared.delete')} aria-label={t('shared.delete')} onClick={(e) => void handleDelete(ds, e)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <h3>{ds.name}</h3>
            <p className="eval-desc">{ds.description || t('evaluation.noDescription')}</p>
            <div className="eval-meta">
              <span>{ds.knowledge_base_name || ds.knowledge_base_id}</span>
              {ds.wiki_space_name ? <span>{ds.wiki_space_name}</span> : null}
              <span>{t('evaluation.itemsCount', { count: ds.item_count })}</span>
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
                  <th>{t('evaluation.listColKb')}</th>
                  <th>{t('evaluation.listColItems')}</th>
                  <th aria-hidden />
                </tr>
              </thead>
              <tbody>
                {datasets.map((ds) => (
                  <tr key={ds.id}>
                    <td>
                      <Link to={`/evaluations/${ds.id}`} className="ds-resource-table__link">
                        {ds.name}
                      </Link>
                    </td>
                    <td>{ds.description || t('evaluation.noDescription')}</td>
                    <td>{ds.knowledge_base_name || ds.knowledge_base_id}</td>
                    <td>{t('evaluation.itemsCount', { count: ds.item_count })}</td>
                    <td>
                      <div className="ds-resource-table__actions">
                        <button type="button" title={t('shared.edit')} aria-label={t('shared.edit')} onClick={(e) => openEdit(ds, e)}>
                          <Pencil size={15} />
                        </button>
                        <button type="button" title={t('shared.delete')} aria-label={t('shared.delete')} onClick={(e) => void handleDelete(ds, e)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          </div>
        </>
      ) : null}

      <Dialog
        open={showCreate || editDs != null}
        onClose={closeDialog}
        title={editDs ? t('evaluation.dialogEdit') : t('evaluation.dialogNew')}
        closeAriaLabel={t('shared.close')}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeDialog}>
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                !formName.trim() ||
                (showCreate && formTarget === 'kb' && !formKbId) ||
                (showCreate && formTarget === 'function' && !formFunctionId) ||
                saving
              }
              onClick={() => void (editDs ? handleEdit() : handleCreate())}
            >
              {saving ? t('evaluation.saving') : editDs ? t('shared.save') : t('shared.create')}
            </button>
          </>
        }
      >
        <FormField label={t('shared.name')}>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder={t('evaluation.namePlaceholder')}
          />
        </FormField>
        {showCreate ? (
          <FormField label={t('evaluation.target')}>
            <select
              value={formTarget}
              onChange={(e) => setFormTarget(e.target.value as 'kb' | 'function')}
            >
              <option value="kb">{t('evaluation.targetKb')}</option>
              <option value="function">{t('evaluation.targetFunction')}</option>
            </select>
          </FormField>
        ) : null}
        {showCreate && formTarget === 'kb' ? (
          <FormField label={t('evaluation.knowledgeBase')}>
            <select value={formKbId} onChange={(e) => setFormKbId(e.target.value)} required>
              <option value="">{t('evaluation.selectKb')}</option>
              {kbs.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
        {showCreate && formTarget === 'function' ? (
          <FormField label={t('evaluation.function')} hint={t('evaluation.functionHint')}>
            <select
              value={formFunctionId}
              onChange={(e) => setFormFunctionId(e.target.value)}
              required
            >
              <option value="">{t('evaluation.selectFunction')}</option>
              {functions.map((fn) => (
                <option key={fn.id} value={fn.id}>
                  {fn.display_name} · {fn.api_name}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
        {showCreate && formTarget === 'kb' ? (
          <FormField label={t('evaluation.wikiSpaceOptional')}>
            <select value={formWikiSpaceId} onChange={(e) => setFormWikiSpaceId(e.target.value)}>
              <option value="">{t('evaluation.noWikiSpace')}</option>
              {wikiSpaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
        <FormField label={t('shared.description')}>
          <textarea
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            placeholder={t('evaluation.descPlaceholder')}
            rows={3}
          />
        </FormField>
      </Dialog>
    </div>
  );
}
