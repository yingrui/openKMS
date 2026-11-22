import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useParams } from 'react-router-dom';
import { MessageSquare, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchWorkforceAgent,
  pauseWorkforceAgent,
  resumeWorkforceAgent,
  type WorkforceAgentDetail,
} from '../../data/workforceApi';
import { StatusChip } from '../../styles/design-system';
import { EntityViewLoading, EntityViewShell } from '../shared/EntityViewShell';
import { WORKFORCE_TABS } from './detail/tabs';
import { WorkforceDetailCtx } from './detail/workforceDetailContext';
import './detail/workforceDetail.scss';

/**
 * One workforce agent — the same shell the Catalog's model and rule pages use: identity and nav in the
 * sidebar, each section rendering in the outlet.
 *
 * The tabs follow the order a reader builds it: who it is, how it answers, what it knows, what it may look
 * up, who may call it, and the request they send. Everything here is the *service's* half; retrieval depth
 * is the knowledge source's and is edited on the knowledge base.
 */
export function WorkforceDetail() {
  const { t } = useTranslation('workforce');
  const { agentId = '' } = useParams();
  const [agent, setAgent] = useState<WorkforceAgentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * `silent` re-reads without entering the loading state: a tab calls this after a change, and flipping
   * `loading` would unmount the very tab that asked.
   */
  const load = useCallback(
    async (silent = false) => {
      if (!agentId) return;
      if (!silent) setLoading(true);
      try {
        setAgent(await fetchWorkforceAgent(agentId));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('loadFailed'));
        setAgent(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [agentId, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <EntityViewLoading label={t('loading')} />;
  if (!agent) return <p className="entity-view__readonly">{t('loadFailed')}</p>;

  const base = `/workforce/${agent.id}`;
  return (
    // `load` alone flips `loading` and unmounts the tab that asked to refresh, resetting every open row and typed
    // field; the context promises the silent variant.
    <WorkforceDetailCtx.Provider value={{ agent, reload: () => load(true) }}>
      <EntityViewShell
        backTo="/workforce"
        backLabel={t('backToList')}
        title={agent.name}
        meta={t('metaKbs', { count: agent.knowledge_base_count })}
        identityAction={
          <>
            <StatusChip tone={agent.status === 'paused' ? 'warn' : 'ok'}>
              {t(`status_${agent.status}`)}
            </StatusChip>
            {agent.status === 'paused' ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  void resumeWorkforceAgent(agent.id).then(() => {
                    toast.success(t('resumed'));
                    void load(true);
                  })
                }
              >
                <Play size={15} aria-hidden />
                {t('resumeAgent')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  void pauseWorkforceAgent(agent.id).then(() => {
                    toast.success(t('paused'));
                    void load(true);
                  })
                }
              >
                <Pause size={15} aria-hidden />
                {t('pauseAgent')}
              </button>
            )}
            {agent.knowledge_base_count > 0 ? (
              <Link className="btn btn-secondary btn-sm" to={`${base}/chat`}>
                <MessageSquare size={15} aria-hidden />
                {t('chatOpen')}
              </Link>
            ) : null}
          </>
        }
        navItems={WORKFORCE_TABS.map(({ segment, labelKey }, i) => ({
          to: segment ? `${base}/${segment}` : base,
          label: t(labelKey),
          end: i === 0,
        }))}
      >
        <Outlet />
      </EntityViewShell>
    </WorkforceDetailCtx.Provider>
  );
}
