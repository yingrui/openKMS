import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, Loader2, Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '../../components/ErrorBanner';
import { JobsAreaNav } from '../../components/jobs/JobsAreaNav';
import { fetchSchedules, patchSchedule, runScheduleNow, scheduleKindLabel, type Schedule } from '../../data/schedulesApi';
import { Pagination } from '../../styles/design-system';
import './Jobs.scss';

const SCHEDULES_PAGE_SIZE_DEFAULT = 25;

function formatDate(iso: string | null | undefined, dash: string): string {
  if (!iso) return dash;
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SchedulesPage() {
  const { t } = useTranslation('workspace');
  const navigate = useNavigate();
  const dash = t('shared.dash');
  const [items, setItems] = useState<Schedule[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(SCHEDULES_PAGE_SIZE_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      if (!silent) setError(null);
      try {
        const res = await fetchSchedules({
          limit: pageSize,
          offset: page * pageSize,
        });
        setItems(res.items);
        setTotal(res.total);
        if (res.total > 0 && page > 0 && res.items.length === 0) {
          setPage(Math.max(0, Math.ceil(res.total / pageSize) - 1));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : t('schedules.loadFailed');
        if (silent) toast.error(msg);
        else setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, pageSize, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEnabled = async (row: Schedule) => {
    setBusyId(row.id);
    try {
      const updated = await patchSchedule(row.id, { enabled: !row.enabled });
      setItems((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedules.updateFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async (row: Schedule) => {
    setBusyId(row.id);
    try {
      const { job_id } = await runScheduleNow(row.id);
      toast.success(t('schedules.runQueued', { id: job_id }));
      navigate(`/job-runs/${job_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedules.runFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="jobs-page">
      <JobsAreaNav />
      <div className="page-header jobs-header">
        <div>
          <h1>{t('schedules.title')}</h1>
          <p className="page-subtitle">{t('schedules.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void load(true)}
          disabled={refreshing || loading}
        >
          {refreshing ? <Loader2 size={18} className="spin" aria-hidden /> : <RefreshCw size={18} aria-hidden />}
          <span>{refreshing ? t('shared.loading') : t('shared.refresh')}</span>
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="jobs-table-wrap">
        {loading ? (
          <div className="jobs-loading">
            <Loader2 size={32} className="jobs-loading-spinner" />
            <p>{t('schedules.loading')}</p>
          </div>
        ) : total === 0 ? (
          <p className="jobs-empty">{t('schedules.empty')}</p>
        ) : (
          <>
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>{t('schedules.colName')}</th>
                  <th>{t('schedules.colKind')}</th>
                  <th>{t('schedules.colCron')}</th>
                  <th>{t('schedules.colEnabled')}</th>
                  <th>{t('schedules.colNextRun')}</th>
                  <th>{t('schedules.colLastRun')}</th>
                  <th>{t('schedules.colStatus')}</th>
                  <th className="jobs-table-actions-col jobs-table-actions-col--inline">{t('shared.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.connector_id ? (
                        <Link to={`/connectors/${row.connector_id}`}>{row.display_name}</Link>
                      ) : row.project_id ? (
                        <Link to={`/projects/${row.project_id}/settings`}>{row.display_name}</Link>
                      ) : (
                        row.display_name
                      )}
                    </td>
                    <td>{scheduleKindLabel(row.kind, t)}</td>
                    <td>
                      <span className="jobs-mono">{row.cron ?? dash}</span>
                      {row.timezone ? (
                        <span className="jobs-muted"> ({row.timezone})</span>
                      ) : null}
                    </td>
                    <td>
                      <label className="jobs-checkbox-label">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          disabled={busyId === row.id}
                          onChange={() => void toggleEnabled(row)}
                        />
                        <span>{row.enabled ? t('shared.yes') : t('shared.no')}</span>
                      </label>
                    </td>
                    <td>{formatDate(row.next_run_at, dash)}</td>
                    <td>{formatDate(row.last_run_at, dash)}</td>
                    <td>{row.last_status ?? dash}</td>
                    <td className="jobs-table-actions-col jobs-table-actions-col--inline">
                      <div className="jobs-table-actions-inline">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busyId === row.id}
                          onClick={() => void runNow(row)}
                        >
                          <Play size={14} aria-hidden />
                          {t('schedules.runNow')}
                        </button>
                        {row.last_job_id != null ? (
                          <Link to={`/job-runs/${row.last_job_id}`} className="jobs-link-inline">
                            #{row.last_job_id}
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              total={total}
              page={page}
              pageSize={pageSize}
              loading={loading || refreshing}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(0);
              }}
            />
          </>
        )}
      </div>

      <p className="jobs-hint">
        <CalendarClock size={14} aria-hidden />
        {t('schedules.hint')}
      </p>
    </div>
  );
}
