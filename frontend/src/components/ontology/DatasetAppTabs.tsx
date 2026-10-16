import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './DatasetAppTabs.scss';

/**
 * Top-level tabs for the merged Datasets app, under one App Rail entry (`datasets`):
 * the **Catalog** (the tables), the **Semantic Model** (relationships, fields, quality) and
 * **Metrics** — the last read-only, because a metric is defined next to its model.
 */
export function DatasetAppTabs() {
  const { t } = useTranslation('ontology');
  const { pathname } = useLocation();
  const onSources = pathname.startsWith('/datasets/sources');
  const onCatalog =
    pathname.startsWith('/datasets') && !onSources && !pathname.startsWith('/datasets/model');
  const onModel = pathname.startsWith('/data-model');
  const onMetrics = pathname.startsWith('/data-metrics');

  return (
    <nav className="dataset-app-tabs" aria-label={t('datasets.title')}>
      <Link
        to="/datasets"
        className={`dataset-app-tab${onCatalog ? ' dataset-app-tab--active' : ''}`}
        aria-current={onCatalog ? 'page' : undefined}
      >
        {t('datasets.tabCatalog')}
      </Link>
      <Link
        to="/datasets/sources"
        className={`dataset-app-tab${onSources ? ' dataset-app-tab--active' : ''}`}
        aria-current={onSources ? 'page' : undefined}
      >
        {t('datasets.tabSources')}
      </Link>
      <Link
        to="/data-model"
        className={`dataset-app-tab${onModel ? ' dataset-app-tab--active' : ''}`}
        aria-current={onModel ? 'page' : undefined}
      >
        {t('datasets.tabModel')}
      </Link>
      <Link
        to="/data-metrics"
        className={`dataset-app-tab${onMetrics ? ' dataset-app-tab--active' : ''}`}
        aria-current={onMetrics ? 'page' : undefined}
      >
        {t('datasets.tabMetrics')}
      </Link>
    </nav>
  );
}
