import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchAuditEvents,
  fetchAuditFacets,
  type AuditEvent,
  type AuditFacetsResponse,
} from '../../data/auditApi';
import { EmptyState, Pagination, StatusChip } from '../../styles/design-system';
import { resourceLabel } from './auditFormat';
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
  // What the form holds, and what the query uses. Typing does not query: a path is a filter you finish
  // writing, and a request per keystroke is a request nobody asked for.
  const [draftMethod, setDraftMethod] = useState('');
  const [draftPath, setDraftPath] = useState('');
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
  }, [scope, path, method]);

  const time = (iso: string) => new Date(iso).toLocaleString();
  // Refresh re-runs the query; reset gives you a way out of it. Two different jobs — and the rail alone
  // cannot undo a method or a path, so reset has to exist.
  const filtered = scope.kind !== 'all' || method !== '' || path !== '';
  const dirty = draftMethod !== method || draftPath.trim() !== path;

  /** Apply the form: the rail is immediate (a click is a decision), the text field waits for this. */
  const query = () => {
    setMethod(draftMethod);
    setPath(draftPath.trim());
    setPage(0);
  };

  const reset = () => {
    setScope({ kind: 'all', value: '' });
    setDraftMethod('');
    setDraftPath('');
    setMethod('');
    setPath('');
    setPage(0);
  };
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
      title={label}
    >
      <span className="filter-rail__label">{label}</span>
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
    <div className="audit-log">
        <aside className="filter-rail" aria-label={t('auditLog.scopeAria')}>
          <div className="filter-rail__head">
            <h2 className="filter-rail__title">{t('auditLog.scope')}</h2>
            <span className="filter-rail__hint">{t('auditLog.window', { days: 30 })}</span>
          </div>
          <nav className="filter-rail__nav">
            <RailItem
              active={scope.kind === 'all'}
              label={t('auditLog.all')}
              count={allCount}
              onClick={() => setScope({ kind: 'all', value: '' })}
            />

            <div className="filter-rail__group">{t('auditLog.byResource')}</div>
            {facets.resource_types.map((facet) => (
              <RailItem
                key={facet.value}
                active={scope.kind === 'resource' && scope.value === facet.value}
                label={resourceLabel(facet.value)}
                count={facet.count}
                onClick={() => setScope({ kind: 'resource', value: facet.value })}
              />
            ))}

            <div className="filter-rail__group">{t('auditLog.byResult')}</div>
            {facets.statuses.map((facet) => (
              <RailItem
                key={facet.value}
                active={scope.kind === 'status' && scope.value === facet.value}
                label={t(`auditLog.status_${facet.value}`)}
                count={facet.count}
                onClick={() => setScope({ kind: 'status', value: facet.value })}
              />
            ))}
          </nav>
        </aside>

        <div className="app-page-pane audit-log__main">
          <header className="page-header">
            <div>
              <h1>{t('auditLog.title')}</h1>
              <p className="page-subtitle">{t('auditLog.subtitle')}</p>
            </div>
          </header>

          <div className="console-datasets-toolbar">
            <div className="console-datasets-search">
              <Search size={18} aria-hidden />
              {/* ds-control-exempt: `.console-datasets-search input` styles it (design-system/_console.scss) */}
              <input
                type="search"
                aria-label={t('auditLog.filterPath')}
                placeholder={t('auditLog.filterPathPlaceholder')}
                value={draftPath}
                onChange={(e) => setDraftPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') query();
                }}
              />
            </div>
            <label className="console-datasets-filter">
              {t('auditLog.filterMethod')}
              {/* ds-control-exempt: `.console-datasets-filter` styles this select (its own sheet) */}
              <select value={draftMethod} onChange={(e) => setDraftMethod(e.target.value)}>
                <option value="">{t('auditLog.filterAll')}</option>
                {['POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            {/* The form commits here — and nowhere else. Enter does the same, because a filter row that
                ignores Enter is a filter row people fight. */}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={query}
              disabled={loading || !dirty}
            >
              <Search size={16} aria-hidden />
              {t('auditLog.query')}
            </button>
            {filtered ? (
              <button type="button" className="btn-link" onClick={reset}>
                {t('auditLog.reset')}
              </button>
            ) : null}
          </div>

          {loading ? (
            <div className="console-loading">
              <Loader2 size={32} className="console-loading-spinner" aria-hidden />
              <p>{t('auditLog.loading')}</p>
            </div>
          ) : events.length === 0 ? (
            <EmptyState title={t('auditLog.empty')} description={t('auditLog.emptyHint')} />
          ) : (
            <>
              {/* A bounded grid: the table scrolls with its headers stuck, so the pager below stays put
                  instead of being pushed off the page by fifty rows. */}
              <div className="ds-table-wrap ds-table-wrap--scroll">
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
                        <td className="audit-log__when" title={event.at}>
                          {time(event.at)}
                        </td>
                        <td>{event.actor_name ?? event.actor_sub ?? t('auditLog.anonymous')}</td>
                        <td className="audit-log__code">
                          {event.method} {event.path}
                        </td>
                        <td className="audit-log__when">
                          <StatusChip tone={event.status_code < 300 ? 'ok' : 'warn'}>
                            {event.status_code}
                          </StatusChip>
                          {typeof event.detail?.error === 'string' ? (
                            <span className="page-subtitle"> {event.detail.error}</span>
                          ) : null}
                        </td>
                        <td>
                          {event.resource_type ? resourceLabel(event.resource_type) : t('datasets.dash')}
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
  );
}
