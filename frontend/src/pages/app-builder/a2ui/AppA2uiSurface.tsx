import { useEffect, useRef, useState } from 'react';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { A2uiSurface } from '@a2ui/react/v0_9';
import { executeOntologyAction } from '../../../data/ontologyActionsApi';
import { executeOntologyFunctionByApiName } from '../../../data/ontologyFunctionsApi';
import {
  closeNearestA2uiModal,
  decorateA2uiDom,
  EDIT_MODAL_OPEN_MARKER,
  emitAppBuilderMutated,
  EXECUTE_ACTION_EVENT,
  EXECUTE_FUNCTION_EVENT,
  LOAD_OBJECT_FOR_EDIT_EVENT,
  appBuilderCatalog,
  APP_BUILDER_A2UI_SURFACE_ID,
  openProgrammaticA2uiModal,
  resolveActionByApiName,
} from './catalog';
import { snapshotDataModelRoot } from './dataModelInspect';
import { validateAppA2uiMessages } from './validate';
import './AppA2uiSurface.scss';

type Props = {
  a2uiMessages: Record<string, unknown>[];
  /** Fires with `dataModel.get('/')` whenever the surface DataModel changes. */
  onDataModelChange?: (root: unknown) => void;
};

type A2uiClientAction = {
  name: string;
  context: Record<string, unknown>;
};

type SurfaceLike = {
  id?: string;
  onAction: { subscribe: (listener: (a: A2uiClientAction) => void | Promise<void>) => { unsubscribe: () => void } };
  dataModel: {
    get: (path: string) => unknown;
    set: (path: string, value: unknown) => unknown;
    subscribe: (path: string, onChange: (value: unknown) => void) => { unsubscribe: () => void };
  };
  componentsModel?: { get: (id: string) => unknown };
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

/** TextField writes strings; coerce using Action input_schema when present. */
function coerceInputBySchema(
  raw: Record<string, unknown>,
  schema: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const props =
    schema && typeof schema.properties === 'object' && schema.properties
      ? (schema.properties as Record<string, unknown>)
      : {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === '' || value === undefined || value === null) continue;
    if (key === 'objectId' || key === 'id') continue;
    const def = props[key];
    const expected =
      def && typeof def === 'object' && 'type' in def
        ? String((def as { type?: unknown }).type || '')
        : '';
    if (expected === 'number' && typeof value === 'string') {
      const n = Number(value);
      if (!Number.isNaN(n)) {
        out[key] = n;
        continue;
      }
    }
    if (expected === 'integer' && typeof value === 'string') {
      const n = Number.parseInt(value, 10);
      if (!Number.isNaN(n)) {
        out[key] = n;
        continue;
      }
    }
    if (expected === 'boolean' && typeof value === 'string') {
      if (value === 'true') {
        out[key] = true;
        continue;
      }
      if (value === 'false') {
        out[key] = false;
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}

function handleLoadObjectForEdit(surf: SurfaceLike, action: A2uiClientAction) {
  const inputPath = String(action.context.inputPath ?? '').trim();
  if (!inputPath) {
    console.error('A2UI loadObjectForEdit: missing inputPath');
    return;
  }
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(action.context)) {
    if (key === 'inputPath' || value === undefined || value === null || value === '') continue;
    payload[key] = value;
  }
  const objectId = payload.objectId ?? payload.id;
  if (objectId != null) {
    payload.objectId = String(objectId);
    delete payload.id;
  }
  surf.dataModel.set(inputPath, payload);
  openProgrammaticA2uiModal(EDIT_MODAL_OPEN_MARKER);
}

async function handleExecuteAction(surf: SurfaceLike, action: A2uiClientAction) {
  const actionApiName = String(action.context.actionApiName ?? '').trim();
  if (!actionApiName) {
    console.error('A2UI executeAction: missing actionApiName');
    return;
  }
  const inputPath = String(action.context.inputPath ?? '').trim();
  const objectIdRaw =
    action.context.objectId ??
    action.context.object_id ??
    (inputPath ? asRecord(surf.dataModel.get(inputPath)).objectId : undefined);
  const objectId = objectIdRaw != null && String(objectIdRaw).trim() ? String(objectIdRaw).trim() : undefined;

  let input: Record<string, unknown> = {};
  if (inputPath) {
    input = asRecord(surf.dataModel.get(inputPath));
  }

  try {
    const at = await resolveActionByApiName(actionApiName);
    input = coerceInputBySchema(input, at.input_schema);
    const res = await executeOntologyAction(at.id, {
      object_id: objectId,
      input,
    });
    if (res.status !== 'ok') {
      console.error('Action failed:', res.error || res.status);
      return;
    }
    if (inputPath) {
      try {
        const preserved: Record<string, unknown> = {};
        if (typeof input.status === 'string' && input.status) preserved.status = input.status;
        surf.dataModel.set(inputPath, preserved);
      } catch {
        /* ignore clear failures */
      }
    }
    emitAppBuilderMutated();
    closeNearestA2uiModal();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Run a published Ontology Function.
 * Context: functionApiName (required), inputPath (optional form bucket),
 * outputPath (optional — write `output` for Text to bind), objectId (optional → input.object_id /
 * work_item_id), applyPath + applyKey (optional — copy one output field into a DataModel path,
 * e.g. form priority).
 */
async function handleExecuteFunction(surf: SurfaceLike, action: A2uiClientAction) {
  const functionApiName = String(action.context.functionApiName ?? '').trim();
  if (!functionApiName) {
    console.error('A2UI executeFunction: missing functionApiName');
    return;
  }
  const inputPath = String(action.context.inputPath ?? '').trim();
  const outputPath = String(action.context.outputPath ?? '').trim();
  const applyPath = String(action.context.applyPath ?? '').trim();
  const applyKey = String(action.context.applyKey ?? '').trim();
  const objectIdRaw =
    action.context.objectId ??
    action.context.object_id ??
    (inputPath ? asRecord(surf.dataModel.get(inputPath)).objectId : undefined);
  const objectId = objectIdRaw != null && String(objectIdRaw).trim() ? String(objectIdRaw).trim() : undefined;

  let input: Record<string, unknown> = {};
  if (inputPath) {
    input = asRecord(surf.dataModel.get(inputPath));
  }
  if (objectId) {
    // FoOs often take work_item_id; Action-style forms use object_id / objectId.
    input = { ...input, object_id: objectId, work_item_id: objectId };
  }
  // Host meta keys are not Function inputs.
  delete input.objectId;
  delete input.id;

  try {
    const res = await executeOntologyFunctionByApiName(functionApiName, {
      input,
      use_published: true,
    });
    if (res.status !== 'ok') {
      console.error('Function failed:', res.error || res.status);
      if (outputPath) {
        surf.dataModel.set(outputPath, { error: res.error || res.status });
      }
      return;
    }
    const out = asRecord(res.output);
    if (outputPath) {
      surf.dataModel.set(outputPath, out);
    }
    if (applyPath && applyKey && out[applyKey] != null && out[applyKey] !== '') {
      surf.dataModel.set(applyPath, out[applyKey]);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    if (outputPath) {
      try {
        surf.dataModel.set(outputPath, { error: msg });
      } catch {
        /* ignore */
      }
    }
  }
}

export function AppA2uiSurface({ a2uiMessages, onDataModelChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [surface, setSurface] = useState<SurfaceLike | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onDataModelChangeRef = useRef(onDataModelChange);
  onDataModelChangeRef.current = onDataModelChange;

  useEffect(() => {
    if (!a2uiMessages.length) {
      setSurface(null);
      setError(null);
      onDataModelChangeRef.current?.({});
      return;
    }
    let sub: { unsubscribe: () => void } | null = null;
    try {
      const processor = new MessageProcessor([appBuilderCatalog]);
      validateAppA2uiMessages(a2uiMessages);
      processor.processMessages(a2uiMessages as never[]);
      const surfaces = Array.from(processor.model.surfacesMap.values());
      const surf = (surfaces.find((s) => (s as SurfaceLike).id === APP_BUILDER_A2UI_SURFACE_ID) ??
        surfaces[0]) as SurfaceLike | undefined;
      if (!surf) {
        setError('No A2UI surface was created');
        setSurface(null);
        return;
      }
      const root = surf.componentsModel?.get('root');
      if (!root) {
        setError("A2UI messages are missing component id 'root'");
        setSurface(null);
        return;
      }
      sub = surf.onAction.subscribe((action) => {
        if (action.name === EXECUTE_ACTION_EVENT) {
          void handleExecuteAction(surf, action);
          return;
        }
        if (action.name === EXECUTE_FUNCTION_EVENT) {
          void handleExecuteFunction(surf, action);
          return;
        }
        if (action.name === LOAD_OBJECT_FOR_EDIT_EVENT) {
          handleLoadObjectForEdit(surf, action);
        }
      });
      setSurface(surf);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSurface(null);
      onDataModelChangeRef.current?.({});
    }
    return () => {
      sub?.unsubscribe();
    };
  }, [a2uiMessages]);

  useEffect(() => {
    if (!surface) return;
    const emit = () => {
      onDataModelChangeRef.current?.(snapshotDataModelRoot((p) => surface.dataModel.get(p)));
    };
    emit();
    const dmSub = surface.dataModel.subscribe('/', () => emit());
    const onMut = () => {
      window.setTimeout(emit, 0);
    };
    window.addEventListener('app-builder:mutated', onMut);
    // OntoObjectList loads async after first paint; poll briefly until settled.
    const timers = [50, 200, 500, 1200].map((ms) => window.setTimeout(emit, ms));
    return () => {
      dmSub.unsubscribe();
      window.removeEventListener('app-builder:mutated', onMut);
      for (const t of timers) window.clearTimeout(t);
    };
  }, [surface]);

  useEffect(() => {
    if (!surface || !containerRef.current) return;
    decorateA2uiDom(containerRef.current);
    const t = window.setTimeout(() => {
      if (containerRef.current) decorateA2uiDom(containerRef.current);
    }, 0);
    return () => window.clearTimeout(t);
  }, [surface, a2uiMessages]);

  if (error) return <p className="onto-a2ui-error">{error}</p>;
  if (!surface) return <p className="onto-a2ui-muted">Rendering…</p>;

  return (
    <div ref={containerRef} className="onto-app-a2ui a2ui-platform-surface a2ui-light">
      <A2uiSurface surface={surface as never} />
    </div>
  );
}
