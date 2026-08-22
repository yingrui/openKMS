import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Catalog } from '@a2ui/web_core/v0_9';
import { basicCatalog, createComponentImplementation } from '@a2ui/react/v0_9';
import { fetchObjectTypes, fetchObjectInstances } from '../../data/ontologyApi';
import {
  executeOntologyAction,
  fetchOntologyActionTypes,
} from '../../data/ontologyActionsApi';
import { executeOntologyFunctionByApiName } from '../../data/ontologyFunctionsApi';
import './OntologyAppA2ui.scss';

export const ONTOLOGY_APP_A2UI_CATALOG_ID =
  'https://openkms.local/a2ui/catalogs/ontology-app/v1.json';
export const ONTOLOGY_APP_A2UI_SURFACE_ID = 'ontology-app';

/** Host event name: Button action.event → execute Action from DataModel. */
export const EXECUTE_ACTION_EVENT = 'executeAction';

const MUTATED_EVENT = 'ontology-app:mutated';

export function emitOntologyAppMutated() {
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

export async function resolveActionId(actionApiName: string): Promise<string> {
  return (await resolveActionByApiName(actionApiName)).id;
}

/** Close enclosing A2UI Modal after execute — Modal owns open state. */
export function closeNearestA2uiModal(from?: HTMLElement | null) {
  const root = from ?? document.body;
  root
    .querySelector<HTMLButtonElement>('.a2ui-modal-overlay .a2ui-modal-close')
    ?.click();
}

type ListRow = { id: string; title: string; data: Record<string, unknown> };

function OntoObjectListImpl({ props }: { props: Record<string, string> }) {
  const objectType = props.objectType || '';
  const titleProp = props.titleProperty || 'title';
  const filterProperty = props.filterProperty || '';
  const filterValue = props.filterValue || '';

  const [rows, setRows] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!objectType) {
      setError('objectType is required');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const typeId = await resolveObjectTypeId(objectType);
      const res = await fetchObjectInstances(typeId, { limit: 200 });
      const next: ListRow[] = [];
      for (const item of res.items || []) {
        const data = (item.data || {}) as Record<string, unknown>;
        if (filterProperty) {
          const v = data[filterProperty];
          if (String(v ?? '') !== filterValue) continue;
        }
        const title = String(data[titleProp] ?? item.id ?? '');
        next.push({ id: String(item.id), title: title || String(item.id), data });
      }
      setRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [objectType, titleProp, filterProperty, filterValue]);

  useEffect(() => {
    void load();
  }, [load]);
  useOntologyMutated(load);

  return (
    <div className="onto-a2ui-list">
      <div className="onto-a2ui-list__toolbar">
        {filterProperty ? (
          <span className="onto-a2ui-muted">
            {filterProperty}={filterValue || '∅'}
          </span>
        ) : null}
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {error ? <p className="onto-a2ui-error">{error}</p> : null}
      {loading ? <p className="onto-a2ui-muted">Loading…</p> : null}
      {!loading && !rows.length ? <p className="onto-a2ui-muted">No objects</p> : null}
      <ul className="onto-a2ui-list__items">
        {rows.map((r) => (
          <li key={r.id} className="onto-a2ui-list__item">
            {r.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

const OntoObjectListApi = {
  name: 'OntoObjectList',
  schema: z.object({
    objectType: z.string(),
    titleProperty: z.string().optional(),
    filterProperty: z.string().optional(),
    filterValue: z.string().optional(),
  }),
} as never;

const OntoActionButtonApi = {
  name: 'OntoActionButton',
  schema: z.object({
    actionApiName: z.string(),
    label: z.string(),
    objectId: z.string().optional(),
  }),
} as never;

const OntoFunctionButtonApi = {
  name: 'OntoFunctionButton',
  schema: z.object({
    functionApiName: z.string(),
    label: z.string(),
    objectId: z.string().optional(),
  }),
} as never;

const OntoObjectLinkApi = {
  name: 'OntoObjectLink',
  schema: z.object({
    objectTypeId: z.string(),
    objectId: z.string(),
    label: z.string(),
  }),
} as never;

const OntoObjectList = createComponentImplementation(
  OntoObjectListApi,
  ({ props }: { props: Record<string, string> }) => <OntoObjectListImpl props={props} />,
);

const OntoActionButton = createComponentImplementation(
  OntoActionButtonApi,
  ({ props }: { props: Record<string, string> }) => {
    const [msg, setMsg] = useState<string | null>(null);
    return (
      <span className="onto-a2ui-inline">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            void (async () => {
              try {
                const id = await resolveActionId(props.actionApiName);
                const res = await executeOntologyAction(id, {
                  object_id: props.objectId,
                  input: props.objectId ? { object_id: props.objectId } : {},
                });
                setMsg(res.status === 'ok' ? 'ok' : res.error || 'error');
                if (res.status === 'ok') emitOntologyAppMutated();
              } catch (e) {
                setMsg(e instanceof Error ? e.message : String(e));
              }
            })();
          }}
        >
          {props.label || props.actionApiName}
        </button>
        {msg ? <span className="onto-a2ui-muted">{msg}</span> : null}
      </span>
    );
  },
);

const OntoFunctionButton = createComponentImplementation(
  OntoFunctionButtonApi,
  ({ props }: { props: Record<string, string> }) => {
    const [out, setOut] = useState<string | null>(null);
    return (
      <span className="onto-a2ui-inline">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            void (async () => {
              try {
                const input: Record<string, unknown> = {};
                if (props.objectId) input.object_id = props.objectId;
                const res = await executeOntologyFunctionByApiName(props.functionApiName, {
                  input,
                  use_published: true,
                });
                setOut(JSON.stringify(res.output ?? res, null, 2));
              } catch (e) {
                setOut(e instanceof Error ? e.message : String(e));
              }
            })();
          }}
        >
          {props.label || props.functionApiName}
        </button>
        {out ? <pre className="onto-a2ui-fo">{out}</pre> : null}
      </span>
    );
  },
);

const OntoObjectLink = createComponentImplementation(
  OntoObjectLinkApi,
  ({ props }: { props: Record<string, string> }) => (
    <Link className="onto-a2ui-link" to={`/object-explorer/objects/${props.objectTypeId}`}>
      {props.label || props.objectId}
    </Link>
  ),
);

const basicComponents = [...basicCatalog.components.values()];
const basicFunctions = basicCatalog.functions ? [...basicCatalog.functions.values()] : [];

export const ontologyAppCatalog = new Catalog(
  ONTOLOGY_APP_A2UI_CATALOG_ID,
  [...basicComponents, OntoObjectList, OntoActionButton, OntoFunctionButton, OntoObjectLink] as never[],
  basicFunctions as never[],
);
