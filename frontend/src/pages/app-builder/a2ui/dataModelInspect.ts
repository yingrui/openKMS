/** Static load wiring extracted from / written into A2UI messages (not a platform API catalog). */

export type OntoObjectListBinding = {
  componentId: string;
  objectType: string;
  dataPath: string;
  titleProperty?: string;
  filterProperty?: string;
  filterValue?: string;
  rowFields?: string;
};

function iterUpdateComponents(
  messages: Record<string, unknown>[],
): { msgIndex: number; components: Record<string, unknown>[] } | null {
  for (let i = 0; i < messages.length; i++) {
    const upd = messages[i].updateComponents as { components?: Record<string, unknown>[] } | undefined;
    if (upd && Array.isArray(upd.components)) {
      return { msgIndex: i, components: upd.components };
    }
  }
  return null;
}

function cloneMessages(messages: Record<string, unknown>[]): Record<string, unknown>[] {
  return structuredClone(messages);
}

/** OntoObjectList nodes → ontology objectType → DataModel dataPath. */
export function extractOntoObjectListBindings(
  messages: Record<string, unknown>[],
): OntoObjectListBinding[] {
  const block = iterUpdateComponents(messages);
  if (!block) return [];
  const out: OntoObjectListBinding[] = [];
  for (const c of block.components) {
    if (String(c.component || '') !== 'OntoObjectList') continue;
    const objectType = String(c.objectType || '').trim();
    const dataPath = String(c.dataPath || '').trim();
    if (!objectType && !dataPath) continue;
    const binding: OntoObjectListBinding = {
      componentId: String(c.id || ''),
      objectType,
      dataPath,
    };
    const titleProperty = String(c.titleProperty || '').trim();
    if (titleProperty) binding.titleProperty = titleProperty;
    const filterProperty = String(c.filterProperty || '').trim();
    if (filterProperty) {
      binding.filterProperty = filterProperty;
      binding.filterValue = String(c.filterValue ?? '').trim();
    }
    const rowFields = String(c.rowFields || '').trim();
    if (rowFields) binding.rowFields = rowFields;
    out.push(binding);
  }
  return out;
}

function applyBindingToComponent(
  c: Record<string, unknown>,
  binding: OntoObjectListBinding,
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...c,
    component: 'OntoObjectList',
    id: binding.componentId,
    objectType: binding.objectType.trim(),
    dataPath: binding.dataPath.trim(),
  };
  const titleProperty = (binding.titleProperty || '').trim();
  if (titleProperty) next.titleProperty = titleProperty;
  else delete next.titleProperty;
  const filterProperty = (binding.filterProperty || '').trim();
  if (filterProperty) {
    next.filterProperty = filterProperty;
    next.filterValue = (binding.filterValue ?? '').trim();
  } else {
    delete next.filterProperty;
    delete next.filterValue;
  }
  const rowFields = (binding.rowFields || '').trim();
  if (rowFields) next.rowFields = rowFields;
  else delete next.rowFields;
  return next;
}

function remapListPaths(
  components: Record<string, unknown>[],
  fromPath: string,
  toPath: string,
): void {
  if (!fromPath || fromPath === toPath) return;
  for (const c of components) {
    if (String(c.component || '') !== 'List') continue;
    const children = c.children;
    if (!children || typeof children !== 'object' || Array.isArray(children)) continue;
    const path = String((children as { path?: unknown }).path || '');
    if (path === fromPath) {
      (children as { path: string }).path = toPath;
    }
  }
}

function ensureRootChild(components: Record<string, unknown>[], childId: string): void {
  const root = components.find((c) => String(c.id || '') === 'root');
  if (!root) return;
  const children = root.children;
  if (Array.isArray(children)) {
    if (!children.includes(childId)) root.children = [...children, childId];
  }
}

/** Update an existing OntoObjectList (and remaps List path if dataPath changed). */
export function updateOntoObjectListBinding(
  messages: Record<string, unknown>[],
  binding: OntoObjectListBinding,
): Record<string, unknown>[] {
  const next = cloneMessages(messages);
  const block = iterUpdateComponents(next);
  if (!block) throw new Error('Source has no updateComponents');
  const components = block.components;
  const idx = components.findIndex(
    (c) =>
      String(c.component || '') === 'OntoObjectList' &&
      String(c.id || '') === binding.componentId,
  );
  if (idx < 0) throw new Error(`OntoObjectList ${binding.componentId} not found`);
  const prevPath = String(components[idx].dataPath || '').trim();
  components[idx] = applyBindingToComponent(components[idx], binding);
  remapListPaths(components, prevPath, binding.dataPath.trim());
  return next;
}

/** Append a new OntoObjectList under root (creates id if empty). */
export function addOntoObjectListBinding(
  messages: Record<string, unknown>[],
  binding: OntoObjectListBinding,
): Record<string, unknown>[] {
  const next = cloneMessages(messages);
  const block = iterUpdateComponents(next);
  if (!block) throw new Error('Source has no updateComponents');
  const components = block.components;
  const id =
    binding.componentId.trim() ||
    `loader_${binding.dataPath.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'list'}`;
  if (components.some((c) => String(c.id || '') === id)) {
    throw new Error(`Component id ${id} already exists`);
  }
  const node = applyBindingToComponent({ id, component: 'OntoObjectList' }, { ...binding, componentId: id });
  components.push(node);
  ensureRootChild(components, id);
  return next;
}

/** Remove OntoObjectList by id (does not remove Lists that referenced its path). */
export function removeOntoObjectListBinding(
  messages: Record<string, unknown>[],
  componentId: string,
): Record<string, unknown>[] {
  const next = cloneMessages(messages);
  const block = iterUpdateComponents(next);
  if (!block) throw new Error('Source has no updateComponents');
  const components = block.components;
  const filtered = components.filter(
    (c) =>
      !(
        String(c.component || '') === 'OntoObjectList' &&
        String(c.id || '') === componentId
      ),
  );
  for (const c of filtered) {
    if (Array.isArray(c.children)) {
      c.children = c.children.filter((id) => id !== componentId);
    }
  }
  (next[block.msgIndex].updateComponents as { components: Record<string, unknown>[] }).components =
    filtered;
  return next;
}

export function snapshotDataModelRoot(get: (path: string) => unknown): unknown {
  try {
    const root = get('/');
    if (root === undefined || root === null) return {};
    return structuredClone(root);
  } catch {
    try {
      return get('/') ?? {};
    } catch {
      return {};
    }
  }
}

export function sourceHasLayoutPrimitives(messages: Record<string, unknown>[]): boolean {
  const block = iterUpdateComponents(messages);
  if (!block) return false;
  return block.components.some((c) => {
    const name = String(c.component || '');
    return name === 'List' || name === 'Modal';
  });
}
