import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * The tabs of a workforce agent, in the order a reader builds it.
 *
 * One list for both consumers: the route table in `App.tsx` renders it, and the shell's rail builds its
 * `navItems` from it. Two lists is how a tab ends up reachable from the URL but missing from the rail.
 *
 * The split follows what each setting *is*: prompt text (Profile), request parameters (Model), what it may read
 * (Resources — corpora, semantic models, ontology groups), skill packages (Skills), what it may do (Tools),
 * what the runtime enforces (Answer policy), who may call (Credentials — which also says where), and whether it
 * answers at all (Service). What all of it assembles into is a panel on Profile, not a tab: it is a projection, and a
 * tab for a projection costs a click every time someone checks what their edit produced.
 *
 * Knowledge and Tools are separate axes: knowledge is data the agent may read, a capability is something it may do.
 * They meet only in a reference — "Catalog needs a semantic model" — never in one list.
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
    labelKey: 'navProfile',
    Component: lazy(() =>
      import('./ProfileTab').then((m) => ({ default: m.WorkforceProfileTab }))
    ),
  },
  {
    segment: 'model',
    labelKey: 'navModel',
    Component: lazy(() => import('./ModelTab').then((m) => ({ default: m.WorkforceModelTab }))),
  },
  {
    segment: 'knowledge',
    labelKey: 'navKnowledge',
    Component: lazy(() =>
      import('./KnowledgeTab').then((m) => ({ default: m.WorkforceKnowledgeTab }))
    ),
  },
  {
    segment: 'skills',
    labelKey: 'navSkills',
    Component: lazy(() => import('./SkillsTab').then((m) => ({ default: m.WorkforceSkillsTab }))),
  },
  {
    segment: 'tools',
    labelKey: 'navTools',
    Component: lazy(() => import('./ToolsTab').then((m) => ({ default: m.WorkforceToolsTab }))),
  },
  {
    segment: 'behavior',
    labelKey: 'navBehavior',
    Component: lazy(() =>
      import('./BehaviorTab').then((m) => ({ default: m.WorkforceBehaviorTab }))
    ),
  },
  {
    segment: 'credentials',
    labelKey: 'navCredentials',
    Component: lazy(() =>
      import('./CredentialsTab').then((m) => ({ default: m.WorkforceCredentialsTab }))
    ),
  },
  {
    segment: 'service',
    labelKey: 'navService',
    Component: lazy(() => import('./ServiceTab').then((m) => ({ default: m.WorkforceServiceTab }))),
  },
];
