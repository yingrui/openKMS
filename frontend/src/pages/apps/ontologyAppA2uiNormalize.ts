import { ontologyAppCatalog, ONTOLOGY_APP_A2UI_SURFACE_ID } from './ontologyAppA2uiCatalog';

const A2UI_VERSION = 'v0.9';
const LIST_ROW_TEMPLATE_ID = 'workItemRow';

const ONTO_OBJECT_LIST_KEYS = new Set([
  'objectType',
  'dataPath',
  'titleProperty',
  'rowFields',
  'filterProperty',
  'filterValue',
]);

const ROW_FIELD_PATHS = new Set(['/title', '/id', '/status', '/estimate', '/priority']);

function toRelativeRowPath(path: unknown): unknown {
  if (typeof path !== 'string') return path;
  if (path.startsWith('./')) return path.slice(2);
  if (ROW_FIELD_PATHS.has(path)) return path.slice(1);
  return path;
}

function fixRowTemplatePaths(comp: Record<string, unknown>): Record<string, unknown> {
  const id = String(comp.id || '');
  if (id === 'rowTitle' && comp.text && typeof comp.text === 'object') {
    const text = comp.text as { path?: unknown };
    if ('path' in text) {
      return { ...comp, text: { ...text, path: toRelativeRowPath(text.path) } };
    }
  }
  if (id === 'rowEditBtn') {
    const action = comp.action as { event?: { context?: Record<string, unknown> } } | undefined;
    const ctx = action?.event?.context;
    if (!ctx) return comp;
    const nextCtx: Record<string, unknown> = { ...ctx };
    for (const [key, value] of Object.entries(nextCtx)) {
      if (key === 'inputPath') continue;
      if (value && typeof value === 'object' && 'path' in (value as { path?: unknown })) {
        const binding = value as { path?: unknown };
        nextCtx[key] = { ...binding, path: toRelativeRowPath(binding.path) };
      }
    }
    return {
      ...comp,
      action: { ...action, event: { ...action!.event!, context: nextCtx } },
    };
  }
  return comp;
}

const DEFAULT_WORK_ITEM_ROW: Record<string, unknown>[] = [
  {
    id: LIST_ROW_TEMPLATE_ID,
    component: 'Row',
    children: ['rowTitle', 'rowEditBtn'],
    align: 'center',
    justify: 'spaceBetween',
  },
  {
    id: 'rowTitle',
    component: 'Text',
    text: { path: 'title' },
  },
  {
    id: 'rowEditBtn',
    component: 'Button',
    child: 'rowEditIcon',
    variant: 'borderless',
    action: {
      event: {
        name: 'loadObjectForEdit',
        context: {
          inputPath: '/editWorkItem',
          objectId: { path: 'id' },
          title: { path: 'title' },
          status: { path: 'status' },
          estimate: { path: 'estimate' },
          priority: { path: 'priority' },
        },
      },
    },
  },
  {
    id: 'rowEditIcon',
    component: 'Text',
    text: '✎',
  },
];

function slugifyListKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function deriveObjectListDataPath(comp: Record<string, unknown>): string {
  const explicit = comp.dataPath;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const filterValue = comp.filterValue;
  if (typeof filterValue === 'string' && filterValue.trim()) {
    return `/lists/${slugifyListKey(filterValue)}`;
  }
  const id = String(comp.id || 'items');
  return `/lists/${id.replace(/Loader$/, '').replace(/List$/, '')}`;
}

function listChildPath(children: unknown): string | null {
  if (!children || typeof children !== 'object' || Array.isArray(children)) return null;
  const path = (children as { path?: unknown }).path;
  return typeof path === 'string' ? path : null;
}

function normalizeCardButtonChildren(messages: Record<string, unknown>[]): Record<string, unknown>[] {
  return messages.map((msg) => {
    const upd = msg.updateComponents as
      | { surfaceId?: string; components?: Record<string, unknown>[] }
      | undefined;
    if (!upd?.components) return msg;
    const extras: Record<string, unknown>[] = [];
    const fixed = upd.components.map((comp) => {
      const c = { ...comp };
      const name = c.component;
      if ((name === 'Card' || name === 'Button') && 'children' in c && !('child' in c)) {
        const kids = c.children;
        delete c.children;
        if (Array.isArray(kids) && kids.length === 1 && typeof kids[0] === 'string') {
          c.child = kids[0];
        } else if (Array.isArray(kids) && kids.length > 0 && kids.every((k) => typeof k === 'string')) {
          const wrapId = `${String(c.id ?? 'wrap')}-inner`;
          extras.push({ id: wrapId, component: 'Column', children: kids });
          c.child = wrapId;
        } else if (typeof kids === 'string') {
          c.child = kids;
        }
      }
      return c;
    });
    return {
      ...msg,
      updateComponents: { ...upd, components: [...extras, ...fixed] },
    };
  });
}

function patchColumnChildren(
  components: Record<string, unknown>[],
  replacements: Map<string, string[]>,
): Record<string, unknown>[] {
  return components.map((comp) => {
    if (!Array.isArray(comp.children)) return comp;
    let children = comp.children as string[];
    for (const [from, toIds] of replacements) {
      if (!children.includes(from)) continue;
      children = children.flatMap((id) => (id === from ? toIds : [id]));
    }
    return children === comp.children ? comp : { ...comp, children };
  });
}

/** Upgrade legacy OntoObjectList rows + inject List templates and DataModel seeds. */
function normalizeObjectListPattern(messages: Record<string, unknown>[]): Record<string, unknown>[] {
  const msgs = normalizeCardButtonChildren(messages);
  const dataPaths = new Set<string>();
  const listPaths = new Set<string>();
  let hasRowTemplate = false;

  for (const msg of msgs) {
    const upd = msg.updateComponents as { components?: Record<string, unknown>[] } | undefined;
    for (const comp of upd?.components || []) {
      if (comp.id === LIST_ROW_TEMPLATE_ID) hasRowTemplate = true;
      if (comp.component === 'List') {
        const path = listChildPath(comp.children);
        if (path) listPaths.add(path);
      }
    }
  }

  const listExtras: Record<string, unknown>[] = [];
  const columnChildReplacements = new Map<string, string[]>();
  const transformedComponents: Record<string, unknown>[] = [];
  let updateComponentsMsg: Record<string, unknown> | null = null;

  for (const msg of msgs) {
    if ('updateComponents' in msg) updateComponentsMsg = msg;
  }

  if (!updateComponentsMsg) return msgs;

  const upd = updateComponentsMsg.updateComponents as { components?: Record<string, unknown>[] };
  const sourceComponents = upd.components || [];

  for (const comp of sourceComponents) {
    if (comp.component !== 'OntoObjectList') {
      transformedComponents.push(comp);
      continue;
    }

    const dataPath = deriveObjectListDataPath(comp);
    dataPaths.add(dataPath);

    const loader: Record<string, unknown> = { component: 'OntoObjectList' };
    for (const key of ONTO_OBJECT_LIST_KEYS) {
      if (comp[key] != null && comp[key] !== '') loader[key] = comp[key];
    }
    loader.dataPath = dataPath;

    const compId = String(comp.id || 'list');
    const loaderId = compId.endsWith('List') ? compId.replace(/List$/, 'Loader') : compId;
    const listId = compId.endsWith('List') ? compId : `${compId}List`;
    loader.id = loaderId;

    transformedComponents.push(loader);

    if (!listPaths.has(dataPath)) {
      listPaths.add(dataPath);
      listExtras.push({
        id: listId,
        component: 'List',
        children: { componentId: LIST_ROW_TEMPLATE_ID, path: dataPath },
      });
      if (loaderId !== compId) {
        columnChildReplacements.set(compId, [loaderId, listId]);
      }
    } else if (loaderId !== compId) {
      columnChildReplacements.set(compId, [loaderId]);
    }
  }

  let finalComponents = patchColumnChildren(transformedComponents, columnChildReplacements);
  finalComponents = finalComponents.map((comp) => fixRowTemplatePaths(comp));
  if (!hasRowTemplate && listExtras.length) {
    finalComponents = [...finalComponents, ...DEFAULT_WORK_ITEM_ROW];
  }
  finalComponents = [...finalComponents, ...listExtras];

  const nextMsgs = msgs.map((msg) =>
    'updateComponents' in msg
      ? { ...msg, updateComponents: { ...upd, components: finalComponents } }
      : msg,
  );

  const existingPaths = new Set<string>();
  for (const msg of nextMsgs) {
    const dm = msg.updateDataModel as { path?: string } | undefined;
    if (dm?.path) existingPaths.add(dm.path);
  }

  const surfaceId = ONTOLOGY_APP_A2UI_SURFACE_ID;
  const dataModelSeeds: Record<string, unknown>[] = [];
  for (const path of dataPaths) {
    if (existingPaths.has(path)) continue;
    dataModelSeeds.push({
      version: A2UI_VERSION,
      updateDataModel: { surfaceId, path, value: [] },
    });
  }

  if (!dataModelSeeds.length) return nextMsgs;

  const createIdx = nextMsgs.findIndex((m) => 'createSurface' in m);
  const insertAt = createIdx >= 0 ? createIdx + 1 : 0;
  return [...nextMsgs.slice(0, insertAt), ...dataModelSeeds, ...nextMsgs.slice(insertAt)];
}

type ZodIssue = { path: (string | number)[]; message: string };

function formatZodIssues(issues: ZodIssue[]): string {
  return issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
}

/** Pre-validate so A2UI MessageProcessor does not hit Zod v4 `.error.errors` bug. */
export function validateOntologyAppA2uiMessages(messages: Record<string, unknown>[]): void {
  for (const msg of messages) {
    const upd = msg.updateComponents as { components?: Record<string, unknown>[] } | undefined;
    if (!upd?.components) continue;
    for (const comp of upd.components) {
      const componentType = String(comp.component || '');
      const api = ontologyAppCatalog.components.get(componentType) as
        | { schema?: { safeParse: (v: unknown) => { success: boolean; error?: { issues?: ZodIssue[] } } } }
        | undefined;
      if (!api?.schema) continue;
      const { id, component: _name, ...properties } = comp;
      const result = api.schema.safeParse(properties);
      if (!result.success) {
        const issues = (result.error as { issues?: ZodIssue[] }).issues || [];
        throw new Error(
          `Invalid A2UI component ${componentType} (${String(id)}): ${formatZodIssues(issues)}`,
        );
      }
    }
  }
}

export function normalizeOntologyAppA2uiMessages(
  messages: Record<string, unknown>[],
): Record<string, unknown>[] {
  const normalized = normalizeObjectListPattern(messages);
  validateOntologyAppA2uiMessages(normalized);
  return normalized;
}
