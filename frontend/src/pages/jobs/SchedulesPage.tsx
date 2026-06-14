import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, Loader2, Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '../../components/ErrorBanner';
import { JobsAreaNav } from '../../components/jobs/JobsAreaNav';
import { fetchSchedules, patchSchedule, runScheduleNow, scheduleKindLabel, type Schedule } from '../../data/schedulesApi';
import './Jobs.scss';

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    if (!silent) setError(null);
    try {
      const res = await fetchSchedules();
      setItems(res.items);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('schedules.loadFailed');
      if (silent) toast.error(msg);
      else setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

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
          disabled={refreshing}
        >
          {refreshing ? <Loader2 size={18} className="spin" aria-hidden /> : <RefreshCw size={18} aria-hidden />}
          <span>{refreshing ? t('shared.loading') : t('shared.refresh')}</span>
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <p className="jobs-empty">{t('schedules.loading')}</p>
      ) : items.length === 0 ? (
        <p className="jobs-empty">{t('schedules.empty')}</p>
      ) : (
        <div className="jobs-table-wrap">
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
                <th>{t('shared.actions')}</th>
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
                  <td>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="jobs-hint">
        <CalendarClock size={14} aria-hidden />
        {t('schedules.hint')}
      </p>
    </div>
  );
}
