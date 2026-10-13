import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Boxes, Loader2, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import {
  createSemanticModel,
  fetchSemanticModels,
  importSemanticModel,
  type SemanticModelResponse,
} from '../../data/semanticModelsApi';
import { Dialog, EmptyState, FormField } from '../../styles/design-system';
import { DatasetAppTabs } from './DatasetAppTabs';
import '../ontology/ontology-admin.scss';

function datasetLabel(d: DatasetResponse): string {
  return d.display_name || `${d.schema_name}.${d.table_name}`;
}

/** Model tab: the list of semantic models. Open one to edit its scope, metrics, and queries. */
export function DataModelPage() {
  const { t } = useTranslation('ontology');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<SemanticModelResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, ds] = await Promise.all([fetchSemanticModels(), fetchDatasets()]);
      setModels(m.items);
      setDatasets(ds.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setName('');
    setDescription('');
    setSelectedDatasets([]);
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t('dataModel.modelNameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await createSemanticModel({
        name: name.trim(),
        description: description.trim() || null,
        dataset_ids: selectedDatasets,
      });
      toast.success(t('dataModel.modelCreated'));
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.modelCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const doc = JSON.parse(await file.text()) as unknown;
      const summary = await importSemanticModel(doc);
      toast.success(
        t('dataModel.importDone', {
          r: summary.relationships,
          m: summary.metrics,
          q: summary.queries,
        }),
      );
      if (summary.warnings.length) {
        toast.message(t('dataModel.importWarnings', { n: summary.warnings.length }));
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.importFailed'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleDataset = (id: string) =>
    setSelectedDatasets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <div className="ontology-admin">
      <div className="page-header model-page-header">
        <div>
          <h1>{t('dataModel.title')}</h1>
          <p className="page-subtitle">{t('dataModel.subtitle')}</p>
        </div>
        <div className="dataset-columns__actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={14} aria-hidden />
            {t('dataModel.newModel')}
          </button>
          <details className="model-menu">
            <summary className="btn btn-secondary btn-sm" aria-label={t('dataModel.more')}>
              <MoreHorizontal size={16} aria-hidden />
            </summary>
            <div className="model-menu__panel">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                {t('dataModel.importModel')}
              </button>
            </div>
          </details>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
          }}
        />
      </div>
      <DatasetAppTabs />
      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : models.length === 0 ? (
          <EmptyState
            icon={<Boxes size={32} aria-hidden />}
            title={t('dataModel.modelsEmpty')}
            description={t('dataModel.modelsEmptyHint')}
            action={
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Plus size={16} aria-hidden />
                {t('dataModel.newModel')}
              </button>
            }
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('dataModel.colModel')}</th>
                  <th>{t('dataModel.colDatasets')}</th>
                  <th>{t('dataModel.modelDescription')}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link to={`/data-model/${m.id}`} className="ontology-manager-list__api-link">
                        <strong>{m.name}</strong>
                      </Link>
                    </td>
                    <td>{m.datasets.length}</td>
                    <td className="console-table-muted">{m.description ?? t('datasets.dash')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        closeDisabled={submitting}
        title={t('dataModel.newModel')}
        closeAriaLabel={t('shared.cancel')}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => !submitting && setShowForm(false)}
              disabled={submitting}
            >
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleCreate()}
              disabled={submitting || !name.trim()}
            >
              {submitting ? t('shared.saving') : t('datasets.create')}
            </button>
          </>
        }
      >
        <FormField label={t('dataModel.modelName')}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={t('dataModel.modelDescription')}>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        <FormField label={t('dataModel.modelDatasets')} hint={t('dataModel.modelDatasetsHint')}>
          <div className="dataset-pk-list">
            {datasets.map((d) => (
              <label key={d.id} className="ds-check-row">
                <input
                  type="checkbox"
                  checked={selectedDatasets.includes(d.id)}
                  onChange={() => toggleDataset(d.id)}
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
