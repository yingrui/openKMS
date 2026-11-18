import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * The tabs of a workforce agent, in the order a reader builds it.
 *
 * One list for both consumers: the route table in `App.tsx` renders it, and the shell's rail builds its
 * `navItems` from it. Two lists is how a tab ends up reachable from the URL but missing from the rail.
 */
export type WorkforceTab = {
  /** URL segment under `/workforce/:agentId`; empty for the tab at the root. */
  segment: string;
  /** i18n key under the `workforce` namespace. */
  labelKey: string;
  Component: LazyExoticComponent<ComponentType>;
};

export const WORKFORCE_TABS: WorkforceTab[] = [
  {
    segment: '',
    labelKey: 'navIdentity',
    Component: lazy(() =>
      import('./IdentityTab').then((m) => ({ default: m.WorkforceIdentityTab }))
    ),
  },
  {
    segment: 'behavior',
    labelKey: 'navBehavior',
    Component: lazy(() =>
      import('./BehaviorTab').then((m) => ({ default: m.WorkforceBehaviorTab }))
    ),
  },
  {
    segment: 'knowledge',
    labelKey: 'navKnowledge',
    Component: lazy(() =>
      import('./KnowledgeTab').then((m) => ({ default: m.WorkforceKnowledgeTab }))
    ),
  },
  {
    segment: 'data',
    labelKey: 'navData',
    Component: lazy(() => import('./DataTab').then((m) => ({ default: m.WorkforceDataTab }))),
  },
  {
    segment: 'access',
    labelKey: 'navAccess',
    Component: lazy(() => import('./AccessTab').then((m) => ({ default: m.WorkforceAccessTab }))),
  },
  {
    segment: 'call',
    labelKey: 'navTry',
    Component: lazy(() => import('./CallTab').then((m) => ({ default: m.WorkforceCallTab }))),
  },
];
