import { useCallback, useEffect } from 'react';
import { z } from 'zod';
import { Catalog } from '@a2ui/web_core/v0_9';
import { basicCatalog, createComponentImplementation } from '@a2ui/react/v0_9';
import { fetchObjectTypes, fetchObjectInstances } from '../../../data/ontologyApi';
import { fetchOntologyActionTypes } from '../../../data/ontologyActionsApi';
import './AppA2uiSurface.scss';

export const APP_BUILDER_A2UI_CATALOG_ID =
  'https://openkms.local/a2ui/catalogs/ontology-app/v1.json';
export const APP_BUILDER_A2UI_SURFACE_ID = 'ontology-app';

/** Host event: Button → execute Action from DataModel. */
export const EXECUTE_ACTION_EVENT = 'executeAction';
/** Host event: Button → execute published Function from DataModel. */
export const EXECUTE_FUNCTION_EVENT = 'executeFunction';
/** Host event: row edit → populate edit form + open modal. */
export const LOAD_OBJECT_FOR_EDIT_EVENT = 'loadObjectForEdit';
/** Hidden Modal trigger marker (Text child content). */
export const EDIT_MODAL_OPEN_MARKER = '__onto_edit_open__';

const MUTATED_EVENT = 'app-builder:mutated';

export function emitAppBuilderMutated() {
  window.dispatchEvent(new CustomEvent(MUTATED_EVENT));
}

function useOntologyMutated(reload: () => void) {
  useEffect(() => {
    const onMut = () => reload();
    window.addEventListener(MUTATED_EVENT, onMut);
    return () => window.removeEventListener(MUTATED_EVENT, onMut);
  }, [reload]);
}

async function resolveObjectTypeId(objectType: string): Promise<string> {
  const types = await fetchObjectTypes();
  const hit = types.items.find((t) => t.name === objectType || t.id === objectType);
  if (!hit) throw new Error(`Object type not found: ${objectType}`);
  return hit.id;
}

export async function resolveActionByApiName(actionApiName: string) {
  const acts = await fetchOntologyActionTypes();
  const hit = acts.find((a) => a.api_name === actionApiName);
  if (!hit) throw new Error(`Action not found: ${actionApiName}`);
  return hit;
}

/** Close enclosing A2UI Modal after execute — Modal owns open state. */
export function closeNearestA2uiModal(from?: HTMLElement | null) {
  const root = from ?? document.body;
  root
    .querySelector<HTMLButtonElement>('.a2ui-modal-overlay .a2ui-modal-close')
    ?.click();
}

/** Hide the programmatic edit-modal trigger (its only job is opening the shared edit Modal). */
export function decorateA2uiDom(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.a2ui-modal-trigger').forEach((trigger) => {
    if (trigger.textContent?.trim() === EDIT_MODAL_OPEN_MARKER) {
      trigger.classList.add('a2ui-platform-hidden-trigger');
    }
  });
}

/** Open Modal whose trigger Text matches a programmatic marker. */
export function openProgrammaticA2uiModal(markerText: string) {
  const triggers = document.querySelectorAll<HTMLElement>('.onto-app-a2ui .a2ui-modal-trigger');
  for (const trigger of triggers) {
    if (trigger.textContent?.trim() === markerText) {
      trigger.click();
      return;
    }
  }
}

type DataContextLike = {
  set: (path: string, value: unknown) => void;
};

function parseRowFields(raw: string | undefined, titleProp: string): string[] {
  const fromProp = (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const fields = fromProp.length ? fromProp : [titleProp];
  return [...new Set(['id', titleProp, ...fields])];
}

/**
 * Loads object instances into DataModel at `dataPath` for A2UI List templates.
 * Does not render rows — compose with basic `List` + row template in Source.
 */
function OntoObjectListLoader({
  props,
  context,
}: {
  props: Record<string, string>;
  context: { dataContext: DataContextLike };
}) {
  const objectType = props.objectType || '';
  const dataPath = props.dataPath || '';
  const titleProp = props.titleProperty || 'title';
  const filterProperty = props.filterProperty || '';
  const filterValue = props.filterValue || '';
  const rowFields = parseRowFields(props.rowFields, titleProp);

  const load = useCallback(async () => {
    if (!objectType || !dataPath) return;
    try {
      const typeId = await resolveObjectTypeId(objectType);
      const res = await fetchObjectInstances(typeId, { limit: 200 });
      const rows: Record<string, unknown>[] = [];
      for (const item of res.items || []) {
        const data = (item.data || {}) as Record<string, unknown>;
        if (filterProperty && String(data[filterProperty] ?? '') !== filterValue) continue;
        const row: Record<string, unknown> = { id: String(item.id) };
        for (const field of rowFields) {
          if (field === 'id') continue;
          const value = data[field];
          if (value !== undefined && value !== null) row[field] = value;
        }
        if (row[titleProp] == null) {
          row[titleProp] = String(item.id);
        }
        rows.push(row);
      }
      context.dataContext.set(dataPath, rows);
    } catch (e) {
      console.error('OntoObjectList load failed:', e instanceof Error ? e.message : String(e));
      context.dataContext.set(dataPath, []);
    }
  }, [objectType, dataPath, titleProp, filterProperty, filterValue, rowFields, context.dataContext]);

  useEffect(() => {
    void load();
  }, [load]);
  useOntologyMutated(load);

  return null;
}

const OntoObjectListApi = {
  name: 'OntoObjectList',
  schema: z.object({
    objectType: z.string(),
    dataPath: z.string(),
    titleProperty: z.string().optional(),
    rowFields: z.string().optional(),
    filterProperty: z.string().optional(),
    filterValue: z.string().optional(),
  }),
} as never;

const OntoObjectList = createComponentImplementation(
  OntoObjectListApi,
  ({ props, context }) => <OntoObjectListLoader props={props} context={context} />,
);

const basicComponents = [...basicCatalog.components.values()];
const basicFunctions = basicCatalog.functions ? [...basicCatalog.functions.values()] : [];

export const appBuilderCatalog = new Catalog(
  APP_BUILDER_A2UI_CATALOG_ID,
  [...basicComponents, OntoObjectList] as never[],
  basicFunctions as never[],
);
