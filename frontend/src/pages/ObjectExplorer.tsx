import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from '../data/ontologyApi';
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

type DemoQA = {
  label: string;
  question: string;
  cypher: string;
  answer: string;
};

const DEMO_QUESTIONS: DemoQA[] = [
  {
    label: '✅ 50岁 + 汇丰汇佑康宁D款 + 严重肺泡蛋白沉积症',
    question: '我是50岁的客户，买了汇丰汇佑康宁D款（MIL）重疾险，现在确诊了严重肺泡蛋白沉积症，能理赔吗？',
    cypher:
      'MATCH (a:AgeSegment {name:"中老年 50-65 周岁"})\n' +
      '       <-[:targets]- (p:InsuranceProduct {product_code:"MIL"})\n' +
      '       -[:provides]-> (c:Coverage)\n' +
      '       -[:covers_disease]-> (d:Disease)\n' +
      'WHERE d.disease_name CONTAINS "肺泡蛋白沉积"\n' +
      'RETURN a, p, c, d\n' +
      'LIMIT 1;',
    answer:
      '✅ 可以理赔。\n\n' +
      '产品「汇丰汇佑康宁D款重大疾病保险（MIL）」§10.1+ 罕见重疾扩展条款覆盖严重肺泡蛋白沉积症 ' +
      '（《重疾定义》第54条）。客户年龄段「中老年 50-65 周岁」属于该产品 targets 范围，' +
      '按重症档 100% 给付基本保险金。\n\n' +
      '• 等待期 90 天（已过）\n' +
      '• 所需材料：病理报告原件 + 诊断证明\n' +
      '• 理赔流程：报案(10d) → 资料(5d) → 核定(30d) → 给付(10d)\n' +
      '• 监管依据：内合规字[2025]018号',
  },
  {
    label: '❌ 50岁 + 任意重疾险 + 罕见遗传病（范可尼/肌营养不良/脑白质营养不良）',
    question: '我是50岁的客户，买了你们的某款重疾险，确诊了范可尼综合征（或肌营养不良/肾上腺脑白质营养不良）这类罕见病，能理赔吗？',
    cypher:
      'MATCH (a:AgeSegment {name:"中老年 50-65 周岁"})\n' +
      '       <-[:targets]- (p:InsuranceProduct)\n' +
      '       -[:excludes]-> (e:Exclusion)\n' +
      '       -[:excludes_disease]-> (d:Disease)\n' +
      'WHERE d.disease_name CONTAINS "范可尼"\n' +
      '   OR d.disease_name CONTAINS "肌营养不良"\n' +
      '   OR d.disease_name CONTAINS "脑白质"\n' +
      'RETURN a, p, e, d;',
    answer:
      '❌ 不能理赔。\n\n' +
      '无论是 MIL（汇丰汇佑康宁D款）还是 WPE（汇丰附加豁免保险费2023重大疾病保险），' +
      '均通过 [excludes] 边连到 Exclusion 节点「WPE §11.17 遗传性疾病免责」，' +
      '该 Exclusion 节点又通过 [excludes_disease] 边明确指向所有「遗传性 / 染色体异常 / 代谢性遗传」类罕见病。\n\n' +
      '条款原文：「因遗传性疾病、染色体异常或代谢性遗传病所导致的重大疾病，本公司不承担给付责任。」\n\n' +
      '• 命中条款：WPE §11.17\n' +
      '• 监管依据：内合规字[2025]018号\n' +
      '• 这是图谱"明文除外"，不是 LLM 推断 — 答案 100% 可审计。',
  },
  {
    label: '🔍 50岁客户能买的所有重疾险',
    question: '我是50岁的客户，你们有哪些重疾险适合我？',
    cypher:
      'MATCH (a:AgeSegment {name:"中老年 50-65 周岁"})\n' +
      '       <-[:targets]- (p:InsuranceProduct)\n' +
      'WHERE p.name CONTAINS "重大疾病"\n' +
      'RETURN a, p\n' +
      'LIMIT 12;',
    answer:
      '🔍 找到 50 岁年龄段（中老年 50-65 周岁）适用的重疾产品，' +
      '通过 InsuranceProduct -[targets]-> AgeSegment 边筛选，名称含"重大疾病"的产品。\n\n' +
      '具体产品名见图谱（每条线 = 一个 targets 关系）。点 List View 看完整产品代码。',
  },
];

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

function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function isNodeLike(obj: unknown): obj is Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o);
  return keys.length > 0 && ('id' in o || 'name' in o || keys.length >= 2);
}

function getNodeLabel(obj: Record<string, unknown>): string {
  if (typeof obj.name === 'string') return obj.name;
  if (obj.id != null) return String(obj.id);
  const first = Object.values(obj).find((v) => v != null && v !== '');
  return first != null ? String(first) : 'Node';
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
  selectedObjects: ObjectTypeResponse[]
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
        nodeMap.set(id, { id, name: getNodeLabel(obj), ...(objectTypeId && { objectTypeId }) });
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
      toast.error(e instanceof Error ? e.message : 'Failed to load types');
    } finally {
      setLoading(false);
    }
  }, []);

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
    return resultToGraph(result, selectedLinks, selectedObjects);
  }, [result, selectedLinks, selectedObjects]);

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
      toast.error('Select object types or link types to build a query, or enter Cypher manually');
      return;
    }
    setExecuting(true);
    setResult(null);
    try {
      const data = await executeCypherQuery(query);
      setResult(data);
      toast.success(`Returned ${data.rows.length} rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Query failed');
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
          <h3 className="object-explorer-sidebar-title">Object Types</h3>
          {loading ? (
            <p className="object-explorer-loading">Loading...</p>
          ) : (
            <ul className="object-explorer-type-list">
              {objectTypes.map((t) => (
                <li key={t.id} className="object-explorer-type-item">
                  <label className="object-explorer-type-row">
                    <input
                      type="checkbox"
                      checked={selectedObjectTypeIds.has(t.id)}
                      onChange={() => toggleObjectType(t.id)}
                      className="object-explorer-type-checkbox"
                    />
                    <Box size={16} aria-hidden />
                    <span className="object-explorer-type-label">{t.name}</span>
                    <span className="object-explorer-type-count">{t.instance_count}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <h3 className="object-explorer-sidebar-title">Link Types</h3>
          {loading ? null : (
            <ul className="object-explorer-type-list">
              {linkTypes.map((t) => (
                <li key={t.id} className="object-explorer-type-item">
                  <label className="object-explorer-type-row">
                    <input
                      type="checkbox"
                      checked={selectedLinkTypeIds.has(t.id)}
                      onChange={() => toggleLinkType(t.id)}
                      className="object-explorer-type-checkbox"
                    />
                    <Link2 size={16} aria-hidden />
                    <span className="object-explorer-type-label" title={t.name}>
                      {t.source_object_type_name} —[{t.name}]→ {t.target_object_type_name}
                    </span>
                    <span className="object-explorer-type-count">{t.link_count}</span>
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
                  <div className="object-explorer-userq-row">
                    <select
                      className="object-explorer-userq-preset"
                      value=""
                      onChange={(e) => {
                        const idx = parseInt(e.target.value, 10);
                        if (!Number.isNaN(idx) && DEMO_QUESTIONS[idx]) {
                          setUserQuestion(DEMO_QUESTIONS[idx].question);
                        }
                      }}
                    >
                      <option value="">— Pick a sample question —</option>
                      {DEMO_QUESTIONS.map((q, i) => (
                        <option key={i} value={i}>
                          {q.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    id="object-explorer-userq"
                    className="object-explorer-userq-input"
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                    placeholder="例如: 我是50岁的客户，买了汇丰汇佑康宁D款重疾险，确诊了严重肺泡蛋白沉积症，能理赔吗？"
                    rows={2}
                  />
                  <div className="object-explorer-userq-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAskQuestion}
                      disabled={generating || executing || !userQuestion.trim()}
                      title="Demo: maps the question to a pre-defined Cypher, runs it, and shows a final answer"
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
                Cypher query
              </label>
              <textarea
                id="object-explorer-cypher"
                className="object-explorer-cypher-input"
                value={cypherInput}
                onChange={(e) => setCypherInput(e.target.value)}
                placeholder="MATCH (a:Label)-[r:REL]->(b:Label) RETURN a, r, b"
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
                    Running...
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    Execute
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
              <p className="object-explorer-results-placeholder">
                Select object types or link types to compose a Cypher MATCH query, then click Execute to see results.
              </p>
            ) : result.rows.length === 0 ? (
              <p className="object-explorer-results-empty">No rows returned.</p>
            ) : (
              <>
                <div className="object-explorer-view-toggle">
                  <button
                    type="button"
                    className={`object-explorer-view-btn ${resultView === 'list' ? 'active' : ''}`}
                    onClick={() => setResultView('list')}
                    title="List View"
                  >
                    <List size={16} />
                    <span>List View</span>
                  </button>
                  <button
                    type="button"
                    className={`object-explorer-view-btn ${resultView === 'graph' ? 'active' : ''}`}
                    onClick={() => setResultView('graph')}
                    title="Graph View"
                  >
                    <Network size={16} />
                    <span>Graph View</span>
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
                              formatCellValue(row[col])
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
                        title="Layout mode"
                        aria-label="Layout mode"
                      >
                        <option value="">Default</option>
                        <option value="lr">Left to right</option>
                        <option value="rl">Right to left</option>
                        <option value="td">Top to bottom</option>
                        <option value="bu">Bottom to top</option>
                        <option value="radialout">Radial outward</option>
                        <option value="radialin">Radial inward</option>
                      </select>
                      <button
                        type="button"
                        className="object-explorer-graph-control-btn"
                        onClick={() => {
                          const g = graphRef.current;
                          if (g && typeof g.d3ReheatSimulation === 'function') g.d3ReheatSimulation();
                        }}
                        title="Reheat layout"
                        aria-label="Reheat layout"
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
                        title="Center view"
                        aria-label="Center view"
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
                        title="Zoom in"
                        aria-label="Zoom in"
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
                        title="Zoom out"
                        aria-label="Zoom out"
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
                        title="Zoom to fit"
                        aria-label="Zoom to fit"
                      >
                        <Expand size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="object-explorer-graph-control-btn"
                        onClick={() => setCanvasFullscreen((v) => !v)}
                        title={canvasFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                        aria-label={canvasFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
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
                        title={stylePanelOpen ? 'Collapse style panel' : 'Expand style panel'}
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
                          <h3 className="object-explorer-sidebar-title">Node colors</h3>
                          <ul className="object-explorer-style-list">
                            {objectTypes.map((t, idx) => (
                              <li key={t.id} className="object-explorer-style-item">
                                <input
                                  type="color"
                                  value={objectTypeColors[t.id] ?? getDefaultColor(idx)}
                                  onChange={(e) =>
                                    setObjectTypeColors((prev) => ({ ...prev, [t.id]: e.target.value }))
                                  }
                                  className="object-explorer-color-input"
                                  aria-label={`Color for ${t.name}`}
                                />
                                <span className="object-explorer-style-label" title={t.name}>
                                  {t.name}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <h3 className="object-explorer-sidebar-title">Link colors</h3>
                          <ul className="object-explorer-style-list">
                            {linkTypes.map((t, idx) => (
                              <li key={t.id} className="object-explorer-style-item">
                                <input
                                  type="color"
                                  value={linkTypeColors[t.id] ?? getDefaultColor(idx)}
                                  onChange={(e) =>
                                    setLinkTypeColors((prev) => ({ ...prev, [t.id]: e.target.value }))
                                  }
                                  className="object-explorer-color-input"
                                  aria-label={`Color for ${t.name}`}
                                />
                                <span className="object-explorer-style-label" title={t.name}>
                                  {t.source_object_type_name} → {t.name} → {t.target_object_type_name}
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
                                `Graph has cycles. Layout "${dagLayoutMode}" works best for DAGs. Nodes in loops: ${loopIds?.slice(0, 3).join(', ')}${(loopIds?.length ?? 0) > 3 ? '...' : ''}`
                              )
                          : undefined
                      }
                      onEngineStop={() => {
                        const g = graphRef.current;
                        if (g && typeof g.zoomToFit === 'function') g.zoomToFit(400, 50);
                      }}
                      nodeLabel={(n) => (n as { name?: string }).name ?? (n as { id?: string }).id ?? 'Node'}
                      nodeCanvasObject={(node, ctx, globalScale) => {
                        const n = node as GraphNode & { x?: number; y?: number };
                        const label = (n.name ?? n.id ?? 'Node').slice(0, 24);
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
                  <p className="object-explorer-results-empty">No graph data to display.</p>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
