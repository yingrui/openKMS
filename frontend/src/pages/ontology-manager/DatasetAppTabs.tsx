import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './dataset-app-tabs.scss';

/**
 * Top-level tabs for the merged Datasets app: Catalog (datasets) and Model (ER + quality).
 * Both live under the single App Rail entry (`datasets`).
 */
export function DatasetAppTabs() {
  const { t } = useTranslation('ontology');
  const { pathname } = useLocation();
  const onModel = pathname.startsWith('/data-model') || pathname.startsWith('/datasets/model');

  return (
    <nav className="dataset-app-tabs" aria-label={t('datasets.title')}>
      <Link
        to="/datasets"
        className={`dataset-app-tab${onModel ? '' : ' dataset-app-tab--active'}`}
        aria-current={onModel ? undefined : 'page'}
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
    </nav>
  );
}
