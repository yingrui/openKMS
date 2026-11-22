import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { WORKFORCE_TABS } from './detail/tabs';

/**
 * The Workforce area's routes, kept out of `App.tsx`.
 *
 * `App.tsx` is at the long-file limit, and this area is self-contained: an agent list, a skill
 * registry with its editor, and the chat surface that runs outside the pane layout. Grouping them
 * here keeps the shell to one line per area.
 */

const WorkforceList = lazy(() =>
  import('./WorkforceList').then((m) => ({ default: m.WorkforceList })),
);
const WorkforceDetail = lazy(() =>
  import('./WorkforceDetail').then((m) => ({ default: m.WorkforceDetail })),
);
const WorkforceChat = lazy(() =>
  import('./WorkforceChat').then((m) => ({ default: m.WorkforceChat })),
);
const WorkforceSkillsPage = lazy(() =>
  import('./skills/WorkforceSkillsPage').then((m) => ({ default: m.WorkforceSkillsPage })),
);
const WorkforceToolsPage = lazy(() =>
  import('./skills/WorkforceToolsPage').then((m) => ({ default: m.WorkforceToolsPage })),
);
const WorkforceSkillEditorPage = lazy(() =>
  import('./skills/WorkforceSkillEditorPage').then((m) => ({
    default: m.WorkforceSkillEditorPage,
  })),
);

/** Routes that sit directly in the app shell. */
const IssuesPage = lazy(() =>
  import('../operations/IssuesPage').then((m) => ({ default: m.IssuesPage })),
);
const UsagePage = lazy(() => import('../operations/UsagePage').then((m) => ({ default: m.UsagePage })));
const OperationsLayout = lazy(() =>
  import('../operations/OperationsLayout').then((m) => ({ default: m.OperationsLayout })),
);

export const WORKFORCE_ROUTES = (
  <>
    <Route path="workforce" element={<WorkforceList />} />
    <Route path="workforce/skills" element={<WorkforceSkillsPage />} />
    <Route path="workforce/tools" element={<WorkforceToolsPage />} />
    {/* Operations is a page of this area, not a module of its own: it runs what this area publishes. */}
    <Route path="workforce/operations" element={<OperationsLayout />}>
      <Route index element={<IssuesPage />} />
      <Route path="usage" element={<UsagePage />} />
    </Route>
    <Route path="workforce/skills/:skillId" element={<WorkforceSkillEditorPage />} />
    <Route path="workforce/:agentId/chat" element={<WorkforceChat />} />
    <Route path="workforce/:agentId/chat/:conversationId" element={<WorkforceChat />} />
  </>
);

/** The agent detail route, whose sections come from the one tab list (`detail/tabs.ts`). */
export const WORKFORCE_DETAIL_ROUTE = (
  <Route path="workforce/:agentId" element={<WorkforceDetail />}>
    {WORKFORCE_TABS.map(({ segment, Component }, i) => (
      <Route
        key={segment || 'index'}
        {...(i === 0 ? { index: true } : { path: segment })}
        element={<Component />}
      />
    ))}
  </Route>
);
