import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2, Plus } from 'lucide-react';
import { useOntologyFunctionsList } from '../function-editor/useOntologyFunctionsList';
import '../ontology/ontology-admin.scss';

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'active' || normalized === 'published') {
    return 'ontology-status-badge ontology-status-badge--active';
  }
  return 'ontology-status-badge';
}

export function FunctionsListPage() {
  const { t } = useTranslation('ontology');
  const { items, loading } = useOntologyFunctionsList();

  return (
    <div className="ontology-admin">
      <header className="page-header">
        <div>
          <h1>{t('functions.title')}</h1>
          <p className="page-subtitle">{t('functions.subtitle')}</p>
        </div>
        <Link to="/function-editor/new" className="btn btn-primary">
          <Plus size={16} aria-hidden />
          {t('functions.createInEditor')}
        </Link>
      </header>

      <div className="ontology-admin-content">
        <div className="ds-table-wrap">
          {loading ? (
            <div className="console-loading">
              <Loader2 size={32} className="console-loading-spinner" aria-hidden />
              <p>{t('shared.loading')}</p>
            </div>
          ) : (
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('functions.apiName')}</th>
                  <th>{t('functions.displayName')}</th>
                  <th>{t('functions.publishedVersion')}</th>
                  <th>{t('functions.latestVersion')}</th>
                  <th>{t('functions.status')}</th>
                  <th className="console-table-actions">{t('shared.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="console-table-empty">
                      {t('functions.emptyList')}{' '}
                      <Link to="/function-editor/new">{t('functions.createInEditor')}</Link>
                    </td>
                  </tr>
                ) : (
                  items.map((fn) => (
                    <tr key={fn.id}>
                      <td>
                        <Link to={`/ontology-manager/functions/${fn.id}`} className="ontology-manager-list__api-link">
                          {fn.api_name}
                        </Link>
                      </td>
                      <td>{fn.display_name}</td>
                      <td className="console-table-muted">{fn.published_version ?? '—'}</td>
                      <td className="console-table-muted">{fn.latest_version ?? '—'}</td>
                      <td>
                        <span className={statusBadgeClass(fn.status)}>{fn.status}</span>
                      </td>
                      <td className="console-table-actions">
                        <div className="console-table-btns">
                          <Link
                            to={`/function-editor/${fn.id}`}
                            className="console-table-icon-link"
                            title={t('functions.openInEditor')}
                            aria-label={t('functions.openInEditor')}
                          >
                            <ExternalLink size={16} aria-hidden />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
