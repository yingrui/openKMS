import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil } from 'lucide-react';
import { useOntologyFunctionsList } from './useOntologyFunctionsList';
import '../ontology/ontology-admin.scss';
import './function-editor.scss';

export function FunctionEditorListPage() {
  const { t } = useTranslation('ontology');
  const { items, loading } = useOntologyFunctionsList();

  return (
    <div className="ontology-admin function-editor-list">
      <header className="page-header">
        <div>
          <h1>{t('editor.title')}</h1>
          <p className="page-subtitle">{t('editor.subtitle')}</p>
        </div>
        <Link to="/function-editor/new" className="btn btn-primary">
          {t('editor.create')}
        </Link>
      </header>

      <div className="ontology-admin-content">
        <div className="ontology-admin-table-wrap">
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
                  <th>{t('functions.latestVersion')}</th>
                  <th>{t('functions.publishedVersion')}</th>
                  <th className="console-table-actions">{t('shared.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="console-table-empty">
                      {t('editor.emptyList')}{' '}
                      <Link to="/function-editor/new">{t('editor.create')}</Link>
                    </td>
                  </tr>
                ) : (
                  items.map((fn) => (
                    <tr key={fn.id}>
                      <td>
                        <Link to={`/function-editor/${fn.id}`} className="function-editor-list__api-link">
                          {fn.api_name}
                        </Link>
                      </td>
                      <td>{fn.display_name}</td>
                      <td className="console-table-muted">{fn.latest_version ?? '—'}</td>
                      <td className="console-table-muted">{fn.published_version ?? '—'}</td>
                      <td className="console-table-actions">
                        <div className="console-table-btns">
                          <Link
                            to={`/function-editor/${fn.id}`}
                            className="console-table-icon-link"
                            aria-label={t('editor.editFunction', { name: fn.display_name || fn.api_name })}
                          >
                            <Pencil size={16} aria-hidden />
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
