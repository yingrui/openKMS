import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Catalog } from '@a2ui/web_core/v0_9';
import { basicCatalog, createComponentImplementation } from '@a2ui/react/v0_9';
import { fetchObjectTypes, fetchObjectInstances } from '../../data/ontologyApi';
import {
  executeOntologyAction,
  fetchOntologyActionTypes,
} from '../../data/ontologyActionsApi';
import {
  executeOntologyFunctionByApiName,
  fetchFunctionVersion,
  fetchFunctionVersions,
  fetchOntologyFunction,
} from '../../data/ontologyFunctionsApi';
import {
  inputSchemaFromObjectTypeProperties,
  isBuiltinObjectRule,
  writableFieldsFromParameters,
} from '../ontology-manager/actionRuleTypes';
import { Dialog, FormField } from '../../styles/design-system';
import './OntologyAppA2ui.scss';

export const ONTOLOGY_APP_A2UI_CATALOG_ID =
  'https://openkms.local/a2ui/catalogs/ontology-app/v1.json';
export const ONTOLOGY_APP_A2UI_SURFACE_ID = 'ontology-app';

const MUTATED_EVENT = 'ontology-app:mutated';

function emitMutated() {
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

async function resolveActionId(actionApiName: string): Promise<string> {
  const acts = await fetchOntologyActionTypes();
  const hit = acts.find((a) => a.api_name === actionApiName);
  if (!hit) throw new Error(`Action not found: ${actionApiName}`);
  return hit.id;
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

type SchemaField = { name: string; type: string };

function fieldsFromInputSchema(schema: Record<string, unknown> | null | undefined): SchemaField[] {
  if (!schema || typeof schema !== 'object') return [];
  const props = schema.properties;
  if (!props || typeof props !== 'object') return [];
  const skip = new Set(['object_id', 'object']);
  const out: SchemaField[] = [];
  for (const [name, def] of Object.entries(props as Record<string, unknown>)) {
    if (skip.has(name)) continue;
    const t =
      def && typeof def === 'object' && 'type' in def
        ? String((def as { type?: unknown }).type || 'string')
        : 'string';
    out.push({ name, type: t });
  }
  return out;
}

function OntoActionFormImpl({ props }: { props: Record<string, string> }) {
  const actionApiName = props.actionApiName || '';
  const label = props.label || actionApiName || 'Submit';
  const fieldWhitelist = useMemo(
    () =>
      (props.fields || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [props.fields],
  );

  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSchema = useCallback(async () => {
    if (!actionApiName) return;
    setError(null);
    try {
      const acts = await fetchOntologyActionTypes();
      const act = acts.find((a) => a.api_name === actionApiName);
      if (!act) throw new Error(`Action not found: ${actionApiName}`);
      let schema: Record<string, unknown> | null = null;
      if (isBuiltinObjectRule(act.rule_type)) {
        const types = await fetchObjectTypes();
        const ot = types.items.find((row) => row.id === act.object_type_id);
        if (ot) {
          const fieldNames = writableFieldsFromParameters(act.parameters);
          schema = inputSchemaFromObjectTypeProperties(ot.properties ?? [], fieldNames);
        }
      } else if (act.function_id) {
        const fn = await fetchOntologyFunction(act.function_id);
        if (fn.published_version_id) {
          const ver = await fetchFunctionVersion(fn.id, fn.published_version_id);
          schema = (ver.input_schema as Record<string, unknown>) || null;
        } else {
          const versions = await fetchFunctionVersions(fn.id);
          const latest = versions[0];
          schema = (latest?.input_schema as Record<string, unknown>) || null;
        }
      }
      let next = fieldsFromInputSchema(schema);
      if (!next.length) {
        next = [{ name: 'title', type: 'string' }];
      }
      if (fieldWhitelist.length) {
        next = next.filter((f) => fieldWhitelist.includes(f.name));
      }
      setFields(next);
      const init: Record<string, string> = {};
      for (const f of next) init[f.name] = '';
      setValues(init);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [actionApiName, fieldWhitelist]);

  useEffect(() => {
    if (open) void loadSchema();
  }, [open, loadSchema]);

  return (
    <span className="onto-a2ui-inline">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={!actionApiName}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        closeDisabled={busy}
        title={label}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="onto-a2ui-action-form"
              className="btn btn-primary"
              disabled={busy || !actionApiName}
            >
              {busy ? '…' : 'Submit'}
            </button>
          </>
        }
      >
        <form
          id="onto-a2ui-action-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!actionApiName || busy) return;
            setBusy(true);
            setError(null);
            void (async () => {
              try {
                const id = await resolveActionId(actionApiName);
                const input: Record<string, unknown> = {};
                for (const f of fields) {
                  const raw = values[f.name] ?? '';
                  if (f.type === 'number' || f.type === 'integer') {
                    input[f.name] = raw === '' ? undefined : Number(raw);
                  } else if (f.type === 'boolean') {
                    input[f.name] = raw === 'true' || raw === '1';
                  } else {
                    input[f.name] = raw;
                  }
                }
                const res = await executeOntologyAction(id, { input });
                if (res.status !== 'ok') throw new Error(res.error || 'Action failed');
                setOpen(false);
                emitMutated();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {error ? <p className="onto-a2ui-error">{error}</p> : null}
          {fields.map((f) => (
            <FormField key={f.name} label={f.name}>
              <input
                className="ds-control"
                type={f.type === 'number' || f.type === 'integer' ? 'number' : 'text'}
                value={values[f.name] ?? ''}
                disabled={busy}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
              />
            </FormField>
          ))}
        </form>
      </Dialog>
    </span>
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

const OntoActionFormApi = {
  name: 'OntoActionForm',
  schema: z.object({
    actionApiName: z.string(),
    label: z.string().optional(),
    fields: z.string().optional(),
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

const OntoActionForm = createComponentImplementation(
  OntoActionFormApi,
  ({ props }: { props: Record<string, string> }) => <OntoActionFormImpl props={props} />,
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
                if (res.status === 'ok') emitMutated();
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
  [...basicComponents, OntoObjectList, OntoActionForm, OntoActionButton, OntoFunctionButton, OntoObjectLink] as never[],
  basicFunctions as never[],
);
