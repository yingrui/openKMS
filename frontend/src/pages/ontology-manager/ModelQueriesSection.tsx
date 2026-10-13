import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchDatasetFields, type DatasetFieldResponse } from '../../data/fieldsApi';
import { fetchDatasetJoins, type DatasetJoinResponse } from '../../data/joinsApi';
import { fetchMetrics, type MetricResponse } from '../../data/metricsApi';
import {
  createSavedQuery,
  deleteSavedQuery,
  fetchSavedQueries,
  runSavedQuery,
  updateSavedQuery,
  type QueryFilter,
  type SavedQueryResponse,
  type SavedQueryRunResponse,
} from '../../data/queriesApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { FormField } from '../../styles/design-system';

const FILTER_OPS = ['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'not_in', 'is_null', 'is_not_null'];

/** Model → Queries: author saved queries (metrics + dimensions + filter) and run them. */
export function ModelQueriesSection() {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();

  const [queries, setQueries] = useState<SavedQueryResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [joins, setJoins] = useState<DatasetJoinResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<(SavedQueryRunResponse & { name: string }) | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SavedQueryResponse | null>(null);
  const [name, setName] = useState('');
  const [baseDatasetId, setBaseDatasetId] = useState('');
  const [fields, setFields] = useState<DatasetFieldResponse[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [selectedJoins, setSelectedJoins] = useState<string[]>([]);
  const [filters, setFilters] = useState<QueryFilter[]>([{ column: '', op: '=', value: '' }]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, ds, m, j] = await Promise.all([
        fetchSavedQueries(),
        fetchDatasets(),
        fetchMetrics(),
        fetchDatasetJoins(),
      ]);
      setQueries(q.items);
      setDatasets(ds.items);
      setMetrics(m.items);
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

  useEffect(() => {
    if (!baseDatasetId) {
      setFields([]);
      return;
    }
    let cancelled = false;
    void fetchDatasetFields(baseDatasetId)
      .then((f) => !cancelled && setFields(f.items))
      .catch(() => !cancelled && setFields([]));
    return () => {
      cancelled = true;
    };
  }, [baseDatasetId]);

  const baseJoins = useMemo(
    () =>
      joins.filter((j) => j.from_dataset_id === baseDatasetId || j.to_dataset_id === baseDatasetId),
    [joins, baseDatasetId],
  );
  const baseMetrics = useMemo(
    () => metrics.filter((m) => m.base_dataset_id === baseDatasetId),
    [metrics, baseDatasetId],
  );

  const openCreate = () => {
    setEditing(null);
    setName('');
    setBaseDatasetId(datasets[0]?.id ?? '');
    setSelectedFields([]);
    setSelectedMetrics([]);
    setSelectedJoins([]);
    setFilters([{ column: '', op: '=', value: '' }]);
    setDescription('');
    setShowForm(true);
  };

  const openEdit = (q: SavedQueryResponse) => {
    setEditing(q);
    setName(q.name);
    setBaseDatasetId(q.base_dataset_id);
    setSelectedFields(q.group_by);
    setSelectedMetrics(q.metrics.map((m) => m.metric_id));
    setSelectedJoins(q.joins);
    setFilters(q.filters && q.filters.length > 0 ? q.filters : [{ column: '', op: '=', value: '' }]);
    setDescription(q.description ?? '');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t('datasets.queryNameRequired'));
      return;
    }
    if (!baseDatasetId) {
      toast.error(t('datasets.metricBaseRequired'));
      return;
    }
    if (selectedMetrics.length === 0 && selectedFields.length === 0) {
      toast.error(t('datasets.queryNeedsMetricOrField'));
      return;
    }
    const cleanFilters = filters
      .filter((f) => f.column.trim())
      .map((f) => ({
        column: f.column.trim(),
        op: f.op,
        value: f.value === '' ? null : f.value,
      }));
    const payload = {
      name: name.trim(),
      base_dataset_id: baseDatasetId,
      description: description.trim() || null,
      metrics: selectedMetrics.map((id) => ({
        name: metrics.find((m) => m.id === id)?.name ?? id,
        metric_id: id,
      })),
      group_by: selectedFields,
      joins: selectedJoins,
      filters: cleanFilters.length ? cleanFilters : null,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateSavedQuery(editing.id, payload);
        toast.success(t('datasets.querySaved'));
      } else {
        await createSavedQuery(payload);
        toast.success(t('datasets.queryCreated'));
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.querySaveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRun = async (q: SavedQueryResponse) => {
    setBusyId(q.id);
    try {
      const res = await runSavedQuery(q.id);
      setResult({ ...res, name: q.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.queryRunFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (q: SavedQueryResponse) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('datasets.queryDeleteConfirm', { name: q.name }),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteSavedQuery(q.id);
      toast.success(t('datasets.queryDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.queryDeleteFailed'));
    }
  };

  const toggle = (list: string[], id: string, set: (v: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <section>
      <div className="dataset-columns__toolbar">
        <h2>{t('dataModel.queries')}</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
          <Plus size={14} aria-hidden />
          {t('datasets.addQuery')}
        </button>
      </div>

      {loading ? (
        <div className="console-loading">
          <Loader2 size={28} className="console-loading-spinner" aria-hidden />
          <p>{t('shared.loading')}</p>
        </div>
      ) : queries.length === 0 ? (
        <p className="entity-view__readonly">{t('datasets.noQueries')}</p>
      ) : (
        <div className="ds-table-wrap ds-table-wrap--flush">
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('datasets.queryName')}</th>
                <th>{t('datasets.queryBaseDataset')}</th>
                <th>{t('datasets.queryGroupBy')}</th>
                <th>{t('datasets.queryMetrics')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {queries.map((q) => (
                <tr key={q.id}>
                  <td>
                    <strong>{q.name}</strong>
                  </td>
                  <td>{q.base_dataset_name ?? q.base_dataset_id}</td>
                  <td>{q.group_by.join(', ') || t('datasets.dash')}</td>
                  <td>{q.metrics.map((m) => m.name).join(', ') || t('datasets.dash')}</td>
                  <td className="dataset-field-row__actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handleRun(q)}
                      disabled={busyId === q.id}
                      title={t('datasets.runQuery')}
                    >
                      {busyId === q.id ? (
                        <Loader2 size={14} className="console-loading-spinner" aria-hidden />
                      ) : (
                        <Play size={14} aria-hidden />
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEdit(q)}
                      title={t('datasets.editQuery')}
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handleDelete(q)}
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

      {result && (
        <div className="data-model__runs">
          <div className="dataset-columns__toolbar">
            <h3>
              {t('datasets.queryResults')} — {result.name} ({result.duration_ms}ms)
            </h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setResult(null)}>
              <X size={14} aria-hidden />
              {t('shared.close')}
            </button>
          </div>
          {result.rows.length === 0 ? (
            <p className="entity-view__readonly">{t('datasets.noRuns')}</p>
          ) : (
            <div className="ds-table-wrap ds-table-wrap--flush">
              <table className="console-table">
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      {result.columns.map((c) => (
                        <td key={c}>{row[c] === null || row[c] === undefined ? t('datasets.dash') : String(row[c])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              <h2>{editing ? t('datasets.editQuery') : t('datasets.addQuery')}</h2>
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
              <FormField label={t('datasets.queryName')}>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label={t('datasets.queryBaseDataset')}>
                <select value={baseDatasetId} onChange={(e) => setBaseDatasetId(e.target.value)}>
                  <option value="">{t('datasets.selectDataset')}</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.display_name || `${d.schema_name}.${d.table_name}`}
                    </option>
                  ))}
                </select>
              </FormField>
              {baseDatasetId && (
                <>
                  <FormField label={t('datasets.queryGroupBy')}>
                    <div className="dataset-metric-joins">
                      {fields.map((f) => (
                        <label key={f.id} className="ds-check-row">
                          <input
                            type="checkbox"
                            checked={selectedFields.includes(f.name)}
                            onChange={() => toggle(selectedFields, f.name, setSelectedFields)}
                          />
                          <span>{f.name}</span>
                        </label>
                      ))}
                    </div>
                  </FormField>
                  <FormField label={t('datasets.queryMetrics')}>
                    <div className="dataset-metric-joins">
                      {baseMetrics.map((m) => (
                        <label key={m.id} className="ds-check-row">
                          <input
                            type="checkbox"
                            checked={selectedMetrics.includes(m.id)}
                            onChange={() => toggle(selectedMetrics, m.id, setSelectedMetrics)}
                          />
                          <span>{m.name}</span>
                        </label>
                      ))}
                    </div>
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
                                onChange={() => toggle(selectedJoins, j.id, setSelectedJoins)}
                              />
                              <span>{other ?? t('datasets.dash')}</span>
                            </label>
                          );
                        })}
                      </div>
                    </FormField>
                  )}
                </>
              )}
              <FormField label={t('datasets.queryFilters')}>
                <div className="dataset-metric-joins">
                  {filters.map((f, i) => (
                    <div key={i} className="dataset-joins__pair">
                      <input
                        type="text"
                        placeholder={t('datasets.colColumn')}
                        value={f.column}
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, column: e.target.value } : x)),
                          )
                        }
                      />
                      <select
                        value={f.op}
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)),
                          )
                        }
                      >
                        {FILTER_OPS.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder={t('datasets.filterValue')}
                        value={String(f.value ?? '')}
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                          )
                        }
                      />
                      {filters.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setFilters((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setFilters((prev) => [...prev, { column: '', op: '=', value: '' }])}
                  >
                    <Plus size={16} aria-hidden />
                    {t('datasets.addFilter')}
                  </button>
                </div>
              </FormField>
              <FormField label={t('datasets.metricDefinition')}>
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
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
