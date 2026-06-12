import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { Crosshair, Expand, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { LinkTypeResponse, ObjectTypeResponse } from '../../data/ontologyApi';
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

export function OntologySchemaGraph({
  objectTypes,
  linkTypes,
}: {
  objectTypes: ObjectTypeResponse[];
  linkTypes: LinkTypeResponse[];
}) {
  const { t: tExplore } = useTranslation('explore');
  const { t } = useTranslation('objectExplorer');
  const navigate = useNavigate();
  const graphRef = useRef<ForceGraphMethods<OntologySchemaNode, OntologySchemaLink> | undefined>(undefined);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('schema');

  const baseGraphData = useMemo(
    () => buildOntologySchemaGraph(objectTypes, linkTypes),
    [objectTypes, linkTypes]
  );

  const graphData = useMemo(
    () => graphDataForLayoutMode(baseGraphData, layoutMode),
    [baseGraphData, layoutMode]
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
            key={layoutMode}
            ref={graphRef}
            graphData={graphData}
            width={graphSize.width}
            height={graphSize.height}
            cooldownTicks={0}
            warmupTicks={0}
            onEngineStop={fitView}
            nodeLabel={(n) => {
              const node = n as OntologySchemaNode;
              return `${node.name}\n${tExplore('ontology.instanceCount', { count: node.instanceCount })}`;
            }}
            linkLabel={(l) => {
              const link = l as OntologySchemaLink;
              return `${link.name} (${link.cardinality})`;
            }}
            onNodeClick={(n) => {
              const node = n as OntologySchemaNode;
              void navigate(`/objects/${node.id}`);
            }}
            onLinkClick={(l) => {
              const link = l as OntologySchemaLink;
              void navigate(`/links/${link.id}`);
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as OntologySchemaNode & { x?: number; y?: number };
              const label = (n.name ?? n.id ?? t('nodeFallback')).slice(0, 24);
              const fontSize = Math.max(10, 12 / globalScale);
              ctx.font = `${fontSize}px system-ui, sans-serif`;
              const textWidth = ctx.measureText(label).width;
              const w = textWidth + 10;
              const h = fontSize + 8;
              const x = (n.x ?? 0) - w / 2;
              const y = (n.y ?? 0) - h / 2;
              const objIdx = objectTypes.findIndex((ot) => ot.id === n.id);
              const strokeColor = colorForIndex(objIdx >= 0 ? objIdx : 0);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
              ctx.strokeStyle = strokeColor;
              ctx.lineWidth = 1.5 / globalScale;
              ctx.beginPath();
              if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(x, y, w, h, 4);
              } else {
                ctx.rect(x, y, w, h);
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
              const idx = linkTypes.findIndex((lt) => lt.id === l.id);
              return idx >= 0 ? colorForIndex(idx) : 'rgba(100,100,100,0.6)';
            }}
            linkWidth={1.5}
            linkDirectionalArrowLength={6}
            linkDirectionalArrowRelPos={1}
            linkCurvature={0}
            backgroundColor="#f8fafc"
          />
        ) : null}
      </div>
    </div>
  );
}
