import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Loader2, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchDatasetJoins, type DatasetJoinResponse } from '../../data/joinsApi';
import {
  computeMetric,
  createMetric,
  deleteMetric,
  fetchMetricRuns,
  fetchMetrics,
  metricExpressionSql,
  updateMetric,
  type MetricResponse,
  type MetricRunResponse,
} from '../../data/metricsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { FormField } from '../../styles/design-system';

const METRIC_TYPES = ['simple', 'ratio', 'derived', 'cumulative', 'conversion'] as const;

/** Model → Metrics: author model-level metrics (Ossie SQL expressions) and run them. */
export function ModelMetricsSection({ openCreateSignal = 0 }: { openCreateSignal?: number }) {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();

  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [joins, setJoins] = useState<DatasetJoinResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [history, setHistory] = useState<{ metricId: string; runs: MetricRunResponse[] } | null>(null);

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
        fetchMetrics(),
        fetchDatasets(),
        fetchDatasetJoins(),
      ]);
      setMetrics(m.items);
      setDatasets(ds.items);
      setJoins(j.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Relationships touching the selected base dataset (the metric's join graph).
  const baseJoins = useMemo(
    () =>
      joins.filter(
        (j) => j.from_dataset_id === baseDatasetId || j.to_dataset_id === baseDatasetId,
      ),
    [joins, baseDatasetId],
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
      base_dataset_id: baseDatasetId,
      business_definition: definition.trim() || null,
      type,
      expression: { dialects: { ANSI_SQL: expression.trim() } },
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

  const handleCompute = async (m: MetricResponse) => {
    setBusyId(m.id);
    try {
      const res = await computeMetric(m.id);
      setValues((prev) => ({ ...prev, [m.id]: res.rows[0]?.value ?? null }));
      toast.success(t('datasets.metricComputed'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.metricComputeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleHistory = async (m: MetricResponse) => {
    try {
      const runs = await fetchMetricRuns(m.id);
      setHistory({ metricId: m.id, runs });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.metricRunsFailed'));
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
      <div className="dataset-columns__toolbar">
        <h2>{t('dataModel.metrics')}</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
          <Plus size={14} aria-hidden />
          {t('datasets.addMetric')}
        </button>
      </div>

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
                <th>{t('datasets.metricValue')}</th>
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
                  <td>
                    {m.id in values ? String(values[m.id] ?? t('datasets.dash')) : t('datasets.dash')}
                  </td>
                  <td className="dataset-field-row__actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handleCompute(m)}
                      disabled={busyId === m.id}
                      title={t('datasets.runMetric')}
                    >
                      {busyId === m.id ? (
                        <Loader2 size={14} className="console-loading-spinner" aria-hidden />
                      ) : (
                        <Play size={14} aria-hidden />
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handleHistory(m)}
                      title={t('datasets.metricHistory')}
                    >
                      <Clock size={14} aria-hidden />
                    </button>
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

      {history && (
        <div className="data-model__runs">
          <div className="dataset-columns__toolbar">
            <h3>{t('datasets.metricHistory')}</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setHistory(null)}>
              <X size={14} aria-hidden />
              {t('shared.close')}
            </button>
          </div>
          {history.runs.length === 0 ? (
            <p className="entity-view__readonly">{t('datasets.noRuns')}</p>
          ) : (
            <ul className="data-model__run-list">
              {history.runs.map((r) => (
                <li key={r.id}>
                  <span className={`data-model__run-status data-model__run-status--${r.status}`}>
                    {r.status}
                  </span>
                  {r.duration_ms}ms
                  {r.error ? ` · ${r.error}` : ` · ${r.row_count} ${t('datasets.rows')}`}
                </li>
              ))}
            </ul>
          )}
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
