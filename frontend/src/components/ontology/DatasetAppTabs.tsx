import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './DatasetAppTabs.scss';

/**
 * Top-level tabs for the **Catalog** app (`datasets` in the rail), one entry per question it answers:
 * **Datasets** (what we have), the **Semantic Model** (what it means), **Metrics** (the numbers), and **Quality
 * Issues** — the last two read-only where they are defined somewhere else.
 *
 * Registering from a data source is deliberately **not** a tab: it is something you do *to* the datasets
 * (add one), and it is reachable from there as an action.
 */
export function DatasetAppTabs() {
  const { t } = useTranslation('ontology');
  const { pathname } = useLocation();
  const onQuality = pathname.startsWith('/datasets/quality-issues');
  const onDatasets =
    pathname.startsWith('/datasets') &&
    !onQuality &&
    !pathname.startsWith('/datasets/model') &&
    !pathname.startsWith('/datasets/sources');
  const onModel = pathname.startsWith('/data-model');
  const onMetrics = pathname.startsWith('/data-metrics');

  return (
    <nav className="dataset-app-tabs" aria-label={t('datasets.title')}>
      <Link
        to="/datasets"
        className={`dataset-app-tab${onDatasets ? ' dataset-app-tab--active' : ''}`}
        aria-current={onDatasets ? 'page' : undefined}
      >
        {t('datasets.tabCatalog')}
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
      <Link
        to="/datasets/quality-issues"
        className={`dataset-app-tab${onQuality ? ' dataset-app-tab--active' : ''}`}
        aria-current={onQuality ? 'page' : undefined}
      >
        {t('datasets.tabQualityIssues')}
      </Link>
    </nav>
  );
}
