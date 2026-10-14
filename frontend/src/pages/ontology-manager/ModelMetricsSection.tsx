import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchDatasetJoins, type DatasetJoinResponse } from '../../data/joinsApi';
import {
  createMetric,
  deleteMetric,
  fetchMetrics,
  makeMetricExpression,
  metricExpressionSql,
  updateMetric,
  type MetricResponse,
} from '../../data/metricsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { FormField, PanelToolbar } from '../../styles/design-system';

const METRIC_TYPES = ['simple', 'ratio', 'derived', 'cumulative', 'conversion'] as const;

/** Model → Metrics: author model-level metrics (Ossie SQL expressions). Running is **Try**. */
export function ModelMetricsSection({
  semanticModelId,
  datasetIds = [],
  openCreateSignal = 0,
}: {
  semanticModelId: string;
  datasetIds?: string[];
  openCreateSignal?: number;
}) {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();

  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [joins, setJoins] = useState<DatasetJoinResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MetricResponse | null>(null);
  const [name, setName] = useState('');
  const [baseDatasetId, setBaseDatasetId] = useState('');
  const [type, setType] = useState<string>('simple');
  const [expression, setExpression] = useState('');
  const [datatype, setDatatype] = useState('');
  const [selectedJoins, setSelectedJoins] = useState<string[]>([]);
  const [definition, setDefinition] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, ds, j] = await Promise.all([
        fetchMetrics(semanticModelId),
        fetchDatasets(),
        fetchDatasetJoins(),
      ]);
      setMetrics(m.items);
      setDatasets(ds.items.filter((d) => datasetIds.includes(d.id)));
      setJoins(j.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [semanticModelId, datasetIds, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Relationships touching the selected base dataset (the metric's join graph).
  const baseJoins = useMemo(
    () =>
      joins.filter(
        (j) =>
          (j.from_dataset_id === baseDatasetId || j.to_dataset_id === baseDatasetId) &&
          datasetIds.includes(j.from_dataset_id) &&
          datasetIds.includes(j.to_dataset_id),
      ),
    [joins, baseDatasetId, datasetIds],
  );

  const openCreate = () => {
    setEditing(null);
    setName('');
    setBaseDatasetId(datasets[0]?.id ?? '');
    setType('simple');
    setExpression('');
    setDatatype('');
    setSelectedJoins([]);
    setDefinition('');
    setAiInstructions('');
    setShowForm(true);
  };

  useEffect(() => {
    if (openCreateSignal > 0) openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreateSignal]);

  const openEdit = (m: MetricResponse) => {
    setEditing(m);
    setName(m.name);
    setBaseDatasetId(m.base_dataset_id);
    setType(m.type);
    setExpression(metricExpressionSql(m));
    setDatatype(m.datatype ?? '');
    setSelectedJoins((m.joins as string[] | null) ?? []);
    setDefinition(m.business_definition ?? '');
    setAiInstructions(
      typeof m.ai_context?.instructions === 'string' ? String(m.ai_context.instructions) : '',
    );
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t('datasets.metricNameRequired'));
      return;
    }
    if (!baseDatasetId) {
      toast.error(t('datasets.metricBaseRequired'));
      return;
    }
    if (!expression.trim()) {
      toast.error(t('datasets.metricExpressionRequired'));
      return;
    }
    const payload = {
      name: name.trim(),
      semantic_model_id: semanticModelId,
      base_dataset_id: baseDatasetId,
      business_definition: definition.trim() || null,
      type,
      expression: makeMetricExpression(expression.trim()),
      datatype: datatype.trim() || null,
      joins: selectedJoins,
      ai_context: aiInstructions.trim() ? { instructions: aiInstructions.trim() } : null,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateMetric(editing.id, payload);
        toast.success(t('datasets.metricSaved'));
      } else {
        await createMetric(payload);
        toast.success(t('datasets.metricCreated'));
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.metricSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (m: MetricResponse) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('datasets.metricDeleteConfirm', { name: m.name }),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteMetric(m.id);
      toast.success(t('datasets.metricDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.metricDeleteFailed'));
    }
  };

  const datasetLabel = (id: string) => {
    const d = datasets.find((x) => x.id === id);
    return d ? d.display_name || `${d.schema_name}.${d.table_name}` : id;
  };

  return (
    <section>
      <PanelToolbar
        leading={
          <span className="page-subtitle">
            {t('dataModel.metricCount', { count: metrics.length })}
          </span>
        }
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} aria-hidden />
            <span>{t('datasets.addMetric')}</span>
          </button>
        }
      />

      {loading ? (
        <div className="console-loading">
          <Loader2 size={28} className="console-loading-spinner" aria-hidden />
          <p>{t('shared.loading')}</p>
        </div>
      ) : metrics.length === 0 ? (
        <p className="entity-view__readonly">{t('datasets.metricEmpty')}</p>
      ) : (
        <div className="ds-table-wrap ds-table-wrap--flush">
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('datasets.metricName')}</th>
                <th>{t('datasets.metricBaseDataset')}</th>
                <th>{t('datasets.metricType')}</th>
                <th>{t('datasets.metricExpression')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                  </td>
                  <td>{m.base_dataset_name ?? datasetLabel(m.base_dataset_id)}</td>
                  <td>{m.type}</td>
                  <td>
                    <code>{metricExpressionSql(m)}</code>
                  </td>
                  <td className="dataset-field-row__actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEdit(m)}
                      title={t('datasets.editMetric')}
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handleDelete(m)}
                      title={t('shared.delete')}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div
          className="console-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !submitting && setShowForm(false)}
        >
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>{editing ? t('datasets.editMetric') : t('datasets.addMetric')}</h2>
              <button
                type="button"
                onClick={() => !submitting && setShowForm(false)}
                disabled={submitting}
                aria-label={t('datasets.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              <FormField label={t('datasets.metricName')}>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label={t('datasets.metricBaseDataset')}>
                <select value={baseDatasetId} onChange={(e) => setBaseDatasetId(e.target.value)}>
                  <option value="">{t('datasets.selectDataset')}</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.display_name || `${d.schema_name}.${d.table_name}`}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={t('datasets.metricType')}>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {METRIC_TYPES.map((mt) => (
                    <option key={mt} value={mt}>
                      {mt}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={t('datasets.metricExpression')} hint={t('datasets.metricExpressionHint')}>
                <textarea
                  rows={3}
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder='SUM("amount") / COUNT(DISTINCT "id")'
                />
              </FormField>
              <FormField label={t('datasets.metricDatatype')}>
                <input
                  type="text"
                  value={datatype}
                  onChange={(e) => setDatatype(e.target.value)}
                  placeholder="number / string / datetime"
                />
              </FormField>
              {baseJoins.length > 0 && (
                <FormField label={t('datasets.metricJoins')}>
                  <div className="dataset-metric-joins">
                    {baseJoins.map((j) => {
                      const other =
                        j.from_dataset_id === baseDatasetId
                          ? j.to_dataset_name
                          : j.from_dataset_name;
                      return (
                        <label key={j.id} className="ds-check-row">
                          <input
                            type="checkbox"
                            checked={selectedJoins.includes(j.id)}
                            onChange={(e) =>
                              setSelectedJoins((prev) =>
                                e.target.checked
                                  ? [...prev, j.id]
                                  : prev.filter((x) => x !== j.id),
                              )
                            }
                          />
                          <span>{other ?? t('datasets.dash')}</span>
                        </label>
                      );
                    })}
                  </div>
                </FormField>
              )}
              <FormField label={t('datasets.metricDefinition')}>
                <textarea
                  rows={2}
                  value={definition}
                  onChange={(e) => setDefinition(e.target.value)}
                />
              </FormField>
              <FormField label={t('datasets.aiInstructions')}>
                <textarea
                  rows={2}
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                />
              </FormField>
            </div>
            <div className="console-modal-actions">
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
                onClick={() => void handleSubmit()}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 size={16} className="console-loading-spinner" />
                ) : (
                  t('shared.save')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
