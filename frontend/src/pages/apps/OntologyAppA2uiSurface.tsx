import { useEffect, useState } from 'react';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { A2uiSurface } from '@a2ui/react/v0_9';
import {
  ontologyAppCatalog,
  ONTOLOGY_APP_A2UI_SURFACE_ID,
} from './ontologyAppA2uiCatalog';
import './OntologyAppA2ui.scss';

type Props = {
  a2uiMessages: Record<string, unknown>[];
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

export function OntologyAppA2uiSurface({ a2uiMessages }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [surface, setSurface] = useState<unknown | null>(null);

  useEffect(() => {
    if (!a2uiMessages.length) {
      setSurface(null);
      setError(null);
      return;
    }
    try {
      const processor = new MessageProcessor([ontologyAppCatalog]);
      processor.processMessages(normalizeA2uiMessages(a2uiMessages) as never[]);
      const surfaces = Array.from(processor.model.surfacesMap.values());
      const surf =
        surfaces.find((s) => (s as { id?: string }).id === ONTOLOGY_APP_A2UI_SURFACE_ID) ?? surfaces[0];
      if (!surf) {
        setError('No A2UI surface was created');
        setSurface(null);
        return;
      }
      const root = (surf as { componentsModel?: { get: (id: string) => unknown } }).componentsModel?.get(
        'root',
      );
      if (!root) {
        setError("A2UI messages are missing component id 'root'");
        setSurface(null);
        return;
      }
      setSurface(surf);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSurface(null);
    }
  }, [a2uiMessages]);

  if (error) return <p className="onto-kanban__error">{error}</p>;
  if (!surface) return <p className="onto-kanban__muted">Rendering…</p>;

  return (
    <div className="onto-app-a2ui a2ui-light">
      <A2uiSurface surface={surface as never} />
    </div>
  );
}
