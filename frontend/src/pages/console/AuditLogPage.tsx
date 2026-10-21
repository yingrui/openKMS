import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuditEvents, type AuditEvent } from '../../data/auditApi';
import { StatusChip } from '../../styles/design-system';

const PAGE = 50;
const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Every mutation, whoever made it — the page behind the user menu's "Audit log".
 *
 * It answers two questions at different distances: "what did I just change?" (filter by actor) and "who
 * changed this dataset?" (filter by resource type + id). Newest first, keyset paged, because the log only
 * grows.
 */
export function AuditLogPage() {
  const { t } = useTranslation('console');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [actor, setActor] = useState('');
  const [method, setMethod] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    try {
      const page = await fetchAuditEvents({
        actor_sub: actor.trim() || undefined,
        method: method || undefined,
        resource_type: resourceType.trim() || undefined,
        resource_id: resourceId.trim() || undefined,
        limit: PAGE,
      });
      setEvents(page.items);
      setHasMore(page.items.length === PAGE);
    } catch (e) {
      // 403 is the expected answer for someone without `console:permissions`; say so, do not shout.
      if (e instanceof Error && /403|permission|forbidden/i.test(e.message)) setDenied(true);
      else toast.error(e instanceof Error ? e.message : t('auditLog.loadFailed'));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [actor, method, resourceType, resourceId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    const last = events[events.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const next = await fetchAuditEvents({
        actor_sub: actor.trim() || undefined,
        method: method || undefined,
        resource_type: resourceType.trim() || undefined,
        resource_id: resourceId.trim() || undefined,
        limit: PAGE,
        before: last.at,
      });
      setEvents((prev) => [...prev, ...next.items]);
      setHasMore(next.items.length === PAGE);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('auditLog.loadFailed'));
    } finally {
      setLoadingMore(false);
    }
  };

  const time = (iso: string) => new Date(iso).toLocaleString();

  return (
    <div className="app-page-pane">
      <header className="page-header">
        <div>
          <h1>{t('auditLog.title')}</h1>
          <p className="page-subtitle">{t('auditLog.subtitle')}</p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} aria-hidden />
            {t('auditLog.refresh')}
          </button>
        </div>
      </header>

      {denied ? (
        <p className="page-subtitle">{t('auditLog.noAccess')}</p>
      ) : (
        <>
          <div className="console-datasets-toolbar">
            <input
              className="ds-control"
              aria-label={t('auditLog.filterActor')}
              placeholder={t('auditLog.filterActorPlaceholder')}
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            />
            <label className="console-datasets-filter">
              {t('auditLog.filterMethod')}
              {/* ds-control-exempt: `.console-datasets-filter` styles this select (its own sheet) */}
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">{t('auditLog.filterAll')}</option>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <input
              className="ds-control"
              aria-label={t('auditLog.filterResourceType')}
              placeholder={t('auditLog.filterResourceTypePlaceholder')}
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
            />
            <input
              className="ds-control"
              aria-label={t('auditLog.filterResourceId')}
              placeholder={t('auditLog.filterResourceIdPlaceholder')}
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="console-loading">
              <Loader2 size={32} className="console-loading-spinner" aria-hidden />
              <p>{t('auditLog.loading')}</p>
            </div>
          ) : events.length === 0 ? (
            <p className="page-subtitle">{t('auditLog.empty')}</p>
          ) : (
            <>
              <div className="ds-table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>{t('auditLog.when')}</th>
                      <th>{t('auditLog.actor')}</th>
                      <th>{t('auditLog.request')}</th>
                      <th>{t('auditLog.result')}</th>
                      <th>{t('auditLog.resource')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td title={event.at}>{time(event.at)}</td>
                        <td>{event.actor_name ?? event.actor_sub ?? t('auditLog.anonymous')}</td>
                        <td>
                          <code>
                            {event.method} {event.path}
                          </code>
                        </td>
                        <td>
                          <StatusChip tone={event.status_code < 300 ? 'ok' : 'warn'}>
                            {event.status_code}
                          </StatusChip>
                          {typeof event.detail?.error === 'string' ? (
                            <span className="page-subtitle"> {event.detail.error}</span>
                          ) : null}
                        </td>
                        <td>
                          {event.resource_type ?? t('datasets.dash')}
                          {event.resource_id ? (
                            <span className="page-subtitle"> · {event.resource_id}</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasMore ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? t('auditLog.loading') : t('auditLog.loadMore')}
                </button>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
