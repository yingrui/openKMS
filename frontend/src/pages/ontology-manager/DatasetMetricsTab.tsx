import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDatasetDetail } from './DatasetDetailPage';
import { fetchDatasetMetadata, type ColumnMetadata } from '../../data/datasetsApi';
import { fetchDatasetJoins, type DatasetJoinResponse } from '../../data/joinsApi';
import {
  computeMetric,
  createMetric,
  deleteMetric,
  fetchMetrics,
  type MetricResponse,
} from '../../data/metricsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { Dialog, EmptyState, FormField } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel, EntityViewLoading } from './EntityViewShell';

const AGGS = ['count', 'sum', 'avg', 'min', 'max'] as const;

export function DatasetMetricsTab() {
  const { t } = useTranslation('ontology');
  const { dataset } = useDatasetDetail();
  const datasetId = dataset.id;
  const confirm = useConfirm();

  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [joins, setJoins] = useState<DatasetJoinResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ metricId: string; rows: Record<string, unknown>[] } | null>(
    null,
  );

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [aggregation, setAggregation] = useState('count');
  const [column, setColumn] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [selectedJoins, setSelectedJoins] = useState<string[]>([]);
  const [definition, setDefinition] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, meta, j] = await Promise.all([
        fetchMetrics(datasetId),
        fetchDatasetMetadata(datasetId),
        fetchDatasetJoins(datasetId),
      ]);
      setMetrics(m);
      setColumns(meta);
      setJoins(j.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [datasetId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setName('');
    setAggregation('count');
    setColumn('');
    setDimensions('');
    setSelectedJoins([]);
    setDefinition('');
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t('datasets.metricNameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await createMetric(datasetId, {
        name: name.trim(),
        business_definition: definition.trim() || null,
        aggregation,
        column_name: aggregation === 'count' && !column ? null : column || null,
        dimensions: dimensions
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
        joins: selectedJoins,
      });
      toast.success(t('datasets.metricCreated'));
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.metricCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompute = async (metricId: string) => {
    setBusyId(metricId);
    try {
      const res = await computeMetric(datasetId, metricId);
      setResult({ metricId, rows: res.rows });
      toast.success(t('datasets.metricComputed'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.metricComputeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (metricId: string) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('datasets.metricDeleteConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteMetric(datasetId, metricId);
      toast.success(t('datasets.metricDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.metricDeleteFailed'));
    }
  };

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;

  const resultColumns = result?.rows?.length ? Object.keys(result.rows[0]) : [];

  return (
    <>
      <EntityViewHeader title={t('datasets.metrics')} subtitle={t('datasets.metricsHint')} />
      <EntityViewPanel>
        <div className="dataset-joins__toolbar">
          <h3>{t('datasets.metricList')}</h3>
          <button type="button" className="btn btn-secondary" onClick={openCreate}>
            <Plus size={16} aria-hidden />
            {t('datasets.addMetric')}
          </button>
        </div>
        {metrics.length === 0 ? (
          <EmptyState title={t('datasets.metricEmpty')} description={t('datasets.metricsHint')} />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('datasets.colName')}</th>
                  <th>{t('datasets.metricAggregation')}</th>
                  <th>{t('datasets.colColumn')}</th>
                  <th>{t('datasets.metricDimensions')}</th>
                  <th className="console-table-actions">{t('datasets.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                    </td>
                    <td>{m.aggregation}</td>
                    <td>{m.column_name ?? t('datasets.dash')}</td>
                    <td>{m.dimensions?.length ? m.dimensions.join(', ') : t('datasets.dash')}</td>
                    <td className="console-table-actions">
                      <div className="console-table-btns">
                        <button
                          type="button"
                          title={t('datasets.metricCompute')}
                          onClick={() => void handleCompute(m.id)}
                          disabled={busyId === m.id}
                        >
                          <Calculator size={16} />
                        </button>
                        <button
                          type="button"
                          title={t('shared.delete')}
                          onClick={() => void handleDelete(m.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </EntityViewPanel>

      {result && (
        <EntityViewPanel>
          <h3>{t('datasets.metricResult')}</h3>
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  {resultColumns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i}>
                    {resultColumns.map((c) => (
                      <td key={c}>{row[c] === null || row[c] === undefined ? t('datasets.dash') : String(row[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EntityViewPanel>
      )}

      <Dialog
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        closeDisabled={submitting}
        title={t('datasets.addMetric')}
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
              disabled={!name.trim() || submitting}
            >
              {submitting ? t('shared.saving') : t('joinCreate')}
            </button>
          </>
        }
      >
        <FormField label={t('datasets.colName')}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={t('datasets.metricAggregation')}>
          <select value={aggregation} onChange={(e) => setAggregation(e.target.value)}>
            {AGGS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('datasets.colColumn')}>
          <select value={column} onChange={(e) => setColumn(e.target.value)}>
            <option value="">{t('datasets.joinColumnPlaceholder')}</option>
            {columns.map((c) => (
              <option key={c.column_name} value={c.column_name}>
                {c.column_name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('datasets.metricDimensions')}>
          <input
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder={t('datasets.tagsPlaceholder')}
          />
        </FormField>
        {joins.length > 0 && (
          <FormField label={t('datasets.metricJoins')}>
            <div className="dataset-metric-joins">
              {joins.map((j) => {
                const other =
                  j.source_dataset_id === datasetId ? j.target_dataset_name : j.source_dataset_name;
                return (
                  <label key={j.id} className="ds-check-row">
                    <input
                      type="checkbox"
                      checked={selectedJoins.includes(j.id)}
                      onChange={(e) =>
                        setSelectedJoins((prev) =>
                          e.target.checked ? [...prev, j.id] : prev.filter((x) => x !== j.id),
                        )
                      }
                    />
                    <span>{other ?? j.id}</span>
                  </label>
                );
              })}
            </div>
          </FormField>
        )}
        <FormField label={t('datasets.metricBusinessDefinition')}>
          <input value={definition} onChange={(e) => setDefinition(e.target.value)} />
        </FormField>
      </Dialog>
    </>
  );
}
