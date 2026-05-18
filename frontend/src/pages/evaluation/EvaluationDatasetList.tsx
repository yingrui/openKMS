import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus, Trash2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchEvaluationDatasets,
  createEvaluationDataset,
  deleteEvaluationDataset,
  updateEvaluationDataset,
  type EvaluationDatasetResponse,
} from '../../data/evaluationDatasetsApi';
import { fetchKnowledgeBases, type KnowledgeBaseResponse } from '../../data/knowledgeBasesApi';
import { fetchWikiSpaces, type WikiSpaceResponse } from '../../data/wikiSpacesApi';
import './EvaluationDatasetList.css';

export function EvaluationDatasetList() {
  const { t } = useTranslation('workspace');
  const [datasets, setDatasets] = useState<EvaluationDatasetResponse[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBaseResponse[]>([]);
  const [wikiSpaces, setWikiSpaces] = useState<WikiSpaceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editDs, setEditDs] = useState<EvaluationDatasetResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formKbId, setFormKbId] = useState('');
  const [formWikiSpaceId, setFormWikiSpaceId] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [dsData, kbData, wikiData] = await Promise.all([
        fetchEvaluationDatasets(),
        fetchKnowledgeBases(),
        fetchWikiSpaces().catch(() => ({ items: [], total: 0 })),
      ]);
      setDatasets(dsData.items);
      setKbs(kbData.items);
      setWikiSpaces(wikiData.items ?? []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluation.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    if (!formName.trim() || !formKbId) return;
    setSaving(true);
    try {
      await createEvaluationDataset({
        name: formName.trim(),
        knowledge_base_id: formKbId,
        wiki_space_id: formWikiSpaceId.trim() || null,
        description: formDesc.trim() || undefined,
      });
      setShowCreate(false);
      setFormName('');
      setFormKbId('');
      setFormWikiSpaceId('');
      setFormDesc('');
      toast.success(t('evaluation.createdToast'));
      void load();
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
      await updateEvaluationDataset(editDs.id, {
        name: formName.trim(),
        description: formDesc.trim() || undefined,
      });
      setEditDs(null);
      setFormName('');
      setFormDesc('');
      toast.success(t('evaluation.updatedToast'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluation.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ds: EvaluationDatasetResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t('evaluation.deleteConfirm', { name: ds.name }))) return;
    try {
      await deleteEvaluationDataset(ds.id);
      toast.success(t('evaluation.deletedToast'));
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('shared.deleteFailed'));
    }
  };

  const openEdit = (ds: EvaluationDatasetResponse, e: React.MouseEvent) => {
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
          <span>{t('evaluation.newDataset')}</span>
        </button>
      </div>

      {loading && <p className="eval-loading">{t('evaluation.loading')}</p>}

      {!loading && datasets.length === 0 && (
        <div className="eval-empty">
          <ClipboardList size={48} strokeWidth={1} />
          <p>{t('evaluation.empty')}</p>
        </div>
      )}

      <div className="eval-grid">
        {datasets.map((ds) => (
          <Link key={ds.id} to={`/evaluation-datasets/${ds.id}`} className="eval-card">
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

      {(showCreate || editDs) && (
        <div className="eval-dialog-overlay" onClick={closeDialog}>
          <div className="eval-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="eval-dialog-header">
              <h2>{editDs ? t('evaluation.dialogEdit') : t('evaluation.dialogNew')}</h2>
              <button type="button" className="eval-dialog-close" aria-label={t('shared.close')} onClick={closeDialog}>
                <X size={20} />
              </button>
            </div>
            <div className="eval-dialog-body">
              <label>
                <span>{t('shared.name')}</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('evaluation.namePlaceholder')}
                  autoFocus
                />
              </label>
              {showCreate && (
                <label>
                  <span>{t('evaluation.knowledgeBase')}</span>
                  <select value={formKbId} onChange={(e) => setFormKbId(e.target.value)} required>
                    <option value="">{t('evaluation.selectKb')}</option>
                    {kbs.map((kb) => (
                      <option key={kb.id} value={kb.id}>
                        {kb.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {showCreate && (
                <label>
                  <span>{t('evaluation.wikiSpaceOptional')}</span>
                  <select
                    value={formWikiSpaceId}
                    onChange={(e) => setFormWikiSpaceId(e.target.value)}
                  >
                    <option value="">{t('evaluation.noWikiSpace')}</option>
                    {wikiSpaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <span>{t('shared.description')}</span>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder={t('evaluation.descPlaceholder')}
                  rows={3}
                />
              </label>
            </div>
            <div className="eval-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeDialog}>
                {t('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!formName.trim() || (showCreate && !formKbId) || saving}
                onClick={() => void (editDs ? handleEdit() : handleCreate())}
              >
                {saving ? t('evaluation.saving') : editDs ? t('shared.save') : t('shared.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
