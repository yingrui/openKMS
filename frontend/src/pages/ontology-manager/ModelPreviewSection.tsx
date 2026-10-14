import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { fetchMetrics, type MetricResponse } from '../../data/metricsApi';
import { fetchModelFields, type SemanticModelFieldResponse } from '../../data/semanticModelFieldsApi';
import {
  previewSemanticModel,
  type SemanticModelPreviewResponse,
} from '../../data/semanticModelsApi';
import { EmptyState, FormField } from '../../styles/design-system';

/** Model → Try: run a metric grouped by dimensions (ad-hoc, read-only, not saved). */
export function ModelPreviewSection({ semanticModelId }: { semanticModelId: string }) {
  const { t } = useTranslation('ontology');

  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [fields, setFields] = useState<SemanticModelFieldResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [metricId, setMetricId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<SemanticModelPreviewResponse | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchMetrics(semanticModelId), fetchModelFields(semanticModelId)])
      .then(([m, f]) => {
        if (cancelled) return;
        setMetrics(m.items);
        setFields(f.items);
        setMetricId(m.items[0]?.id ?? '');
      })
      .catch((e) => !cancelled && toast.error(e instanceof Error ? e.message : t('datasets.loadFailed')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [semanticModelId, t]);

  const metric = useMemo(() => metrics.find((m) => m.id === metricId), [metrics, metricId]);
  const dimensions = useMemo(
    () =>
      fields.filter(
        (f) => f.dimension?.type && (!metric || f.dataset_id === metric.base_dataset_id),
      ),
    [fields, metric],
  );

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
      setResult(await previewSemanticModel(semanticModelId, { metric_id: metricId, group_by: selected }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.tryRunFailed'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section>
      <div className="dataset-columns__toolbar">
        <h2>{t('dataModel.tryTitle')}</h2>
      </div>

      {loading ? (
        <div className="console-loading">
          <Loader2 size={24} className="console-loading-spinner" aria-hidden />
          <p>{t('shared.loading')}</p>
        </div>
      ) : metrics.length === 0 ? (
        <p className="entity-view__readonly">{t('dataModel.tryNoMetrics')}</p>
      ) : (
        <>
          <p className="page-subtitle">{t('dataModel.tryHint')}</p>
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
                      {f.dimension?.type === 'time' ? (
                        <em className="model-wizard__ds">
                          {' '}
                          {f.dimension.granularity ?? 'day'}
                        </em>
                      ) : null}
                    </span>
                  </label>
                ))
              )}
            </div>
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
    </section>
  );
}
