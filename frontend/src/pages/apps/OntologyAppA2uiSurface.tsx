import { useEffect, useRef, useState } from 'react';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { A2uiSurface } from '@a2ui/react/v0_9';
import { executeOntologyAction } from '../../data/ontologyActionsApi';
import {
  closeNearestA2uiModal,
  decorateA2uiDom,
  EDIT_MODAL_OPEN_MARKER,
  emitOntologyAppMutated,
  EXECUTE_ACTION_EVENT,
  LOAD_OBJECT_FOR_EDIT_EVENT,
  ontologyAppCatalog,
  ONTOLOGY_APP_A2UI_SURFACE_ID,
  openProgrammaticA2uiModal,
  resolveActionByApiName,
} from './ontologyAppA2uiCatalog';
import {
  normalizeOntologyAppA2uiMessages,
} from './ontologyAppA2uiNormalize';
import './OntologyAppA2ui.scss';

type Props = {
  a2uiMessages: Record<string, unknown>[];
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
  const inputPath = String(action.context.inputPath ?? '/editWorkItem').trim() || '/editWorkItem';
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
    emitOntologyAppMutated();
    closeNearestA2uiModal();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
  }
}

export function OntologyAppA2uiSurface({ a2uiMessages }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [surface, setSurface] = useState<SurfaceLike | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!a2uiMessages.length) {
      setSurface(null);
      setError(null);
      return;
    }
    let sub: { unsubscribe: () => void } | null = null;
    try {
      const processor = new MessageProcessor([ontologyAppCatalog]);
      processor.processMessages(normalizeOntologyAppA2uiMessages(a2uiMessages) as never[]);
      const surfaces = Array.from(processor.model.surfacesMap.values());
      const surf = (surfaces.find((s) => (s as SurfaceLike).id === ONTOLOGY_APP_A2UI_SURFACE_ID) ??
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
        if (action.name === LOAD_OBJECT_FOR_EDIT_EVENT) {
          handleLoadObjectForEdit(surf, action);
        }
      });
      setSurface(surf);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSurface(null);
    }
    return () => {
      sub?.unsubscribe();
    };
  }, [a2uiMessages]);

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
    <div ref={containerRef} className="onto-app-a2ui a2ui-light">
      <A2uiSurface surface={surface as never} />
    </div>
  );
}
