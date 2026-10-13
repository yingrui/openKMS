import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchDatasetJoins } from '../../data/joinsApi';
import { fetchMetrics } from '../../data/metricsApi';
import { fetchSavedQueries } from '../../data/queriesApi';
import {
  deleteSemanticModel,
  exportSemanticModel,
  exportSemanticModelYaml,
  fetchSemanticModel,
  updateSemanticModel,
  type SemanticModelResponse,
} from '../../data/semanticModelsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { Dialog, FormField } from '../../styles/design-system';
import { ModelSetupGuide } from './ModelSetupGuide';
import { ModelMetricsSection } from './ModelMetricsSection';
import { ModelQueriesSection } from './ModelQueriesSection';
import '../ontology/ontology-admin.scss';

function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function datasetLabel(d: DatasetResponse): string {
  return d.display_name || `${d.schema_name}.${d.table_name}`;
}

/** A single semantic model: its dataset scope, setup guide, metrics, and queries. */
export function SemanticModelDetailPage() {
  const { t } = useTranslation('ontology');
  const { modelId = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [model, setModel] = useState<SemanticModelResponse | null>(null);
  const [allDatasets, setAllDatasets] = useState<DatasetResponse[]>([]);
  const [relationshipCount, setRelationshipCount] = useState(0);
  const [metricCount, setMetricCount] = useState(0);
  const [queryCount, setQueryCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [metricsSignal, setMetricsSignal] = useState(0);
  const [queriesSignal, setQueriesSignal] = useState(0);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDatasets, setEditDatasets] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(() => {
    try {
      return localStorage.getItem(`openkms:model:${modelId}:setupDismissed`) === '1';
    } catch {
      return false;
    }
  });

  const load = useCallback(async () => {
    if (!modelId) return;
    setLoading(true);
    try {
      const [m, ds, joins, metrics, queries] = await Promise.all([
        fetchSemanticModel(modelId),
        fetchDatasets(),
        fetchDatasetJoins(),
        fetchMetrics(modelId),
        fetchSavedQueries(modelId),
      ]);
      setModel(m);
      setAllDatasets(ds.items);
      const scope = new Set(m.dataset_ids);
      setRelationshipCount(
        joins.items.filter(
          (j) => scope.has(j.from_dataset_id) && scope.has(j.to_dataset_id),
        ).length,
      );
      setMetricCount(metrics.total);
      setQueryCount(queries.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [modelId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = () => {
    if (!model) return;
    setEditName(model.name);
    setEditDescription(model.description ?? '');
    setEditDatasets(model.dataset_ids);
    setShowEdit(true);
  };

  const handleEdit = async () => {
    if (!model) return;
    if (!editName.trim()) {
      toast.error(t('dataModel.modelNameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await updateSemanticModel(model.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        dataset_ids: editDatasets,
      });
      toast.success(t('dataModel.modelSaved'));
      setShowEdit(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.modelSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async (format: 'json' | 'yaml') => {
    if (!model) return;
    try {
      if (format === 'yaml') {
        download(`${model.name}.yaml`, await exportSemanticModelYaml(model.id), 'application/yaml');
      } else {
        const doc = await exportSemanticModel(model.id);
        download(`${model.name}.json`, JSON.stringify(doc, null, 2), 'application/json');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.exportFailed'));
    }
  };

  const handleDelete = async () => {
    if (!model) return;
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('dataModel.modelDeleteConfirm', { name: model.name }),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteSemanticModel(model.id);
      toast.success(t('dataModel.modelDeleted'));
      navigate('/data-model');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.modelDeleteFailed'));
    }
  };

  const dismissSetup = () => {
    setSetupDismissed(true);
    try {
      localStorage.setItem(`openkms:model:${modelId}:setupDismissed`, '1');
    } catch {
      /* ignore */
    }
  };

  const toggleEditDataset = (id: string) =>
    setEditDatasets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  if (loading) {
    return (
      <div className="console-loading">
        <Loader2 size={32} className="console-loading-spinner" aria-hidden />
        <p>{t('shared.loading')}</p>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="ontology-admin">
        <p className="entity-view__readonly">{t('dataModel.modelNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="ontology-admin">
      <div className="page-header model-page-header">
        <div>
          <Link to="/data-model" className="model-back">
            <ChevronLeft size={14} aria-hidden />
            {t('dataModel.backToModels')}
          </Link>
          <h1>{model.name}</h1>
          <p className="page-subtitle">
            {model.description || t('dataModel.modelDatasetsHint')}
          </p>
        </div>
        <div className="dataset-columns__actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={openEdit}>
            <Pencil size={14} aria-hidden />
            {t('dataModel.editModel')}
          </button>
          <details className="model-menu">
            <summary className="btn btn-secondary btn-sm" aria-label={t('dataModel.more')}>
              <MoreHorizontal size={16} aria-hidden />
            </summary>
            <div className="model-menu__panel">
              <button type="button" onClick={() => void handleExport('json')}>
                {t('dataModel.exportJson')}
              </button>
              <button type="button" onClick={() => void handleExport('yaml')}>
                {t('dataModel.exportYaml')}
              </button>
              <button type="button" onClick={() => void handleDelete()}>
                <Trash2 size={14} aria-hidden />
                {t('shared.delete')}
              </button>
            </div>
          </details>
        </div>
      </div>

      <div className="ontology-admin-content">
        {!setupDismissed && (
          <ModelSetupGuide
            datasets={model.datasets.length}
            relationships={relationshipCount}
            metrics={metricCount}
            queries={queryCount}
            onAddDatasets={openEdit}
            onConnectDatasets={() =>
              navigate(
                model.datasets[0] ? `/datasets/${model.datasets[0].id}/relationships` : '/datasets',
              )
            }
            onAddMetric={() => setMetricsSignal((n) => n + 1)}
            onAddQuery={() => setQueriesSignal((n) => n + 1)}
            onExport={() => void handleExport('json')}
            onDismiss={dismissSetup}
          />
        )}

        <section>
          <h2>{t('dataModel.datasetsInScope')}</h2>
          {model.datasets.length === 0 ? (
            <p className="entity-view__readonly">{t('dataModel.noDatasetsInScope')}</p>
          ) : (
            <div className="model-scope">
              {model.datasets.map((d) => (
                <Link key={d.id} to={`/datasets/${d.id}`} className="model-scope__chip">
                  {d.name}
                </Link>
              ))}
            </div>
          )}
        </section>

        <ModelMetricsSection
          semanticModelId={model.id}
          datasetIds={model.dataset_ids}
          openCreateSignal={metricsSignal}
        />

        <ModelQueriesSection
          semanticModelId={model.id}
          datasetIds={model.dataset_ids}
          openCreateSignal={queriesSignal}
        />
      </div>

      <Dialog
        open={showEdit}
        onClose={() => !submitting && setShowEdit(false)}
        closeDisabled={submitting}
        title={t('dataModel.editModel')}
        closeAriaLabel={t('shared.cancel')}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => !submitting && setShowEdit(false)}
              disabled={submitting}
            >
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleEdit()}
              disabled={submitting || !editName.trim()}
            >
              {submitting ? t('shared.saving') : t('shared.save')}
            </button>
          </>
        }
      >
        <FormField label={t('dataModel.modelName')}>
          <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
        </FormField>
        <FormField label={t('dataModel.modelDescription')}>
          <textarea
            rows={2}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
        </FormField>
        <FormField label={t('dataModel.modelDatasets')} hint={t('dataModel.modelDatasetsHint')}>
          <div className="dataset-pk-list">
            {allDatasets.map((d) => (
              <label key={d.id} className="ds-check-row">
                <input
                  type="checkbox"
                  checked={editDatasets.includes(d.id)}
                  onChange={() => toggleEditDataset(d.id)}
                />
                <span>{datasetLabel(d)}</span>
              </label>
            ))}
          </div>
        </FormField>
      </Dialog>
    </div>
  );
}
