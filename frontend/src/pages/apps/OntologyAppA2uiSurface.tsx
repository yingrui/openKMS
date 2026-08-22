import { useEffect, useState } from 'react';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { A2uiSurface } from '@a2ui/react/v0_9';
import { executeOntologyAction } from '../../data/ontologyActionsApi';
import {
  closeNearestA2uiModal,
  emitOntologyAppMutated,
  EXECUTE_ACTION_EVENT,
  ontologyAppCatalog,
  ONTOLOGY_APP_A2UI_SURFACE_ID,
  resolveActionByApiName,
} from './ontologyAppA2uiCatalog';
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

function normalizeA2uiMessages(messages: Record<string, unknown>[]): Record<string, unknown>[] {
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

async function handleExecuteAction(surf: SurfaceLike, action: A2uiClientAction) {
  const actionApiName = String(action.context.actionApiName ?? '').trim();
  if (!actionApiName) {
    console.error('A2UI executeAction: missing actionApiName');
    return;
  }
  const inputPath = String(action.context.inputPath ?? '').trim();
  const objectIdRaw = action.context.objectId ?? action.context.object_id;
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

  useEffect(() => {
    if (!a2uiMessages.length) {
      setSurface(null);
      setError(null);
      return;
    }
    let sub: { unsubscribe: () => void } | null = null;
    try {
      const processor = new MessageProcessor([ontologyAppCatalog]);
      processor.processMessages(normalizeA2uiMessages(a2uiMessages) as never[]);
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
        if (action.name !== EXECUTE_ACTION_EVENT) return;
        void handleExecuteAction(surf, action);
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

  if (error) return <p className="onto-a2ui-error">{error}</p>;
  if (!surface) return <p className="onto-a2ui-muted">Rendering…</p>;

  return (
    <div className="onto-app-a2ui a2ui-light">
      <A2uiSurface surface={surface as never} />
    </div>
  );
}
