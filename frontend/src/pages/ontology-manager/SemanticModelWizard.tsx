import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { createMetric, makeMetricExpression } from '../../data/metricsApi';
import {
  createSemanticModel,
  type SemanticModelResponse,
} from '../../data/semanticModelsApi';
import { Dialog, EmptyState, FormField } from '../../styles/design-system';

function datasetLabel(d: DatasetResponse): string {
  return d.display_name || `${d.schema_name}.${d.table_name}`;
}

type DraftMetric = { key: string; baseDatasetId: string; name: string; expression: string };

/** Stepwise "new semantic model": details → dataset scope → metrics. */
export function SemanticModelWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (model: SemanticModelResponse) => void;
}) {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [metrics, setMetrics] = useState<DraftMetric[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setName('');
    setDescription('');
    setSelected([]);
    setSearch('');
    setMetrics([]);
    setLoading(true);
    void fetchDatasets()
      .then((r) => setDatasets(r.items))
      .catch((e) => toast.error(e instanceof Error ? e.message : t('datasets.loadFailed')))
      .finally(() => setLoading(false));
    const id = window.setTimeout(() => nameRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open, t]);

  const selectedDatasets = useMemo(
    () => datasets.filter((d) => selected.includes(d.id)),
    [datasets, selected],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return datasets;
    return datasets.filter(
      (d) =>
        datasetLabel(d).toLowerCase().includes(s) ||
        `${d.schema_name}.${d.table_name}`.toLowerCase().includes(s) ||
        (d.data_source_name ?? '').toLowerCase().includes(s),
    );
  }, [datasets, search]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allFilteredSelected = filtered.length > 0 && filtered.every((d) => selected.includes(d.id));
  const toggleAll = () => {
    const ids = filtered.map((d) => d.id);
    setSelected((prev) =>
      allFilteredSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    );
  };

  const addMetric = () =>
    setMetrics((prev) => [
      ...prev,
      { key: crypto.randomUUID(), baseDatasetId: selected[0] ?? '', name: '', expression: '' },
    ]);

  const updateMetric = (key: string, patch: Partial<DraftMetric>) =>
    setMetrics((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  const handleCreate = async () => {
    const complete = metrics.filter((m) => m.name.trim() && m.expression.trim() && m.baseDatasetId);
    if (complete.length !== metrics.length) {
      toast.error(t('dataModel.metricRowIncomplete'));
      return;
    }
    setSubmitting(true);
    try {
      const model = await createSemanticModel({
        name: name.trim(),
        description: description.trim() || null,
        dataset_ids: selected,
      });
      for (const m of complete) {
        try {
          await createMetric({
            name: m.name.trim(),
            semantic_model_id: model.id,
            base_dataset_id: m.baseDatasetId,
            type: 'simple',
            expression: makeMetricExpression(m.expression.trim()),
          });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : t('datasets.metricCreateFailed'));
        }
      }
      toast.success(t('dataModel.modelCreated'));
      onCreated(model);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.modelCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    t('dataModel.wizardStepDetails'),
    t('dataModel.wizardStepDatasets'),
    t('dataModel.wizardStepMetrics'),
  ];

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      closeDisabled={submitting}
      title={t('dataModel.newModel')}
      closeAriaLabel={t('shared.cancel')}
      footer={
        <>
          {step === 0 ? (
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              {t('shared.cancel')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep((s) => s - 1)}
              disabled={submitting}
            >
              {t('dataModel.wizardBack')}
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 && !name.trim()}
            >
              {t('dataModel.wizardNext')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleCreate()}
              disabled={submitting}
            >
              {submitting ? <Loader2 size={16} className="console-loading-spinner" /> : t('dataModel.create')}
            </button>
          )}
        </>
      }
    >
      <ol className="model-wizard__steps" aria-label={t('dataModel.newModel')}>
        {steps.map((label, i) => (
          <li
            key={label}
            className={`model-wizard__step${i === step ? ' is-current' : ''}${i < step ? ' is-done' : ''}`}
          >
            <span className="model-wizard__index" aria-hidden>
              {i < step ? <Check size={12} /> : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="model-wizard__pane">
          <FormField label={t('dataModel.modelName')}>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) setStep(1);
              }}
            />
          </FormField>
          <FormField label={t('dataModel.modelDescription')}>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
        </div>
      )}

      {step === 1 && (
        <div className="model-wizard__pane">
          <p className="page-subtitle">{t('dataModel.modelDatasetsHint')}</p>
          <div className="model-wizard__dataset-toolbar">
            {/* ds-control-exempt: `.model-wizard__search` styles this input */}
            <div className="model-wizard__search">
              <Search size={16} aria-hidden />
              <input
                type="search"
                placeholder={t('dataModel.datasetSearch')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={toggleAll}>
              {allFilteredSelected ? t('dataModel.wizardClear') : t('dataModel.wizardSelectAll')}
            </button>
          </div>
          <div className="model-wizard__datasets">
            {loading ? (
              <Loader2 size={20} className="console-loading-spinner" aria-hidden />
            ) : filtered.length === 0 ? (
              <EmptyState
                title={t('dataModel.noDatasets')}
                description={t('dataModel.noDatasetsHint')}
                action={
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      onClose();
                      navigate('/datasets');
                    }}
                  >
                    <Plus size={16} aria-hidden />
                    {t('dataModel.newDataset')}
                  </button>
                }
              />
            ) : (
              filtered.map((d) => (
                <label key={d.id} className="ds-check-row">
                  <input
                    type="checkbox"
                    checked={selected.includes(d.id)}
                    onChange={() => toggle(d.id)}
                  />
                  <span>
                    {datasetLabel(d)}{' '}
                    {d.data_source_name ? (
                      <em className="model-wizard__ds">{d.data_source_name}</em>
                    ) : null}
                  </span>
                </label>
              ))
            )}
          </div>
          <p className="model-wizard__count">
            {t('dataModel.wizardSelected', { n: selected.length })}
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="model-wizard__pane">
          <p className="page-subtitle">{t('dataModel.metricsStepHint')}</p>
          {selectedDatasets.length === 0 ? (
            <p className="entity-view__readonly">{t('dataModel.pickDatasetsFirst')}</p>
          ) : (
            <>
              {metrics.map((m) => (
                <div key={m.key} className="model-wizard__metric">
                  <FormField label={t('datasets.metricName')}>
                    <input
                      type="text"
                      value={m.name}
                      onChange={(e) => updateMetric(m.key, { name: e.target.value })}
                    />
                  </FormField>
                  <FormField label={t('datasets.metricBaseDataset')}>
                    <select
                      value={m.baseDatasetId}
                      onChange={(e) => updateMetric(m.key, { baseDatasetId: e.target.value })}
                    >
                      <option value="">{t('datasets.selectDataset')}</option>
                      {selectedDatasets.map((d) => (
                        <option key={d.id} value={d.id}>
                          {datasetLabel(d)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField
                    label={t('datasets.metricExpression')}
                    hint={t('datasets.metricExpressionHint')}
                  >
                    <textarea
                      rows={2}
                      value={m.expression}
                      onChange={(e) => updateMetric(m.key, { expression: e.target.value })}
                      placeholder='SUM("amount")'
                    />
                  </FormField>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setMetrics((prev) => prev.filter((x) => x.key !== m.key))}
                  >
                    <Trash2 size={14} aria-hidden />
                    {t('shared.delete')}
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addMetric}>
                <Plus size={14} aria-hidden />
                {t('datasets.addMetric')}
              </button>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
