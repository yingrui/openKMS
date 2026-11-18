import { createContext, useContext } from 'react';
import type { WorkforceAgentDetail } from '../../../data/workforceApi';

/**
 * What every tab of one workforce agent shares: the agent itself and a way to re-read it.
 *
 * The shell loads it once; a tab that changes something (a binding, a credential, a behaviour field)
 * calls `reload()` and the sidebar's counts follow. `reload` is silent on purpose — a tab must not
 * unmount itself by asking the page to refresh.
 */
export type WorkforceDetailContext = {
  agent: WorkforceAgentDetail;
  reload: () => Promise<void>;
};

export const WorkforceDetailCtx = createContext<WorkforceDetailContext | null>(null);

export function useWorkforceDetail(): WorkforceDetailContext {
  const ctx = useContext(WorkforceDetailCtx);
  if (!ctx) throw new Error('useWorkforceDetail requires WorkforceDetail');
  return ctx;
}
