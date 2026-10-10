import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { Crosshair, Expand, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { LinkTypeResponse, ObjectTypeResponse } from '../../data/ontologyApi';
import type { OntologyActionTypeResponse, OntologyFunctionResponse } from '../../data/ontologyFunctionsApi';
import {
  buildOntologySchemaGraph,
  graphDataForLayoutMode,
  ontologySchemaNodeColor,
  zoomOntologySchemaGraph,
  type OntologySchemaLink,
  type OntologySchemaNode,
} from '../../graph/ontologySchemaGraphModel';
import './ObjectExplorer.scss';

type LayoutMode = 'schema' | 'lr' | 'rl' | 'td' | 'bu' | 'radialout' | 'radialin';

const ACTION_STROKE = '#d97706';
const FUNCTION_STROKE = '#0d9488';
const LOGIC_LINK_COLOR = 'rgba(100, 116, 139, 0.55)';

export function OntologySchemaGraph({
  objectTypes,
  linkTypes,
  functions = [],
  actionTypes = [],
}: {
  objectTypes: ObjectTypeResponse[];
  linkTypes: LinkTypeResponse[];
  functions?: OntologyFunctionResponse[];
  actionTypes?: OntologyActionTypeResponse[];
}) {
  const { t: tExplore } = useTranslation('explore');
  const { t } = useTranslation('objectExplorer');
  const navigate = useNavigate();
  const graphRef = useRef<ForceGraphMethods<OntologySchemaNode, OntologySchemaLink> | undefined>(undefined);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('schema');
  // Schema-only by default; overlays are opt-in so the first view stays readable.
  const [showActions, setShowActions] = useState(false);
  const [showFunctions, setShowFunctions] = useState(false);

  const baseGraphData = useMemo(
    () => buildOntologySchemaGraph(objectTypes, linkTypes),
    [objectTypes, linkTypes],
  );

  const graphData = useMemo(
    () =>
      graphDataForLayoutMode(baseGraphData, layoutMode, {
        showActions,
        showFunctions,
        actions: actionTypes,
        functions,
        linkTypes,
      }),
    [baseGraphData, layoutMode, showActions, showFunctions, actionTypes, functions, linkTypes],
  );

  const colorForIndex = useCallback((index: number) => ontologySchemaNodeColor(index), []);

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setGraphSize({ width: Math.round(width), height: Math.round(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitView = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    zoomOntologySchemaGraph(g);
  }, []);

  useEffect(() => {
    if (graphSize.width <= 0 || graphSize.height <= 0) return;
    const timer = window.setTimeout(fitView, 80);
    return () => window.clearTimeout(timer);
  }, [graphSize.width, graphSize.height, graphData, layoutMode, fitView]);

  const zoomIn = useCallback(() => {
    const g = graphRef.current;
    if (g?.zoom) g.zoom(g.zoom() * 1.3, 200);
  }, []);

  const zoomOut = useCallback(() => {
    const g = graphRef.current;
    if (g?.zoom) g.zoom(g.zoom() / 1.3, 200);
  }, []);

  const centerView = useCallback(() => {
    graphRef.current?.centerAt?.(0, 0, 200);
  }, []);

  const reheatLayout = useCallback(() => {
    fitView();
  }, [fitView]);

  if (graphData.nodes.length === 0) {
    return <p className="ontology-graph-empty">{tExplore('ontology.graphEmpty')}</p>;
  }

  return (
    <div className="ontology-graph-wrap">
      <p className="ontology-graph-hint">{tExplore('ontology.graphHint')}</p>
      <div className="ontology-graph-layers" role="group" aria-label={tExplore('ontology.graphLayersAria')}>
        <label className="ontology-graph-layer">
          <input
            type="checkbox"
            className="ds-checkbox"
            checked={showActions}
            onChange={(e) => setShowActions(e.target.checked)}
          />
          {tExplore('ontology.graphShowActions')}
        </label>
        <label className="ontology-graph-layer">
          <input
            type="checkbox"
            className="ds-checkbox"
            checked={showFunctions}
            onChange={(e) => setShowFunctions(e.target.checked)}
          />
          {tExplore('ontology.graphShowFunctions')}
        </label>
      </div>
      <div ref={graphContainerRef} className="ontology-graph-canvas">
        <div className="object-explorer-layout-controls">
          <select
            className="object-explorer-layout-select"
            value={layoutMode}
            onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
            title={t('layoutMode')}
            aria-label={t('layoutMode')}
          >
            <option value="schema">{tExplore('ontology.layoutSchema')}</option>
            <option value="lr">{t('layoutLr')}</option>
            <option value="rl">{t('layoutRl')}</option>
            <option value="td">{t('layoutTd')}</option>
            <option value="bu">{t('layoutBu')}</option>
            <option value="radialout">{t('layoutRadialOut')}</option>
            <option value="radialin">{t('layoutRadialIn')}</option>
          </select>
          <button
            type="button"
            className="object-explorer-graph-control-btn"
            onClick={reheatLayout}
            title={t('reheatLayout')}
            aria-label={t('reheatLayout')}
          >
            <RotateCcw size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="object-explorer-graph-control-btn"
            onClick={centerView}
            title={t('centerView')}
            aria-label={t('centerView')}
          >
            <Crosshair size={16} aria-hidden />
          </button>
        </div>
        <div className="object-explorer-graph-controls">
          <button
            type="button"
            className="object-explorer-graph-control-btn"
            onClick={zoomIn}
            title={t('zoomIn')}
            aria-label={t('zoomIn')}
          >
            <ZoomIn size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="object-explorer-graph-control-btn"
            onClick={zoomOut}
            title={t('zoomOut')}
            aria-label={t('zoomOut')}
          >
            <ZoomOut size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="object-explorer-graph-control-btn"
            onClick={fitView}
            title={t('zoomToFit')}
            aria-label={t('zoomToFit')}
          >
            <Expand size={16} aria-hidden />
          </button>
        </div>
        {graphSize.width > 0 && graphSize.height > 0 ? (
          <ForceGraph2D
            key={`${layoutMode}-${showActions}-${showFunctions}`}
            ref={graphRef}
            graphData={graphData}
            width={graphSize.width}
            height={graphSize.height}
            cooldownTicks={0}
            warmupTicks={0}
            onEngineStop={fitView}
            nodeLabel={(n) => {
              const node = n as OntologySchemaNode;
              const kind = node.kind ?? 'object';
              if (kind === 'action') return `${node.name}\n${tExplore('ontology.graphNodeAction')}`;
              if (kind === 'function') return `${node.name}\n${tExplore('ontology.graphNodeFunction')}`;
              return `${node.name}\n${tExplore('ontology.instanceCount', { count: node.instanceCount })}`;
            }}
            linkLabel={(l) => {
              const link = l as OntologySchemaLink;
              const kind = link.kind ?? 'linkType';
              if (kind === 'appliesTo') return tExplore('ontology.graphEdgeAppliesTo');
              if (kind === 'affiliatedWith') return tExplore('ontology.graphEdgeAffiliated');
              if (kind === 'bindsFunction') return tExplore('ontology.graphEdgeBinds');
              return `${link.name} (${link.cardinality})`;
            }}
            onNodeClick={(n) => {
              const node = n as OntologySchemaNode;
              const kind = node.kind ?? 'object';
              if (kind === 'action') {
                void navigate(`/ontology-manager/action-types/${node.id}`);
                return;
              }
              if (kind === 'function') {
                void navigate(`/ontology-manager/functions/${node.id}`);
                return;
              }
              void navigate(`/object-explorer/objects/${node.id}`);
            }}
            onLinkClick={(l) => {
              const link = l as OntologySchemaLink;
              if ((link.kind ?? 'linkType') !== 'linkType') return;
              void navigate(`/object-explorer/links/${link.id}`);
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as OntologySchemaNode & { x?: number; y?: number };
              const kind = n.kind ?? 'object';
              const label = (n.name ?? n.id ?? t('nodeFallback')).slice(0, 24);
              const fontSize = Math.max(10, 12 / globalScale);
              ctx.font = `${fontSize}px system-ui, sans-serif`;
              const textWidth = ctx.measureText(label).width;
              const w = textWidth + 10;
              const h = fontSize + 8;
              const x = (n.x ?? 0) - w / 2;
              const y = (n.y ?? 0) - h / 2;
              let strokeColor = ACTION_STROKE;
              if (kind === 'function') strokeColor = FUNCTION_STROKE;
              else if (kind === 'object') {
                const objIdx = objectTypes.findIndex((ot) => ot.id === n.id);
                strokeColor = colorForIndex(objIdx >= 0 ? objIdx : 0);
              }
              ctx.fillStyle = kind === 'object' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(248, 250, 252, 0.98)';
              ctx.strokeStyle = strokeColor;
              ctx.lineWidth = (kind === 'object' ? 1.5 : 1.25) / globalScale;
              ctx.beginPath();
              if (kind === 'object' && typeof ctx.roundRect === 'function') {
                ctx.roundRect(x, y, w, h, 4);
              } else if (kind === 'object') {
                ctx.rect(x, y, w, h);
              } else {
                // Smaller chip for logic nodes
                const chipH = h * 0.9;
                const chipY = (n.y ?? 0) - chipH / 2;
                if (typeof ctx.roundRect === 'function') {
                  ctx.roundRect(x, chipY, w, chipH, kind === 'action' ? 2 : 8);
                } else {
                  ctx.rect(x, chipY, w, chipH);
                }
              }
              ctx.fill();
              ctx.stroke();
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = '#1f2937';
              ctx.fillText(label, n.x ?? 0, n.y ?? 0);
            }}
            linkColor={(link) => {
              const l = link as OntologySchemaLink;
              if ((l.kind ?? 'linkType') !== 'linkType') return LOGIC_LINK_COLOR;
              const idx = linkTypes.findIndex((lt) => lt.id === l.id);
              return idx >= 0 ? colorForIndex(idx) : 'rgba(100,100,100,0.6)';
            }}
            linkWidth={(link) => ((link as OntologySchemaLink).kind ?? 'linkType') === 'linkType' ? 1.5 : 1}
            linkDirectionalArrowLength={6}
            linkDirectionalArrowRelPos={1}
            linkCurvature={(link) => ((link as OntologySchemaLink).kind ?? 'linkType') === 'linkType' ? 0 : 0.15}
            backgroundColor="#f8fafc"
          />
        ) : null}
      </div>
    </div>
  );
}
