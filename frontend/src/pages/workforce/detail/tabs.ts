import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * The tabs of a workforce agent, in the order a reader builds it.
 *
 * One list for both consumers: the route table in `App.tsx` renders it, and the shell's rail builds its
 * `navItems` from it. Two lists is how a tab ends up reachable from the URL but missing from the rail.
 *
 * The split follows what each setting *is*: prompt text (Profile), request parameters (Model), what it answers
 * from (Knowledge), capability switches (Skills), what it may reach (Tools), what the runtime enforces
 * (Behavior), and who may call (Credentials — which also says where).
 *
 * Knowledge is separate from Tools on purpose: binding a corpus decides *what the answer is drawn from*,
 * granting a lookup decides *what the agent may consult*. They were one tab and it read as one dimension.
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
];
