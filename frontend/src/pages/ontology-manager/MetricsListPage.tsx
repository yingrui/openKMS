import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { fetchMetrics, metricExpressionSql, type MetricResponse } from '../../data/metricsApi';
import { fetchSemanticModels, type SemanticModelResponse } from '../../data/semanticModelsApi';
import { EmptyState } from '../../styles/design-system';
import '../ontology/ontology-admin.scss';

/**
 * Every metric, and the model it belongs to — **read-only on purpose**.
 *
 * A metric is authored where it belongs (its model's page, next to its fields and its base dataset),
 * so this page answers "what metrics do we have, and who defines them?" and hands you off to the model
 * to change one. Two buttons here would be a second place to get a definition wrong.
 */
export function MetricsListPage() {
  const { t } = useTranslation('ontology');
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [models, setModels] = useState<SemanticModelResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchMetrics(), fetchSemanticModels()])
      .then(([metricPage, modelPage]) => {
        if (cancelled) return;
        setMetrics(metricPage.items);
        setModels(modelPage.items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const needle = search.trim().toLowerCase();
  const shown = useMemo(() => {
    // The lookup is inlined rather than closing over a helper, so the dependencies tell the truth.
    const name = (id: string) => models.find((m) => m.id === id)?.name ?? '';
    return metrics.filter(
      (m) =>
        !needle ||
        [m.name, m.business_definition ?? '', name(m.semantic_model_id)]
          .join(' ')
          .toLowerCase()
          .includes(needle),
    );
  }, [metrics, models, needle]);
  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? t('datasets.dash');

  return (
    <div className="ontology-admin">
      <header className="page-header">
        <div>
          <h1>{t('datasets.metrics')}</h1>
          <p className="page-subtitle">{t('dataModel.metricsSubtitle')}</p>
        </div>
      </header>
      <div className="ontology-admin-content">
        <div className="console-datasets-toolbar">
          <label className="console-datasets-search">
            <Search size={18} aria-hidden />
            {/* ds-control-exempt: `.console-datasets-search` styles this input (its own sheet) */}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('dataModel.metricsSearchPlaceholder')}
              aria-label={t('dataModel.metricsSearchPlaceholder')}
            />
          </label>
        </div>

        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : shown.length === 0 ? (
          <EmptyState title={t('dataModel.metricsEmpty')} description={t('dataModel.metricsEmptyHint')} />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('datasets.metricName')}</th>
                  <th>{t('dataModel.metricModel')}</th>
                  <th>{t('datasets.metricType')}</th>
                  <th>{t('datasets.metricDatatype')}</th>
                  <th>{t('datasets.metricBaseDataset')}</th>
                  <th>{t('dataModel.playgroundExpression')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((metric) => (
                  <tr key={metric.id}>
                    <td>
                      <Link to={`/data-model/${metric.semantic_model_id}`} className="console-table-link">
                        {metric.name}
                      </Link>
                      {metric.business_definition ? (
                        <p className="page-subtitle">{metric.business_definition}</p>
                      ) : null}
                    </td>
                    <td>
                      {/* Editing a metric happens in its model — this page never edits one. */}
                      <Link to={`/data-model/${metric.semantic_model_id}`}>
                        {modelName(metric.semantic_model_id)}
                      </Link>
                    </td>
                    <td>{metric.type}</td>
                    <td>{metric.datatype ?? t('datasets.dash')}</td>
                    <td>{metric.base_dataset_name ?? t('datasets.dash')}</td>
                    <td>
                      <code>{metricExpressionSql(metric)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
