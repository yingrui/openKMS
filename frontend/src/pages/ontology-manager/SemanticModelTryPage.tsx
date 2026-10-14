import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { fetchMetrics, type MetricResponse } from '../../data/metricsApi';
import {
  fetchModelFields,
  type SemanticModelFieldResponse,
} from '../../data/semanticModelFieldsApi';
import {
  fetchSemanticModel,
  previewSemanticModel,
  type SemanticModelPreviewResponse,
} from '../../data/semanticModelsApi';
import { EmptyState, FormField } from '../../styles/design-system';
import '../ontology/ontology-admin.scss';

const GRANULARITIES = ['second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];

/** Model → Try: run a metric grouped by fields (ad-hoc, read-only, not saved). */
export function SemanticModelTryPage() {
  const { t } = useTranslation('ontology');
  const { modelId = '' } = useParams();

  const [modelName, setModelName] = useState('');
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [fields, setFields] = useState<SemanticModelFieldResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [metricId, setMetricId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<SemanticModelPreviewResponse | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [granularity, setGranularity] = useState('day');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchSemanticModel(modelId),
      fetchMetrics(modelId),
      fetchModelFields(modelId),
    ])
      .then(([m, metricPage, fieldPage]) => {
        if (cancelled) return;
        setModelName(m.name);
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
  const dimensions = useMemo(
    () => fields.filter((f) => !metric || f.dataset_id === metric.base_dataset_id),
    [fields, metric],
  );
  const hasTimeDim = selected.some((id) => fields.find((f) => f.id === id)?.dimension?.is_time);

  useEffect(() => {
    setSelected([]);
    setResult(null);
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
    }
  };

  return (
    <div className="ontology-admin">
      <div className="page-header model-page-header">
        <div>
          <Link to={`/data-model/${modelId}`} className="model-back">
            <ChevronLeft size={14} aria-hidden />
            {t('dataModel.tryBack')}
          </Link>
          <h1>{t('dataModel.tryTitle')}</h1>
          <p className="page-subtitle">
            {modelName ? `${modelName} · ` : ''}
            {t('dataModel.tryHint')}
          </p>
        </div>
      </div>

      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={28} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
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
                {dimensions.length === 0 ? (
                  <span className="page-subtitle">{t('dataModel.tryNoDimensions')}</span>
                ) : (
                  dimensions.map((f) => (
                    <label key={f.id} className="ds-check-row">
                      <input
                        type="checkbox"
                        checked={selected.includes(f.id)}
                        onChange={() => toggle(f.id)}
                      />
                      <span>
                        {f.name}
                        {f.dimension?.is_time ? (
                          <em className="model-wizard__ds"> · {t('dataModel.dimensionTime')}</em>
                        ) : null}
                      </span>
                    </label>
                  ))
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
          </>
        )}
      </div>
    </div>
  );
}
