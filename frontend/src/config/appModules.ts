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
  LayoutGrid,
  Table2,
  Sparkles,
} from 'lucide-react';
import type { FeatureToggleKey } from '../data/featureTogglesApi';

export type ModuleKind = 'platform' | 'suite_app' | 'console_platform';

/** Suite apps are grouped into three layers in the App Rail and Launcher. */
export type AppLayer = 'data' | 'ontology' | 'application';

export type AppModule = {
  id: string;
  kind: ModuleKind;
  /** Layer grouping in the App Rail and Launcher (data → ontology → application). Suite apps only. */
  layer?: AppLayer;
  /** Display order within a layer in App Rail, Launcher, and Home Apps (lower = earlier). */
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
 * Grouped by `layer` (application → ontology → data); `order` is the within-layer tie-break.
 *
 * Application layer: agent workspaces, document capture, content, knowledge structure
 * Ontology layer: Ontology Manager / Object Explorer / Function Editor
 * Data layer: Datasets / Data Model / Data Explorer
 */
export const APP_MODULES: AppModule[] = [
  {
    id: 'datasets',
    kind: 'suite_app',
    layer: 'data',
    order: 5,
    homePath: '/datasets',
    icon: Table2,
    labelKey: 'datasets',
    taglineKey: 'appTaglineDatasets',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    isActive: (p) =>
      p === '/datasets' ||
      p.startsWith('/datasets/') ||
      p === '/data-model' ||
      p.startsWith('/data-model/') ||
      p === '/ontology-manager/datasets' ||
      p.startsWith('/ontology-manager/datasets/'),
  },
  {
    id: 'data-explorer',
    kind: 'suite_app',
    layer: 'data',
    order: 7,
    homePath: '/data-explorer',
    icon: Sparkles,
    labelKey: 'dataExplorer',
    taglineKey: 'appTaglineDataExplorer',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    isActive: (p) => p === '/data-explorer' || p.startsWith('/data-explorer/'),
  },
  {
    id: 'agents',
    kind: 'suite_app',
    layer: 'application',
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
    layer: 'application',
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
    layer: 'application',
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
    layer: 'application',
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
    layer: 'application',
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
    layer: 'application',
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
    layer: 'application',
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
    layer: 'ontology',
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
    layer: 'ontology',
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
    layer: 'ontology',
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
    id: 'apps',
    kind: 'suite_app',
    layer: 'application',
    order: 83,
    homePath: '/apps',
    icon: LayoutGrid,
    labelKey: 'apps',
    taglineKey: 'appTaglineApps',
    showInLauncher: true,
    showInMainSidebar: true,
    showInConsoleNav: false,
    isActive: (p) => p === '/apps' || p.startsWith('/apps/') || p === '/app-builder' || p.startsWith('/app-builder/'),
  },
  {
    id: 'evaluations',
    kind: 'suite_app',
    layer: 'application',
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
    layer: 'application',
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
  return [...modules].sort(
    (a, b) => layerRank(a) - layerRank(b) || a.order - b.order || a.id.localeCompare(b.id),
  );
}

/** Canonical layer order for the App Rail, Launcher, and Home apps: application → ontology → data. */
export const APP_LAYER_ORDER: AppLayer[] = ['application', 'ontology', 'data'];

/** Rank by layer (console/unknown modules sort last); used as the primary sort key. */
function layerRank(module: AppModule): number {
  const idx = module.layer ? APP_LAYER_ORDER.indexOf(module.layer) : -1;
  return idx < 0 ? APP_LAYER_ORDER.length : idx;
}

/** Group (already sorted) suite modules by layer, preserving order within each layer. */
export function groupModulesByLayer(
  modules: AppModule[],
): { layer: AppLayer; modules: AppModule[] }[] {
  const sorted = sortSuiteApps(modules);
  return APP_LAYER_ORDER.map((layer) => ({
    layer,
    modules: sorted.filter((m) => m.layer === layer),
  })).filter((g) => g.modules.length > 0);
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
