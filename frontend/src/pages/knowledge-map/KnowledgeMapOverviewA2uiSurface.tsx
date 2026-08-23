import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { A2uiSurface } from '@a2ui/react/v0_9';
import type { OverviewView } from '../../data/knowledgeMapApi';
import { kmOverviewCatalog, KM_OVERVIEW_A2UI_SURFACE_ID } from './kmOverviewA2uiCatalog';
import './KnowledgeMapOverview.scss';

type Props = {
  view: OverviewView;
  a2uiMessages?: Record<string, unknown>[];
};

type RenderState = {
  surfaces: unknown[];
  error: string | null;
};

/** Mirror backend normalize: Card/Button use `child`, not `children`. */
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
      if (name === 'Card' && Array.isArray(c.child)) {
        const kids = c.child as unknown[];
        if (kids.length === 1 && typeof kids[0] === 'string') {
          c.child = kids[0];
        } else if (kids.length > 0 && kids.every((k) => typeof k === 'string')) {
          const wrapId = `${String(c.id ?? 'wrap')}-inner`;
          extras.push({ id: wrapId, component: 'Column', children: kids });
          c.child = wrapId;
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

function processA2ui(messages: Record<string, unknown>[]): RenderState {
  if (!messages.length) {
    return { surfaces: [], error: null };
  }
  const normalized = normalizeA2uiMessages(messages);
  const processor = new MessageProcessor([kmOverviewCatalog]);
  try {
    processor.processMessages(normalized as never[]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('A2UI processMessages failed', e);
    return { surfaces: [], error: msg };
  }
  const surfaces = Array.from(processor.model.surfacesMap.values());
  const surface = surfaces.find((s) => (s as { id?: string }).id === KM_OVERVIEW_A2UI_SURFACE_ID) ?? surfaces[0];
  if (!surface) {
    return { surfaces: [], error: 'No A2UI surface was created' };
  }
  const root = (surface as { componentsModel?: { get: (id: string) => unknown } }).componentsModel?.get(
    'root',
  );
  if (!root) {
    return {
      surfaces: [],
      error: "A2UI messages are missing component id 'root' (required by the Overview canvas)",
    };
  }
  return { surfaces: [surface], error: null };
}

export function KnowledgeMapOverviewA2uiSurface({ view, a2uiMessages }: Props) {
  const { t } = useTranslation('knowledgeMap');
  const messages = a2uiMessages ?? view.a2ui_messages ?? [];
  const [render, setRender] = useState<RenderState>(() => processA2ui(messages));

  useEffect(() => {
    setRender(processA2ui(messages));
  }, [messages]);

  return (
    <article className="km-overview-canvas">
      {view.stale ? (
        <div className="km-overview-banner km-overview-banner--stale" role="status">
          {t('overviewStaleBanner')}
        </div>
      ) : null}
      {view.synthesized && !view.has_composition ? (
        <div className="km-overview-banner" role="status">
          {t('overviewSynthesizedBanner')}
        </div>
      ) : null}
      {render.error ? (
        <div className="km-overview-banner km-overview-banner--warn" role="alert">
          {t('overviewA2uiRenderFailed')}
          <div className="km-overview-a2ui-error-detail">{render.error}</div>
        </div>
      ) : null}

      <div className="km-overview-a2ui a2ui-platform-surface a2ui-light">
        {!render.error && render.surfaces.length === 0 ? (
          <p className="km-overview-empty">{t('overviewEmptySections')}</p>
        ) : null}
        {!render.error
          ? render.surfaces.map((surface) => {
              const id = (surface as { id: string }).id;
              return (
                <div key={id} className="km-overview-a2ui__surface a2ui-light">
                  <A2uiSurface surface={surface as never} />
                </div>
              );
            })
          : null}
      </div>
    </article>
  );
}
