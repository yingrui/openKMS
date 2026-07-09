import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  BookOpen,
  ClipboardList,
  Code2,
  Cpu,
  Database,
  FileStack,
  FileText,
  FolderTree,
  GitBranch,
  Image,
  ListTodo,
  Network,
  Plug,
  Compass,
} from 'lucide-react';
import type { FeatureToggleKey } from '../data/featureTogglesApi';

export type ModuleKind = 'platform' | 'suite_app' | 'console_platform';

export type AppModule = {
  id: string;
  kind: ModuleKind;
  /** Display order in App Rail, Launcher, and Home Apps (lower = earlier). Keep in sync across surfaces. */
  order: number;
  homePath: string;
  icon: LucideIcon;
  labelKey: string;
  taglineKey: string;
  showInLauncher: boolean;
  showInMainSidebar: boolean;
  showInConsoleNav: boolean;
  featureToggle?: FeatureToggleKey;
  /** Extra paths that grant visibility (e.g. legacy aliases). */
  accessPaths?: string[];
  isActive: (pathname: string) => boolean;
};

const agentsActive = (pathname: string) =>
  pathname === '/agents' ||
  pathname.startsWith('/agents/') ||
  /^\/projects\/[^/]+(\/(sessions\/[^/]+|settings))?$/.test(pathname);

const knowledgeMapActive = (pathname: string) =>
  pathname === '/knowledge-map' || pathname.startsWith('/knowledge-map/');

const ontologyManagerActive = (pathname: string) =>
  pathname === '/ontology-manager' ||
  pathname.startsWith('/ontology-manager/') ||
  pathname === '/ontology' ||
  pathname.startsWith('/ontology/');

const objectExplorerActive = (pathname: string) =>
  pathname === '/object-explorer' ||
  pathname.startsWith('/object-explorer/') ||
  pathname.startsWith('/objects') ||
  pathname.startsWith('/links');

const functionEditorActive = (pathname: string) =>
  pathname === '/function-editor' || pathname.startsWith('/function-editor/');

/**
 * Canonical suite app order — App Rail, App Launcher, and Home Apps must all use
 * `sortSuiteApps()` after visibility filtering. Reorder here only; do not sort in UI code.
 *
 * 1. Agent workspaces, then document capture
 * 2. Core content (articles → wiki → knowledge bases)
 * 3. Media
 * 4. Knowledge structure (terms → ontology → evaluations)
 * 5. Knowledge Map (overview — last)
 */
export const APP_MODULES: AppModule[] = [
  {
    id: 'agents',
    kind: 'suite_app',
    order: 10,
    homePath: '/agents',
    icon: Bot,
    labelKey: 'agents',
    taglineKey: 'appTaglineAgents',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    featureToggle: 'agents',
    isActive: agentsActive,
  },
  {
    id: 'documents',
    kind: 'suite_app',
    order: 20,
    homePath: '/documents',
    icon: FileStack,
    labelKey: 'documents',
    taglineKey: 'appTaglineDocuments',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    isActive: (p) => p === '/documents' || p.startsWith('/documents/'),
  },
  {
    id: 'articles',
    kind: 'suite_app',
    order: 30,
    homePath: '/articles',
    icon: FileText,
    labelKey: 'articles',
    taglineKey: 'appTaglineArticles',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    isActive: (p) => p === '/articles' || p.startsWith('/articles/'),
  },
  {
    id: 'wikis',
    kind: 'suite_app',
    order: 40,
    homePath: '/wikis',
    icon: BookOpen,
    labelKey: 'wikiSpaces',
    taglineKey: 'appTaglineWikis',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    isActive: (p) => p === '/wikis' || p.startsWith('/wikis/'),
  },
  {
    id: 'knowledge-bases',
    kind: 'suite_app',
    order: 50,
    homePath: '/knowledge-bases',
    icon: Database,
    labelKey: 'knowledgeBases',
    taglineKey: 'appTaglineKnowledgeBases',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    isActive: (p) => p === '/knowledge-bases' || p.startsWith('/knowledge-bases/'),
  },
  {
    id: 'media',
    kind: 'suite_app',
    order: 60,
    homePath: '/media',
    icon: Image,
    labelKey: 'media',
    taglineKey: 'appTaglineMedia',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    featureToggle: 'media',
    isActive: (p) => p === '/media' || p.startsWith('/media/'),
  },
  {
    id: 'glossaries',
    kind: 'suite_app',
    order: 70,
    homePath: '/glossaries',
    icon: BookOpen,
    labelKey: 'glossaries',
    taglineKey: 'appTaglineGlossaries',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    isActive: (p) => p === '/glossaries' || p.startsWith('/glossaries/'),
  },
  {
    id: 'ontology-manager',
    kind: 'suite_app',
    order: 80,
    homePath: '/ontology-manager',
    icon: Network,
    labelKey: 'ontologyManager',
    taglineKey: 'appTaglineOntologyManager',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    accessPaths: ['/ontology', '/ontology/*'],
    isActive: ontologyManagerActive,
  },
  {
    id: 'object-explorer',
    kind: 'suite_app',
    order: 81,
    homePath: '/object-explorer/objects',
    icon: Compass,
    labelKey: 'objectExplorer',
    taglineKey: 'appTaglineObjectExplorer',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    accessPaths: ['/objects', '/objects/*', '/links', '/links/*'],
    isActive: objectExplorerActive,
  },
  {
    id: 'function-editor',
    kind: 'suite_app',
    order: 82,
    homePath: '/function-editor',
    icon: Code2,
    labelKey: 'functionEditor',
    taglineKey: 'appTaglineFunctionEditor',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    isActive: functionEditorActive,
  },
  {
    id: 'evaluations',
    kind: 'suite_app',
    order: 90,
    homePath: '/evaluations',
    icon: ClipboardList,
    labelKey: 'evaluation',
    taglineKey: 'appTaglineEvaluations',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    featureToggle: 'evaluations',
    isActive: (p) => p === '/evaluations' || p.startsWith('/evaluations/'),
  },
  {
    id: 'knowledge-map',
    kind: 'suite_app',
    order: 100,
    homePath: '/knowledge-map',
    icon: FolderTree,
    labelKey: 'knowledgeMap',
    taglineKey: 'appTaglineKnowledgeMap',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    isActive: knowledgeMapActive,
  },
];

export const CONSOLE_PLATFORM_MODULES: AppModule[] = [
  {
    id: 'connectors',
    kind: 'console_platform',
    order: 10,
    homePath: '/connectors',
    icon: Plug,
    labelKey: 'connectors',
    taglineKey: 'connectors',
    showInLauncher: false,
    showInMainSidebar: false,
    showInConsoleNav: true,
    featureToggle: 'connectors',
    isActive: (p) => p === '/connectors' || p.startsWith('/connectors/'),
  },
  {
    id: 'pipelines',
    kind: 'console_platform',
    order: 20,
    homePath: '/pipelines',
    icon: GitBranch,
    labelKey: 'pipelines',
    taglineKey: 'pipelines',
    showInLauncher: false,
    showInMainSidebar: false,
    showInConsoleNav: true,
    isActive: (p) => p === '/pipelines' || p.startsWith('/pipelines/'),
  },
  {
    id: 'models',
    kind: 'console_platform',
    order: 30,
    homePath: '/models',
    icon: Cpu,
    labelKey: 'models',
    taglineKey: 'models',
    showInLauncher: false,
    showInMainSidebar: false,
    showInConsoleNav: true,
    isActive: (p) => p === '/models' || p.startsWith('/models/'),
  },
  {
    id: 'job-runs',
    kind: 'console_platform',
    order: 40,
    homePath: '/job-runs',
    icon: ListTodo,
    labelKey: 'jobs',
    taglineKey: 'jobs',
    showInLauncher: false,
    showInMainSidebar: false,
    showInConsoleNav: true,
    accessPaths: ['/jobs'],
    isActive: (p) =>
      p === '/job-runs' ||
      p.startsWith('/job-runs/') ||
      p === '/jobs' ||
      p.startsWith('/jobs/'),
  },
];

export function sortSuiteApps(modules: AppModule[]): AppModule[] {
  return [...modules].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function getLauncherModules(): AppModule[] {
  return sortSuiteApps(APP_MODULES.filter((m) => m.showInLauncher));
}

export function getMainSidebarModules(): AppModule[] {
  return sortSuiteApps(APP_MODULES.filter((m) => m.showInMainSidebar));
}

export function getConsolePlatformModules(): AppModule[] {
  return CONSOLE_PLATFORM_MODULES.filter((m) => m.showInConsoleNav);
}

export function moduleTooltip(label: string, tagline: string): string {
  return `${label}\n${tagline}`;
}

/** Console shell: admin sidebar (expanded), no App Rail — includes `/console/*` and platform ops routes. */
export function isConsoleShellPath(pathname: string): boolean {
  if (pathname.startsWith('/console')) return true;
  return CONSOLE_PLATFORM_MODULES.some((m) => m.isActive(pathname));
}
