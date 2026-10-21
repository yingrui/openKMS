import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchAuditEvents,
  fetchAuditFacets,
  type AuditEvent,
  type AuditFacetsResponse,
} from '../../data/auditApi';
import { Pagination, StatusChip } from '../../styles/design-system';
import './AuditLogPage.scss';

const EMPTY_FACETS: AuditFacetsResponse = {
  resource_types: [],
  statuses: [],
  actors: [],
  since: new Date().toISOString(),
};

interface Scope {
  /** A resource type (`datasets`), a status group (`error`), or an actor's sub. */
  kind: 'all' | 'resource' | 'status' | 'actor';
  value: string;
}

/**
 * Every mutation, whoever made it — reached from the user menu.
 *
 * The rail answers **where**: which part of the system, how it turned out, who did it — each with a count,
 * so the shape of the log is visible before you filter it. The right side is the record itself. A list of
 * free-text boxes would make the reader guess what exists; counts make the rail a map.
 */
export function AuditLogPage() {
  const { t } = useTranslation('console');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [facets, setFacets] = useState<AuditFacetsResponse>(EMPTY_FACETS);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [scope, setScope] = useState<Scope>({ kind: 'all', value: '' });
  const [method, setMethod] = useState('');
  const [path, setPath] = useState('');
  const [denied, setDenied] = useState(false);

  const filters = {
    resource_type: scope.kind === 'resource' ? scope.value : undefined,
    status: scope.kind === 'status' ? scope.value : undefined,
    actor_sub: scope.kind === 'actor' ? scope.value : undefined,
    method: method || undefined,
    path: path.trim() || undefined,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    try {
      const [result, counts] = await Promise.all([
        fetchAuditEvents({ ...filters, limit: pageSize, offset: page * pageSize }),
        fetchAuditFacets(),
      ]);
      setEvents(result.items);
      setTotal(result.total);
      setFacets(counts);
    } catch (e) {
      // 403 is the expected answer for someone without `console:permissions`; say so, do not shout.
      if (e instanceof Error && /403|permission|forbidden/i.test(e.message)) setDenied(true);
      else toast.error(e instanceof Error ? e.message : t('auditLog.loadFailed'));
      setEvents([]);
    } finally {
      setLoading(false);
    }
    // `filters` is derived from the state above, so those are the dependencies.
  }, [scope, method, path, page, pageSize, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [scope, method, path]);

  const time = (iso: string) => new Date(iso).toLocaleString();
  const allCount = facets.resource_types.reduce((sum, f) => sum + f.count, 0);

  const RailItem = ({
    active,
    label,
    count,
    onClick,
  }: {
    active: boolean;
    label: string;
    count: number;
    onClick: () => void;
  }) => (
    <button
      type="button"
      className={`filter-rail__link${active ? ' filter-rail__link--active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="filter-rail__count">{count}</span>
    </button>
  );

  if (denied) {
    return (
      <div className="app-page-pane">
        <header className="page-header">
          <div>
            <h1>{t('auditLog.title')}</h1>
            <p className="page-subtitle">{t('auditLog.subtitle')}</p>
          </div>
        </header>
        <p className="page-subtitle">{t('auditLog.noAccess')}</p>
      </div>
    );
  }

  return (
    <div className="app-page-pane">
      <div className="audit-log">
        <aside className="filter-rail" aria-label={t('auditLog.scopeAria')}>
          <div className="filter-rail__title">{t('auditLog.scope')}</div>

          {/* One nav per group: the rail's rhythm is a list of lists, exactly as the Ontology Manager's. */}
          <div className="filter-rail__nav">
            <RailItem
              active={scope.kind === 'all'}
              label={t('auditLog.all')}
              count={allCount}
              onClick={() => setScope({ kind: 'all', value: '' })}
            />
          </div>

          <div className="filter-rail__nav">
            <span className="filter-rail__title">{t('auditLog.byResource')}</span>
            {facets.resource_types.map((facet) => (
              <RailItem
                key={facet.value}
                active={scope.kind === 'resource' && scope.value === facet.value}
                label={facet.value}
                count={facet.count}
                onClick={() => setScope({ kind: 'resource', value: facet.value })}
              />
            ))}
          </div>

          <div className="filter-rail__nav">
            <span className="filter-rail__title">{t('auditLog.byResult')}</span>
            {facets.statuses.map((facet) => (
              <RailItem
                key={facet.value}
                active={scope.kind === 'status' && scope.value === facet.value}
                label={t(`auditLog.status_${facet.value}`)}
                count={facet.count}
                onClick={() => setScope({ kind: 'status', value: facet.value })}
              />
            ))}
          </div>

          <p className="page-subtitle">{t('auditLog.window', { days: 30 })}</p>
        </aside>

        <div className="audit-log__main">
          <header className="page-header">
            <div>
              <h1>{t('auditLog.title')}</h1>
              <p className="page-subtitle">{t('auditLog.subtitle')}</p>
            </div>
            <div className="page-header-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw size={16} aria-hidden />
                {t('auditLog.refresh')}
              </button>
            </div>
          </header>

          <div className="console-datasets-toolbar">
            <label className="console-datasets-filter">
              {t('auditLog.filterMethod')}
              {/* ds-control-exempt: `.console-datasets-filter` styles this select (its own sheet) */}
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">{t('auditLog.filterAll')}</option>
                {['POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <input
              className="ds-control"
              aria-label={t('auditLog.filterPath')}
              placeholder={t('auditLog.filterPathPlaceholder')}
              value={path}
              onChange={(e) => setPath(e.target.value)}
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
                        <td className="audit-log__code">
                          {event.method} {event.path}
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
              <Pagination
                total={total}
                page={page}
                pageSize={pageSize}
                loading={loading}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(0);
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
