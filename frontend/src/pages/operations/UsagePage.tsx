import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { relativeTime } from '../../components/agents/agentsFilesUtils';
import {
  fetchWorkforceUsage,
  type WorkforceAgentUsage,
} from '../../data/workforceApi';
import { StatusChip } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../shared/EntityViewShell';
import './operations.scss';

/**
 * Operations › Usage: is anything actually using this, and is it answering.
 *
 * Counted from the audit trail rather than from a second call log — every `POST …/ask` is already there. The window is
 * a week because an all-time total makes a service that stopped in March look healthy forever; votes are all-time
 * because feedback arrives slowly and a week of it is usually zero.
 *
 * Read-only on purpose: pausing and deleting change whether a service answers, so they live on that agent's Service tab,
 * where the subject of the action is on screen.
 */
export function UsagePage() {
  const { t } = useTranslation('operations');
  const [items, setItems] = useState<WorkforceAgentUsage[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWorkforceUsage();
      setItems(data.items);
      setDays(data.activity_window_days);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('usage.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalCalls = items.reduce((sum, row) => sum + row.calls_7d, 0);
  const totalErrors = items.reduce((sum, row) => sum + row.errors_7d, 0);

  return (
    <>
      <EntityViewHeader
        title={t('usage.title')}
        subtitle={t('usage.lead')}
        actions={
          <span className="page-subtitle">
            {t('usage.summary', { count: totalCalls, errors: totalErrors, days })}
          </span>
        }
      />
      {loading ? <p className="ds-resource-list-loading">{t('loading')}</p> : null}

      {!loading && items.length === 0 ? (
        <p className="ops-empty">{t('usage.empty')}</p>
      ) : null}

      {!loading && items.length > 0 ? (
        <EntityViewPanel>
        <div className="ds-resource-table-wrap">
          <table className="ds-resource-table">
            <thead>
              <tr>
                <th>{t('usage.name')}</th>
                <th>{t('usage.status')}</th>
                <th>{t('usage.activity', { days })}</th>
                <th>{t('usage.votes')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.agent_id}>
                  <td>
                    <Link to={`/workforce/${row.agent_id}`} className="ds-resource-table__link">
                      {row.agent_name || row.agent_id}
                    </Link>
                  </td>
                  <td>
                    <StatusChip tone={row.status === 'paused' ? 'warn' : 'ok'}>
                      {t(`status.${row.status}`)}
                    </StatusChip>
                  </td>
                  <td>
                    <div className="ops-activity">
                      <span>
                        {t('usage.calls', { count: row.calls_7d })}
                        {row.errors_7d > 0 ? (
                          <span className="ops-activity__errors">
                            {t('usage.failed', { count: row.errors_7d })}
                          </span>
                        ) : null}
                      </span>
                      <span className="ops-activity__when">
                        {row.last_call_at
                          ? t('usage.lastCall', { when: relativeTime(row.last_call_at) })
                          : t('usage.neverCalled')}
                      </span>
                    </div>
                  </td>
                  <td className="ops-votes">
                    {t('usage.voteCounts', { up: row.upvotes, down: row.downvotes })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </EntityViewPanel>
      ) : null}
    </>
  );
}
