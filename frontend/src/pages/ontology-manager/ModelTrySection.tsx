import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchMetricRuns,
  fetchMetrics,
  type MetricResponse,
  type MetricRunResponse,
} from '../../data/metricsApi';
import {
  fetchModelFields,
  isTimeDimension,
  type SemanticModelFieldResponse,
} from '../../data/semanticModelFieldsApi';
import {
  previewSemanticModel,
  type SemanticModelPreviewResponse,
} from '../../data/semanticModelsApi';
import { EmptyState, FormField } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';
import { useSemanticModelDetail } from './SemanticModelDetailPage';

const GRANULARITIES = ['second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];

/** Model → Try: run a metric grouped by fields (ad-hoc, read-only, not saved). */
export function ModelTrySection() {
  const { t } = useTranslation('ontology');
  const { model } = useSemanticModelDetail();
  const modelId = model.id;

  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [fields, setFields] = useState<SemanticModelFieldResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [metricId, setMetricId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<SemanticModelPreviewResponse | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [granularity, setGranularity] = useState('day');
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<MetricRunResponse[]>([]);

  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchMetrics(modelId), fetchModelFields(modelId)])
      .then(([metricPage, fieldPage]) => {
        if (cancelled) return;
        setMetrics(metricPage.items);
        setFields(fieldPage.items);
        setMetricId(metricPage.items[0]?.id ?? '');
      })
      .catch(
        (e) => !cancelled && toast.error(e instanceof Error ? e.message : t('datasets.loadFailed')),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [modelId, t]);

  const metric = useMemo(() => metrics.find((m) => m.id === metricId), [metrics, metricId]);
  // Every field is a dimension; `is_time` marks time dimensions.
  const groupable = useMemo(
    () => fields.filter((f) => !metric || f.dataset_id === metric.base_dataset_id),
    [fields, metric],
  );
  // Time dimensions first — they are the fields the model actually calls dimensions.
  const timeDims = groupable.filter(isTimeDimension);
  const otherFields = groupable.filter((f) => !isTimeDimension(f));
  const hasTimeDim = selected.some((id) => {
    const f = fields.find((x) => x.id === id);
    return f ? isTimeDimension(f) : false;
  });

  useEffect(() => {
    setSelected([]);
    setResult(null);
    if (!metricId) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    void fetchMetricRuns(metricId)
      .then((r) => !cancelled && setRuns(r))
      .catch(() => !cancelled && setRuns([]));
    return () => {
      cancelled = true;
    };
  }, [metricId]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleRun = async () => {
    if (!metricId) return;
    setRunning(true);
    try {
      setResult(
        await previewSemanticModel(modelId, {
          metric_id: metricId,
          group_by: selected,
          granularity,
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.tryRunFailed'));
    } finally {
      setRunning(false);
      // The run is audited server-side; refresh the history shown below.
      void fetchMetricRuns(metricId)
        .then(setRuns)
        .catch(() => undefined);
    }
  };

  return (
    <>
      <EntityViewHeader title={t('dataModel.tryTitle')} subtitle={t('dataModel.tryHint')} />

      <EntityViewPanel>
        {loading ? (
          <p className="entity-view__readonly">{t('shared.loading')}</p>
        ) : metrics.length === 0 ? (
          <p className="entity-view__readonly">{t('dataModel.tryNoMetrics')}</p>
        ) : (
          <>
            <div className="model-try__controls">
              <FormField label={t('datasets.metricName')}>
                <select value={metricId} onChange={(e) => setMetricId(e.target.value)}>
                  {metrics.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="model-try__dims">
                <span className="model-try__dims-label">{t('dataModel.tryDimensions')}</span>
                {groupable.length === 0 ? (
                  <span className="page-subtitle">{t('dataModel.tryNoDimensions')}</span>
                ) : (
                  <>
                    {timeDims.map((f) => (
                      <label key={f.id} className="ds-check-row">
                        <input
                          type="checkbox"
                          checked={selected.includes(f.id)}
                          onChange={() => toggle(f.id)}
                        />
                        <span>
                          {f.name}
                          <em className="model-wizard__ds"> · {t('dataModel.dimensionTime')}</em>
                        </span>
                      </label>
                    ))}
                    {otherFields.length > 0 && (
                      <details className="model-try__more">
                        <summary>
                          {t('dataModel.tryOtherFields', { count: otherFields.length })}
                        </summary>
                        {otherFields.map((f) => (
                          <label key={f.id} className="ds-check-row">
                            <input
                              type="checkbox"
                              checked={selected.includes(f.id)}
                              onChange={() => toggle(f.id)}
                            />
                            <span>{f.name}</span>
                          </label>
                        ))}
                      </details>
                    )}
                  </>
                )}
              </div>
              {hasTimeDim && (
                <FormField label={t('dataModel.fieldGranularity')}>
                  <select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
                    {GRANULARITIES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleRun()}
                disabled={running}
              >
                {running ? (
                  <Loader2 size={16} className="console-loading-spinner" aria-hidden />
                ) : (
                  <Play size={16} aria-hidden />
                )}
                {t('dataModel.tryRun')}
              </button>
            </div>

            {result && (
              <>
                {result.rows.length === 0 ? (
                  <EmptyState title={t('dataModel.tryNoRows')} description={t('dataModel.tryHint')} />
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
                              <td key={c}>
                                {row[c] === null || row[c] === undefined
                                  ? t('datasets.dash')
                                  : String(row[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm model-try__sql-toggle"
                  onClick={() => setShowSql((v) => !v)}
                >
                  {t('dataModel.trySql')}
                </button>
                {showSql && <pre className="model-try__sql">{result.sql}</pre>}
              </>
            )}

            {runs.length > 0 && (
              <div className="data-model__runs">
                <h3>{t('dataModel.tryRuns')}</h3>
                <ul className="data-model__run-list">
                  {runs.map((r) => (
                    <li key={r.id}>
                      <span className={`data-model__run-status data-model__run-status--${r.status}`}>
                        {r.status}
                      </span>
                      {r.duration_ms}ms
                      {r.error ? ` · ${r.error}` : ` · ${r.row_count} ${t('datasets.rows')}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </EntityViewPanel>
    </>
  );
}
