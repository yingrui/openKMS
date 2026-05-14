import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { Box, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crosshair, Expand, Link2, Maximize2, Minimize2, Play, Loader2, List, Network, RotateCcw, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchObjectTypes,
  fetchLinkTypes,
  executeCypherQuery,
  generateCypherFromQuestion,
  summarizeAnswer,
  type ObjectTypeResponse,
  type LinkTypeResponse,
} from '../../data/ontologyApi';
import './ObjectExplorer.css';

/** Convert object type name to Neo4j label (alphanumeric, underscore) */
function neo4jLabel(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9_]/g, '_');
  return s || 'Node';
}

/** Convert link type name to Neo4j relationship type. Preserves case — link_type names are stored in lower_snake_case (e.g. governed_by, covers) and indexed verbatim in Neo4j. */
function neo4jRelType(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9_]/g, '_');
  return s || 'relates_to';
}

function buildCypher(
  selectedObjectTypes: ObjectTypeResponse[],
  selectedLinkTypes: LinkTypeResponse[]
): string {
  if (selectedLinkTypes.length > 0) {
    const matchParts: string[] = [];
    const returnParts: string[] = [];
    let nodeIdx = 0;
    let relIdx = 0;
    // Assign unique variable per link role so (Disease)-[HAS_PARENT]->(Disease) gets two vars, not one
    const varForNode = () => {
      const v = String.fromCharCode(97 + (nodeIdx % 26)) + (nodeIdx >= 26 ? String(Math.floor(nodeIdx / 26)) : '');
      nodeIdx += 1;
      return v;
    };
    for (const lt of selectedLinkTypes) {
      const srcLabel = lt.source_object_type_name
        ? neo4jLabel(lt.source_object_type_name)
        : 'Node';
      const tgtLabel = lt.target_object_type_name
        ? neo4jLabel(lt.target_object_type_name)
        : 'Node';
      const rel = neo4jRelType(lt.name);
      const a = varForNode();
      const b = varForNode();
      const r = `r${relIdx++}`;
      matchParts.push(`(${a}:${srcLabel})-[${r}:${rel}]->(${b}:${tgtLabel})`);
      returnParts.push(a, r, b);
    }
    const match = matchParts.join(', ');
    const ret = [...new Set(returnParts)].join(', ');
    return `MATCH ${match}\nRETURN ${ret}\nLIMIT 100`;
  }
  if (selectedObjectTypes.length > 0) {
    const first = selectedObjectTypes[0];
    const label = neo4jLabel(first.name);
    return `MATCH (n:${label})\nRETURN n\nLIMIT 100`;
  }
  return '';
}

function formatCellValue(v: unknown, dash: string): string {
  if (v === null || v === undefined) return dash;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function isNodeLike(obj: unknown): obj is Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o);
  return keys.length > 0 && ('id' in o || 'name' in o || keys.length >= 2);
}

function getNodeLabel(obj: Record<string, unknown>, nodeFallback: string): string {
  if (typeof obj.name === 'string') return obj.name;
  if (obj.id != null) return String(obj.id);
  const first = Object.values(obj).find((v) => v != null && v !== '');
  return first != null ? String(first) : nodeFallback;
}

function getNodeId(obj: Record<string, unknown>, fallback: string): string {
  if (obj._id != null) return `n-${String(obj._id)}`;
  if (obj.id != null) return `n-${String(obj.id)}`;
  return fallback;
}

/** Default palette for object/link types (Neo4j Browser style) */
const DEFAULT_COLORS = [
  '#4f46e5', '#059669', '#dc2626', '#d97706', '#7c3aed', '#0d9488',
  '#be185d', '#2563eb', '#16a34a', '#ea580c',
];

function getDefaultColor(index: number): string {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

type GraphNode = { id: string; name: string; objectTypeId?: string };
type GraphLink = { source: string; target: string; linkTypeId?: string };

const DAG_LAYOUT_I18N_KEY: Record<string, string> = {
  '': 'layoutDefault',
  lr: 'layoutLr',
  rl: 'layoutRl',
  td: 'layoutTd',
  bu: 'layoutBu',
  radialout: 'layoutRadialOut',
  radialin: 'layoutRadialIn',
};

/** Build column-index-to-objectTypeId mapping from selected link types (mirrors buildCypher: each link adds src, tgt in order). */
function buildNodeColIndexToObjectType(selectedLinks: LinkTypeResponse[]): string[] {
  const order: string[] = [];
  for (const lt of selectedLinks) {
    order.push(lt.source_object_type_id);
    order.push(lt.target_object_type_id);
  }
  return order;
}

/** Build graph data for force-directed layout. Nodes have id, name, optional objectTypeId; links have source, target, optional linkTypeId. */
function resultToGraph(
  result: { columns: string[]; rows: Record<string, unknown>[] },
  selectedLinks: LinkTypeResponse[],
  selectedObjects: ObjectTypeResponse[],
  nodeFallback: string,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeMap = new Map<string, GraphNode>();
  const linkSet = new Set<string>();

  const nodeColIndexToObjectType = selectedLinks.length > 0
    ? buildNodeColIndexToObjectType(selectedLinks)
    : selectedObjects.length > 0
      ? [selectedObjects[0].id]
      : [];

  result.rows.forEach((row, rowIdx) => {
    const nodeColumns: { col: string; obj: Record<string, unknown> }[] = [];
    result.columns.forEach((col) => {
      const v = row[col];
      if (isNodeLike(v)) nodeColumns.push({ col, obj: v });
    });

    nodeColumns.forEach(({ col, obj }, idx) => {
      const id = getNodeId(obj, `n-${col}-${rowIdx}`);
      if (!nodeMap.has(id)) {
        const objectTypeId = nodeColIndexToObjectType[idx];
        nodeMap.set(id, { id, name: getNodeLabel(obj, nodeFallback), ...(objectTypeId && { objectTypeId }) });
      }
    });

    for (let i = 0; i < nodeColumns.length - 1; i++) {
      const srcId = getNodeId(nodeColumns[i].obj, `n-${nodeColumns[i].col}-${rowIdx}`);
      const tgtId = getNodeId(nodeColumns[i + 1].obj, `n-${nodeColumns[i + 1].col}-${rowIdx}`);
      const key = `${srcId}→${tgtId}`;
      if (!linkSet.has(key)) {
        linkSet.add(key);
        const linkTypeId = i < selectedLinks.length ? selectedLinks[i].id : undefined;
        links.push({ source: srcId, target: tgtId, ...(linkTypeId && { linkTypeId }) });
      }
    }
  });

  nodes.push(...nodeMap.values());
  return { nodes, links };
}

export function ObjectExplorer() {
  const { t } = useTranslation('objectExplorer');
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkTypeResponse[]>([]);
  const [selectedObjectTypeIds, setSelectedObjectTypeIds] = useState<Set<string>>(new Set());
  const [selectedLinkTypeIds, setSelectedLinkTypeIds] = useState<Set<string>>(new Set());
  const [cypherInput, setCypherInput] = useState('');
  const [userQuestion, setUserQuestion] = useState('');
  const [mockedAnswer, setMockedAnswer] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [answerExpanded, setAnswerExpanded] = useState(false);
  const [userQOpen, setUserQOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [resultView, setResultView] = useState<'list' | 'graph'>('list');
  const [stylePanelOpen, setStylePanelOpen] = useState(true);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [dagLayoutMode, setDagLayoutMode] = useState<'' | 'lr' | 'rl' | 'td' | 'bu' | 'radialout' | 'radialin'>('');
  const [objectTypeColors, setObjectTypeColors] = useState<Record<string, string>>({});
  const [linkTypeColors, setLinkTypeColors] = useState<Record<string, string>>({});

  const getObjectTypeColor = useCallback(
    (objectTypeId: string, index: number) =>
      objectTypeColors[objectTypeId] ?? getDefaultColor(index),
    [objectTypeColors]
  );
  const getLinkTypeColor = useCallback(
    (linkTypeId: string, index: number) =>
      linkTypeColors[linkTypeId] ?? getDefaultColor(index),
    [linkTypeColors]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [objRes, linkRes] = await Promise.all([
        fetchObjectTypes({ countFromNeo4j: true }),
        fetchLinkTypes({ countFromNeo4j: true }),
      ]);
      setObjectTypes(objRes.items);
      setLinkTypes(linkRes.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toastLoadTypesFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedObjects = objectTypes.filter((t) => selectedObjectTypeIds.has(t.id));
  const selectedLinks = linkTypes.filter((t) => selectedLinkTypeIds.has(t.id));

  useEffect(() => {
    const generated = buildCypher(selectedObjects, selectedLinks);
    setCypherInput(generated);
    // selectedObjects/selectedLinks are new arrays each render; IDs + catalogs are the stable inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- adding derived arrays would retrigger every render
  }, [selectedObjectTypeIds, selectedLinkTypeIds, objectTypes, linkTypes]);

  const toggleObjectType = (id: string) => {
    setSelectedObjectTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLinkType = (id: string) => {
    setSelectedLinkTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const graphData = useMemo(() => {
    if (!result || result.rows.length === 0) return null;
    return resultToGraph(result, selectedLinks, selectedObjects, t('nodeFallback'));
  }, [result, selectedLinks, selectedObjects, t]);

  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>(undefined);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });

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
  }, [resultView, canvasFullscreen]);

  useEffect(() => {
    const g = graphRef.current;
    if (g && graphData) {
      const charge = g.d3Force('charge');
      if (charge && typeof charge.strength === 'function') {
        charge.strength(dagLayoutMode ? -500 : -400);
      }
      const link = g.d3Force('link');
      if (link && typeof link.distance === 'function') {
        link.distance(dagLayoutMode ? 150 : 80);
      }
    }
  }, [graphData, resultView, dagLayoutMode]);

  // ESC closes any expanded overlay (answer card or graph fullscreen)
  useEffect(() => {
    if (!answerExpanded && !canvasFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (answerExpanded) setAnswerExpanded(false);
        if (canvasFullscreen) setCanvasFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answerExpanded, canvasFullscreen]);

  const handleExecute = async () => {
    const query = cypherInput.trim();
    if (!query) {
      toast.error(t('toastQueryEmpty'));
      return;
    }
    setExecuting(true);
    setResult(null);
    try {
      const data = await executeCypherQuery(query);
      setResult(data);
      toast.success(t('toastReturnedRows', { count: data.rows.length }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toastQueryFailed'));
    } finally {
      setExecuting(false);
    }
  };

  /**
   * Real text-to-Cypher pipeline:
   *   1. POST /api/ontology/text-to-cypher  -> LLM generates Cypher from the user question + ontology schema.
   *   2. POST /api/ontology/explore         -> run the Cypher against Neo4j.
   *   3. POST /api/ontology/answer          -> LLM summarises the rows into a final NL answer.
   * Fails are surfaced as toasts; partial successes still show whatever's available.
   */
  const handleAskQuestion = async () => {
    const q = userQuestion.trim();
    if (!q) {
      toast.error('Type a question or pick one from the dropdown');
      return;
    }
    setGenerating(true);
    setMockedAnswer(null);
    setResult(null);
    setCypherInput('');

    let cypher = '';
    try {
      const gen = await generateCypherFromQuestion(q);
      cypher = (gen.cypher || '').trim();
      if (!cypher) {
        toast.error(gen.explanation || 'Could not generate Cypher for this question');
        return;
      }
      setCypherInput(cypher);
    } catch (e) {
      toast.error(e instanceof Error ? `Cypher gen failed: ${e.message}` : 'Cypher gen failed');
      return;
    } finally {
      setGenerating(false);
    }

    setExecuting(true);
    let data: { columns: string[]; rows: Record<string, unknown>[] } | null = null;
    try {
      data = await executeCypherQuery(cypher);
      setResult(data);
      setResultView('graph');
      toast.success(`Generated Cypher → ${data.rows.length} rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Query failed');
      return;
    } finally {
      setExecuting(false);
    }

    // Summarise answer (best-effort — graph + cypher already shown)
    try {
      const ans = await summarizeAnswer({
        question: q,
        cypher,
        columns: data.columns,
        rows: data.rows,
      });
      setMockedAnswer(ans.answer || '(LLM returned an empty answer.)');
    } catch (e) {
      setMockedAnswer(
        `(Answer summarisation failed: ${e instanceof Error ? e.message : 'unknown'}. ` +
          `Look at the graph / list view above.)`
      );
    }
  };

  return (
    <div className="object-explorer">
      <div className="object-explorer-layout">
        <aside className="object-explorer-sidebar">
          <h3 className="object-explorer-sidebar-title">{t('objectTypesHeading')}</h3>
          {loading ? (
            <p className="object-explorer-loading">{t('loadingSidebar')}</p>
          ) : (
            <ul className="object-explorer-type-list">
              {objectTypes.map((ot) => (
                <li key={ot.id} className="object-explorer-type-item">
                  <label className="object-explorer-type-row">
                    <input
                      type="checkbox"
                      checked={selectedObjectTypeIds.has(ot.id)}
                      onChange={() => toggleObjectType(ot.id)}
                      className="object-explorer-type-checkbox"
                    />
                    <Box size={16} aria-hidden />
                    <span className="object-explorer-type-label">{ot.name}</span>
                    <span className="object-explorer-type-count">{ot.instance_count}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <h3 className="object-explorer-sidebar-title">{t('linkTypesHeading')}</h3>
          {loading ? null : (
            <ul className="object-explorer-type-list">
              {linkTypes.map((lt) => (
                <li key={lt.id} className="object-explorer-type-item">
                  <label className="object-explorer-type-row">
                    <input
                      type="checkbox"
                      checked={selectedLinkTypeIds.has(lt.id)}
                      onChange={() => toggleLinkType(lt.id)}
                      className="object-explorer-type-checkbox"
                    />
                    <Link2 size={16} aria-hidden />
                    <span className="object-explorer-type-label" title={lt.name}>
                      {lt.source_object_type_name} —[{lt.name}]→ {lt.target_object_type_name}
                    </span>
                    <span className="object-explorer-type-count">{lt.link_count}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <main className="object-explorer-main">
          <div className="object-explorer-search-bar">
            <div className={`object-explorer-userq-wrap${userQOpen ? '' : ' object-explorer-userq-collapsed'}`}>
              <button
                type="button"
                className="object-explorer-userq-header"
                onClick={() => setUserQOpen((v) => !v)}
                aria-expanded={userQOpen}
                aria-controls="object-explorer-userq-body"
              >
                <Sparkles size={14} aria-hidden />
                <span className="object-explorer-userq-title">Ask in plain language</span>
                <span className="object-explorer-userq-badge">text-to-cypher</span>
                {!userQOpen && userQuestion.trim() && (
                  <span className="object-explorer-userq-preview" title={userQuestion}>
                    {userQuestion.length > 60 ? userQuestion.slice(0, 60) + '…' : userQuestion}
                  </span>
                )}
                <span className="object-explorer-userq-chevron" aria-hidden>
                  {userQOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>
              {userQOpen && (
                <div id="object-explorer-userq-body" className="object-explorer-userq-body">
                  <textarea
                    id="object-explorer-userq"
                    className="object-explorer-userq-input"
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                    placeholder="Ask a graph-shaped question in plain language; the LLM will translate it to Cypher against the current schema."
                    rows={2}
                  />
                  <div className="object-explorer-userq-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAskQuestion}
                      disabled={generating || executing || !userQuestion.trim()}
                      title="Translates the question to Cypher via the LLM, runs it against the graph, and summarises the rows back to natural language."
                    >
                      {generating ? (
                        <>
                          <Loader2 size={16} className="object-explorer-spinner" />
                          Generating Cypher...
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          Generate Cypher & Run
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="object-explorer-cypher-wrap">
              <label htmlFor="object-explorer-cypher" className="object-explorer-cypher-label">
                {t('cypherLabel')}
              </label>
              <textarea
                id="object-explorer-cypher"
                className="object-explorer-cypher-input"
                value={cypherInput}
                onChange={(e) => setCypherInput(e.target.value)}
                placeholder={t('cypherPlaceholder')}
                rows={3}
              />
            </div>
            <div className="object-explorer-search-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExecute}
                disabled={executing || !cypherInput.trim()}
              >
                {executing ? (
                  <>
                    <Loader2 size={18} className="object-explorer-spinner" />
                    {t('running')}
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    {t('execute')}
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="object-explorer-results">
            {mockedAnswer && (
              <div
                className={`object-explorer-answer-card${answerExpanded ? ' object-explorer-answer-card-fullscreen' : ''}`}
                role={answerExpanded ? 'dialog' : undefined}
                aria-modal={answerExpanded || undefined}
              >
                <div className="object-explorer-answer-header">
                  <Sparkles size={16} aria-hidden />
                  <span>Final Answer (grounded in graph)</span>
                  <button
                    type="button"
                    className="object-explorer-answer-maximize"
                    onClick={() => setAnswerExpanded((v) => !v)}
                    title={answerExpanded ? 'Restore (Esc)' : 'Maximize'}
                    aria-label={answerExpanded ? 'Restore' : 'Maximize'}
                  >
                    {answerExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                </div>
                <div className="object-explorer-answer-body">{mockedAnswer}</div>
              </div>
            )}
            {result === null ? (
              <p className="object-explorer-results-placeholder">{t('resultsPlaceholder')}</p>
            ) : result.rows.length === 0 ? (
              <p className="object-explorer-results-empty">{t('noRows')}</p>
            ) : (
              <>
                <div className="object-explorer-view-toggle">
                  <button
                    type="button"
                    className={`object-explorer-view-btn ${resultView === 'list' ? 'active' : ''}`}
                    onClick={() => setResultView('list')}
                    title={t('listViewTitle')}
                  >
                    <List size={16} />
                    <span>{t('listView')}</span>
                  </button>
                  <button
                    type="button"
                    className={`object-explorer-view-btn ${resultView === 'graph' ? 'active' : ''}`}
                    onClick={() => setResultView('graph')}
                    title={t('graphViewTitle')}
                  >
                    <Network size={16} />
                    <span>{t('graphView')}</span>
                  </button>
                  {resultView === 'graph' && (
                    <button
                      type="button"
                      className="object-explorer-view-btn object-explorer-view-btn-icon"
                      onClick={() => setCanvasFullscreen((v) => !v)}
                      title={canvasFullscreen ? 'Exit fullscreen (Esc)' : 'Maximize graph'}
                      aria-label={canvasFullscreen ? 'Exit fullscreen' : 'Maximize graph'}
                    >
                      {canvasFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                  )}
                </div>
                {resultView === 'list' ? (
              <div className="object-explorer-table-wrap">
                <table className="object-explorer-table">
                  <thead>
                    <tr>
                      {result.columns.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        {result.columns.map((col) => (
                          <td key={col}>
                            {typeof row[col] === 'object' && row[col] !== null ? (
                              <pre className="object-explorer-cell-json">
                                {JSON.stringify(row[col], null, 2)}
                              </pre>
                            ) : (
                              formatCellValue(row[col], t('dash'))
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
                ) : graphData ? (
                  <div
                    ref={graphContainerRef}
                    className={`object-explorer-graph ${canvasFullscreen ? 'object-explorer-graph-fullscreen' : ''}`}
                  >
                    <div className="object-explorer-layout-controls">
                      <select
                        className="object-explorer-layout-select"
                        value={dagLayoutMode}
                        onChange={(e) =>
                          setDagLayoutMode(
                            e.target.value as '' | 'lr' | 'rl' | 'td' | 'bu' | 'radialout' | 'radialin'
                          )
                        }
                        title={t('layoutMode')}
                        aria-label={t('layoutMode')}
                      >
                        <option value="">{t('layoutDefault')}</option>
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
                        onClick={() => {
                          const g = graphRef.current;
                          if (g && typeof g.d3ReheatSimulation === 'function') g.d3ReheatSimulation();
                        }}
                        title={t('reheatLayout')}
                        aria-label={t('reheatLayout')}
                      >
                        <RotateCcw size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="object-explorer-graph-control-btn"
                        onClick={() => {
                          const g = graphRef.current;
                          if (g && typeof g.centerAt === 'function') g.centerAt(0, 0, 200);
                        }}
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
                        onClick={() => {
                          const g = graphRef.current;
                          if (g && typeof g.zoom === 'function') {
                            const s = g.zoom();
                            g.zoom(s * 1.3, 200);
                          }
                        }}
                        title={t('zoomIn')}
                        aria-label={t('zoomIn')}
                      >
                        <ZoomIn size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="object-explorer-graph-control-btn"
                        onClick={() => {
                          const g = graphRef.current;
                          if (g && typeof g.zoom === 'function') {
                            const s = g.zoom();
                            g.zoom(s / 1.3, 200);
                          }
                        }}
                        title={t('zoomOut')}
                        aria-label={t('zoomOut')}
                      >
                        <ZoomOut size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="object-explorer-graph-control-btn"
                        onClick={() => {
                          const g = graphRef.current;
                          if (g && typeof g.zoomToFit === 'function') g.zoomToFit(200, 50);
                        }}
                        title={t('zoomToFit')}
                        aria-label={t('zoomToFit')}
                      >
                        <Expand size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="object-explorer-graph-control-btn"
                        onClick={() => setCanvasFullscreen((v) => !v)}
                        title={canvasFullscreen ? t('exitFullscreen') : t('fullscreen')}
                        aria-label={canvasFullscreen ? t('exitFullscreen') : t('fullscreen')}
                      >
                        {canvasFullscreen ? (
                          <Minimize2 size={16} aria-hidden />
                        ) : (
                          <Maximize2 size={16} aria-hidden />
                        )}
                      </button>
                    </div>
                    <div className={`object-explorer-style-panel ${stylePanelOpen ? 'open' : ''}`}>
                      <button
                        type="button"
                        className="object-explorer-style-panel-toggle-btn"
                        onClick={() => setStylePanelOpen((v) => !v)}
                        title={stylePanelOpen ? t('collapseStylePanel') : t('expandStylePanel')}
                        aria-expanded={stylePanelOpen}
                      >
                        {stylePanelOpen ? (
                          <ChevronLeft size={16} aria-hidden />
                        ) : (
                          <ChevronRight size={16} aria-hidden />
                        )}
                      </button>
                      {stylePanelOpen && (
                        <div className="object-explorer-style-panel-content">
                          <h3 className="object-explorer-sidebar-title">{t('nodeColors')}</h3>
                          <ul className="object-explorer-style-list">
                            {objectTypes.map((ot, idx) => (
                              <li key={ot.id} className="object-explorer-style-item">
                                <input
                                  type="color"
                                  value={objectTypeColors[ot.id] ?? getDefaultColor(idx)}
                                  onChange={(e) =>
                                    setObjectTypeColors((prev) => ({ ...prev, [ot.id]: e.target.value }))
                                  }
                                  className="object-explorer-color-input"
                                  aria-label={t('colorForName', { name: ot.name })}
                                />
                                <span className="object-explorer-style-label" title={ot.name}>
                                  {ot.name}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <h3 className="object-explorer-sidebar-title">{t('linkColors')}</h3>
                          <ul className="object-explorer-style-list">
                            {linkTypes.map((lt, idx) => (
                              <li key={lt.id} className="object-explorer-style-item">
                                <input
                                  type="color"
                                  value={linkTypeColors[lt.id] ?? getDefaultColor(idx)}
                                  onChange={(e) =>
                                    setLinkTypeColors((prev) => ({ ...prev, [lt.id]: e.target.value }))
                                  }
                                  className="object-explorer-color-input"
                                  aria-label={t('colorForName', { name: lt.name })}
                                />
                                <span className="object-explorer-style-label" title={lt.name}>
                                  {lt.source_object_type_name} → {lt.name} → {lt.target_object_type_name}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <ForceGraph2D
                      ref={graphRef}
                      graphData={graphData}
                      width={graphSize.width || undefined}
                      height={graphSize.height || undefined}
                      dagMode={dagLayoutMode || undefined}
                      dagLevelDistance={dagLayoutMode ? 150 : undefined}
                      onDagError={
                        dagLayoutMode
                          ? (loopIds) =>
                              toast.warning(
                                t('toastDagWarning', {
                                  mode: t(DAG_LAYOUT_I18N_KEY[dagLayoutMode] ?? 'layoutDefault'),
                                  nodes: `${loopIds?.slice(0, 3).join(', ')}${(loopIds?.length ?? 0) > 3 ? '...' : ''}`,
                                }),
                              )
                          : undefined
                      }
                      onEngineStop={() => {
                        const g = graphRef.current;
                        if (g && typeof g.zoomToFit === 'function') g.zoomToFit(400, 50);
                      }}
                      nodeLabel={(n) =>
                        (n as { name?: string }).name ?? (n as { id?: string }).id ?? t('nodeFallback')
                      }
                      nodeCanvasObject={(node, ctx, globalScale) => {
                        const n = node as GraphNode & { x?: number; y?: number };
                        const label = (n.name ?? n.id ?? t('nodeFallback')).slice(0, 24);
                        const fontSize = Math.max(10, 12 / globalScale);
                        ctx.font = `${fontSize}px system-ui, sans-serif`;
                        const textWidth = ctx.measureText(label).width;
                        const w = textWidth + 10;
                        const h = fontSize + 8;
                        const x = (n.x ?? 0) - w / 2;
                        const y = (n.y ?? 0) - h / 2;
                        const objIdx = n.objectTypeId ? objectTypes.findIndex((t) => t.id === n.objectTypeId) : 0;
                        const strokeColor = n.objectTypeId
                          ? getObjectTypeColor(n.objectTypeId, objIdx >= 0 ? objIdx : 0)
                          : '#6366f1';
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
                        const l = link as GraphLink;
                        const idx = l.linkTypeId ? linkTypes.findIndex((t) => t.id === l.linkTypeId) : 0;
                        return l.linkTypeId
                          ? getLinkTypeColor(l.linkTypeId, idx >= 0 ? idx : 0)
                          : 'rgba(100,100,100,0.6)';
                      }}
                      linkDirectionalArrowLength={6}
                      linkDirectionalArrowRelPos={1}
                      linkCurvature={0.15}
                      backgroundColor="#f8fafc"
                    />
                  </div>
                ) : (
                  <p className="object-explorer-results-empty">{t('noGraphData')}</p>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
