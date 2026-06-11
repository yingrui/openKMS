import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, CircleAlert, Loader2, MinusCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchHealthStatus,
  type HealthComponent,
  type HealthStatusKind,
  type HealthStatusResponse,
  type ProcessInstanceHealth,
} from '../../data/healthStatusApi';
import './ConsoleHealth.scss';

function StatusIcon({ status }: { status: HealthStatusKind }) {
  if (status === 'ok') return <CheckCircle2 size={16} aria-hidden />;
  if (status === 'error') return <CircleAlert size={16} aria-hidden />;
  return <MinusCircle size={16} aria-hidden />;
}

function statusLabel(t: (key: string) => string, status: HealthStatusKind): string {
  return t(`health.status.${status}`);
}

function ProcessRow({ row }: { row: ProcessInstanceHealth }) {
  const { t } = useTranslation('console');
  return (
    <tr>
      <td>{row.instance_id}</td>
      <td>{t(`health.role.${row.role}`)}</td>
      <td>
        <span className={`console-health-status console-health-status--${row.status}`}>
          <StatusIcon status={row.status} />
          {statusLabel(t, row.status)}
        </span>
      </td>
      <td>
        {row.last_seen_at
          ? new Date(row.last_seen_at).toLocaleString()
          : t('health.colLastSeenEmpty')}
      </td>
      <td className="console-health-message">{row.message ?? '—'}</td>
    </tr>
  );
}

function ComponentRow({ row }: { row: HealthComponent }) {
  const { t } = useTranslation('console');
  const label = t(`health.componentLabels.${row.id}`, { defaultValue: row.label });
  return (
    <tr>
      <td>{label}</td>
      <td>
        <span className={`console-health-status console-health-status--${row.status}`}>
          <StatusIcon status={row.status} />
          {statusLabel(t, row.status)}
        </span>
      </td>
      <td>{row.latency_ms != null ? t('health.latencyMs', { ms: row.latency_ms }) : '—'}</td>
      <td className="console-health-message">{row.message ?? '—'}</td>
    </tr>
  );
}

export function ConsoleHealth() {
  const { t } = useTranslation('console');
  const [data, setData] = useState<HealthStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchHealthStatus();
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('health.toastLoadFailed'));
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const checkedLabel =
    data?.checked_at != null
      ? t('health.checkedAt', { time: new Date(data.checked_at).toLocaleString() })
      : null;

  return (
    <div className="console-health">
      <div className="page-header">
        <div className="page-header-main">
          <h1>{t('health.pageTitle')}</h1>
          <p className="page-subtitle">{t('health.subtitle')}</p>
          {data || checkedLabel ? (
            <div className="console-health-meta">
              {data ? (
                <span className={`console-health-overall console-health-overall--${data.overall}`}>
                  <Activity size={16} aria-hidden />
                  {t('health.overall', { status: statusLabel(t, data.overall) })}
                </span>
              ) : null}
              {checkedLabel ? <span className="console-health-checked">{checkedLabel}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-primary console-health-refresh"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
            aria-busy={refreshing}
          >
            {refreshing ? (
              <Loader2 size={18} className="console-health-refresh-spin" aria-hidden />
            ) : (
              <RefreshCw size={18} aria-hidden />
            )}
            <span>{refreshing ? t('health.refreshing') : t('health.refresh')}</span>
          </button>
        </div>
      </div>

      {loading && !data ? (
        <p className="console-health-empty-ds">{t('health.loading')}</p>
      ) : data ? (
        <>
          <section className="console-health-section" aria-labelledby="console-health-core-heading">
            <h2 id="console-health-core-heading">{t('health.coreHeading')}</h2>
            <table className="console-health-table">
              <thead>
                <tr>
                  <th>{t('health.colComponent')}</th>
                  <th>{t('health.colStatus')}</th>
                  <th>{t('health.colLatency')}</th>
                  <th>{t('health.colDetails')}</th>
                </tr>
              </thead>
              <tbody>
                {data.components.map((row) => (
                  <ComponentRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </section>

          <section className="console-health-section" aria-labelledby="console-health-processes-heading">
            <h2 id="console-health-processes-heading">{t('health.processesHeading')}</h2>
            {(data.process_instances ?? []).length === 0 ? (
              <p className="console-health-empty-ds">{t('health.processesEmpty')}</p>
            ) : (
              <>
                <p className="console-health-hint">
                  {t('health.workersOnline', {
                    count: (data.process_instances ?? []).filter((p) => p.role === 'worker' && p.status === 'ok').length,
                  })}
                </p>
                <table className="console-health-table">
                  <thead>
                    <tr>
                      <th>{t('health.colProcessName')}</th>
                      <th>{t('health.colProcessRole')}</th>
                      <th>{t('health.colStatus')}</th>
                      <th>{t('health.colLastSeen')}</th>
                      <th>{t('health.colDetails')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.process_instances ?? []).map((row) => (
                      <ProcessRow key={`${row.role}:${row.instance_id}`} row={row} />
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <section className="console-health-section" aria-labelledby="console-health-ds-heading">
            <h2 id="console-health-ds-heading">{t('health.dataSourcesHeading')}</h2>
            {data.data_sources.length === 0 ? (
              <p className="console-health-empty-ds">{t('health.dataSourcesEmpty')}</p>
            ) : (
              <table className="console-health-table">
                <thead>
                  <tr>
                    <th>{t('health.colName')}</th>
                    <th>{t('health.colKind')}</th>
                    <th>{t('health.colHost')}</th>
                    <th>{t('health.colStatus')}</th>
                    <th>{t('health.colLatency')}</th>
                    <th>{t('health.colDetails')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data_sources.map((ds) => (
                    <tr key={ds.id}>
                      <td>{ds.name}</td>
                      <td>{ds.kind}</td>
                      <td>
                        {ds.host}
                        {ds.port != null ? `:${ds.port}` : ''}
                      </td>
                      <td>
                        <span className={`console-health-status console-health-status--${ds.status}`}>
                          <StatusIcon status={ds.status} />
                          {statusLabel(t, ds.status)}
                        </span>
                      </td>
                      <td>{ds.latency_ms != null ? t('health.latencyMs', { ms: ds.latency_ms }) : '—'}</td>
                      <td className="console-health-message">{ds.message ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="console-health-hint">
              {t('health.dataSourcesHint')}{' '}
              <Link to="/console/data-sources">{t('health.dataSourcesLink')}</Link>
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
