import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../../styles/design-system';
import {
  fetchOntologyActionTypes,
  type OntologyActionTypeResponse,
} from '../../data/ontologyFunctionsApi';
import '../ontology/ontology-admin.scss';

/**
 * Every Action that announces itself, in one list.
 *
 * The configuration belongs to an Action (its own tab), but "what reaches where, and did the last
 * delivery land?" is a deployment question — answering it by opening each Action one by one is how
 * a silent webhook failure stays silent.
 */
export function WebhooksPage() {
  const { t } = useTranslation('ontology');
  const [items, setItems] = useState<OntologyActionTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchOntologyActionTypes());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('actions.webhooksLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="ontology-admin">
      <header className="page-header">
        <div>
          <h1>{t('actions.webhooksTitle')}</h1>
          <p className="page-subtitle">{t('actions.webhooksSubtitle')}</p>
        </div>
      </header>

      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Webhook size={32} aria-hidden />} title={t('actions.webhooksEmpty')} />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('actions.apiName')}</th>
                  <th>{t('actions.objectType')}</th>
                  <th>{t('actions.webhookTarget')}</th>
                  <th>{t('actions.logWebhook')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((action) => {
                  const hasWebhook = Boolean(action.webhook_service_id && action.webhook_path);
                  const last = action.last_webhook;
                  return (
                    <tr key={action.id}>
                      <td>
                        <Link to={`/ontology-manager/action-types/${action.id}/webhook`}>
                          <strong>{action.display_name}</strong>
                        </Link>
                        <div className="external-services__name">{action.api_name}</div>
                      </td>
                      <td className="console-table-muted">{action.rule_type}</td>
                      <td>
                        {hasWebhook ? (
                          <code>
                            {action.webhook_method || 'POST'} {action.webhook_path}
                            <span className="external-services__name">
                              {' '}
                              → {action.webhook_service_name || t('actions.webhookServiceMissing')}
                            </span>
                          </code>
                        ) : (action.function_external_services?.length ?? 0) > 0 ? (
                          <span className="console-table-muted">
                            {t('actions.webhookViaFunctionShort', {
                              services: action.function_external_services?.join(', '),
                            })}
                          </span>
                        ) : (
                          <span className="console-table-muted">—</span>
                        )}
                      </td>
                      <td>
                        {!hasWebhook || !last ? (
                          <span className="console-table-muted">—</span>
                        ) : last.ok ? (
                          <span className="ds-status ds-status--ok">{last.status ?? 'ok'}</span>
                        ) : (
                          <span
                            className="ds-status ds-status--warn"
                            title={last.error ?? undefined}
                          >
                            {last.status ?? 'failed'}
                          </span>
                        )}
                        {last ? (
                          <div className="external-services__name">
                            {new Date(last.at).toLocaleString()}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
