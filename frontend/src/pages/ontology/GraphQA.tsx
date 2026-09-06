import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Expand,
  Loader2,
  Maximize2,
  MessagesSquare,
  Minimize2,
  Network,
  Send,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  executeCypherQuery,
  generateCypherFromQuestion,
  summarizeAnswer,
} from '../../data/ontologyApi';
import './GraphQA.scss';

/**
 * Preset questions with their pre-verified Cypher. Clicking a preset runs the
 * stored Cypher directly (no text-to-cypher) so demo answers stay reliable.
 */
type Preset = { q: string; cypher: string };

const PRESET_QUESTIONS: Preset[] = [
  {
    q: '申澜系企业之间有没有担保圈？涉及哪些企业？',
    cypher: `MATCH (a:Company)-[g:GUARANTEES]->(b:Company)
WHERE (b)-[:GUARANTEES*1..4]->(a)
RETURN a, b`,
  },
  {
    q: '「独立第三方」晖嘉投资，和借款人申澜精密到底有没有关联？',
    cypher: `MATCH (z:Person {name:'赵国庆'})-[:PERSON_HOLDS|OFFICER_OF]->(j:Company {name:'上海晖嘉股权投资合伙企业(有限合伙)'})
MATCH (z)-[:RELATIVE_OF]-(x:Person)-[:RELATIVE_OF]-(l:Person {name:'陆振邦'})
RETURN j, z, x, l`,
  },
  {
    q: '本笔 8000 万授信，加上集团存量，会不会超过集团统一授信限额？',
    cypher: `MATCH (c:Company {name:'上海申澜精密制造有限公司'})
OPTIONAL MATCH (c)-[:HOLDS_EQUITY|PERSON_HOLDS|OFFICER_OF|RELATIVE_OF*1..5]-(m:Company)
WITH c, collect(DISTINCT m) AS ms WITH ms+[c] AS members UNWIND members AS mem
MATCH (mem)-[:BORROWS]->(f:CreditFacility)
RETURN mem, f`,
  },
  {
    q: '申澜精密对上汽集团（600104.SH）的依赖有多高？',
    cypher: `MATCH (c:Company {name:'上海申澜精密制造有限公司'})-[r:SELLS_TO]->(st:ListedStock)
RETURN c, st`,
  },
  {
    q: '实控人陆振邦，通过持股和亲属，实际能影响哪些企业？',
    cypher: `MATCH (l:Person {name:'陆振邦'})-[:PERSON_HOLDS|RELATIVE_OF|OFFICER_OF*1..4]-(x)
WHERE x:Company OR x:Person
RETURN l, x`,
  },
];

/** Palette for grouping nodes by their role (column of first appearance). */
const NODE_COLORS = [
  '#4f46e5', '#059669', '#dc2626', '#d97706', '#7c3aed', '#0d9488',
  '#be185d', '#2563eb', '#16a34a', '#ea580c',
];

type QueryResult = { columns: string[]; rows: Record<string, unknown>[] };
type GraphNode = { id: string; name: string; group: string };
type GraphLink = { source: string; target: string };
type GraphData = { nodes: GraphNode[]; links: GraphLink[] };

function isNodeLike(obj: unknown): obj is Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
  const keys = Object.keys(obj as Record<string, unknown>);
  return keys.length > 0 && ('id' in (obj as object) || 'name' in (obj as object) || keys.length >= 2);
}

function nodeLabel(obj: Record<string, unknown>, fallback: string): string {
  if (typeof obj.name === 'string' && obj.name) return obj.name;
  if (obj.id != null) return String(obj.id);
  const first = Object.values(obj).find((v) => v != null && v !== '');
  return first != null ? String(first) : fallback;
}

/**
 * Stable identity for a node. Ontology nodes are MERGEd on their key property
 * (usually `name`) and carry no synthetic `id`, so a name-first identity is what
 * dedups the same real entity appearing across many rows (e.g. a hub node).
 */
function nodeIdentity(obj: Record<string, unknown>, fallback: string): string {
  if (obj._id != null) return `id:${String(obj._id)}`;
  if (obj.id != null) return `id:${String(obj.id)}`;
  if (typeof obj.name === 'string' && obj.name) return `name:${obj.name}`;
  return fallback;
}

/**
 * Convert explore columns/rows into force-graph {nodes, links}. Node-like columns
 * become nodes; edges are drawn between adjacent node-columns in each row (the
 * same "column adjacency" heuristic the Object Explorer uses). Colour group = the
 * column a node first appears in, which maps cleanly to entity role/label here.
 */
function resultToGraph(result: QueryResult, fallback: string): GraphData {
  const nodeMap = new Map<string, GraphNode>();
  const linkSet = new Set<string>();
  const links: GraphLink[] = [];

  result.rows.forEach((row, rowIdx) => {
    const nodeCols: { col: string; id: string }[] = [];
    result.columns.forEach((col) => {
      const v = row[col];
      if (!isNodeLike(v)) return;
      const id = nodeIdentity(v, `row:${rowIdx}:${col}`);
      if (!nodeMap.has(id)) {
        nodeMap.set(id, { id, name: nodeLabel(v, fallback), group: col });
      }
      nodeCols.push({ col, id });
    });
    for (let i = 0; i < nodeCols.length - 1; i++) {
      const src = nodeCols[i].id;
      const tgt = nodeCols[i + 1].id;
      if (src === tgt) continue;
      const key = `${src}->${tgt}`;
      if (linkSet.has(key)) continue;
      linkSet.add(key);
      links.push({ source: src, target: tgt });
    }
  });

  return { nodes: [...nodeMap.values()], links };
}

type Phase = 'idle' | 'cypher' | 'explore' | 'answer';

export function GraphQA() {
  const { t } = useTranslation('graphQa');

  const [question, setQuestion] = useState('');
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [askedQuestion, setAskedQuestion] = useState('');
  const [cypher, setCypher] = useState('');
  const [cypherSource, setCypherSource] = useState<'preset' | 'generated' | null>(null);
  const [cypherOpen, setCypherOpen] = useState(true);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fullscreen, setFullscreen] = useState(false);

  const busy = phase !== 'idle';

  const graphData = useMemo<GraphData | null>(() => {
    if (!result || result.rows.length === 0) return null;
    return resultToGraph(result, t('nodeFallback'));
  }, [result, t]);

  const legend = useMemo(() => {
    if (!graphData) return [];
    const groups: string[] = [];
    for (const n of graphData.nodes) if (!groups.includes(n.group)) groups.push(n.group);
    return groups.map((g, i) => ({ group: g, color: NODE_COLORS[i % NODE_COLORS.length] }));
  }, [graphData]);

  const colorForGroup = useCallback(
    (group: string) => {
      const idx = legend.findIndex((l) => l.group === group);
      return NODE_COLORS[(idx >= 0 ? idx : 0) % NODE_COLORS.length];
    },
    [legend]
  );

  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>(undefined);
  const graphBoxRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = graphBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setGraphSize({ width: Math.round(width), height: Math.round(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [graphData, fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  /**
   * Shared pipeline. When `presetCypher` is provided we skip text-to-cypher and
   * run the verified query directly; otherwise we call the LLM to generate it.
   *   (optional) text-to-cypher -> explore -> answer
   * Each step degrades gracefully: a failed answer still leaves graph + cypher.
   */
  const runPipeline = useCallback(
    async (q: string, presetCypher: string | null, presetIndex: number | null) => {
      setActivePreset(presetIndex);
      setAskedQuestion(q);
      setResult(null);
      setAnswer(null);
      setCypher('');
      setCypherSource(null);
      setCypherOpen(true);

      let finalCypher = presetCypher ?? '';

      if (!presetCypher) {
        setPhase('cypher');
        try {
          const gen = await generateCypherFromQuestion(q);
          finalCypher = (gen.cypher || '').trim();
          if (!finalCypher) {
            toast.error(gen.explanation || t('errorCypher'));
            setPhase('idle');
            return;
          }
          setCypher(finalCypher);
          setCypherSource('generated');
        } catch (e) {
          toast.error(e instanceof Error ? `${t('errorCypher')}: ${e.message}` : t('errorCypher'));
          setPhase('idle');
          return;
        }
      } else {
        setCypher(finalCypher);
        setCypherSource('preset');
      }

      setPhase('explore');
      let data: QueryResult;
      try {
        data = await executeCypherQuery(finalCypher);
        setResult(data);
        toast.success(t('toastRows', { count: data.rows.length }));
      } catch (e) {
        toast.error(e instanceof Error ? `${t('errorExplore')}: ${e.message}` : t('errorExplore'));
        setPhase('idle');
        return;
      }

      if (data.rows.length === 0) {
        setPhase('idle');
        return;
      }

      setPhase('answer');
      try {
        const ans = await summarizeAnswer({
          question: q,
          cypher: finalCypher,
          columns: data.columns,
          rows: data.rows,
        });
        setAnswer(ans.answer || '');
      } catch (e) {
        setAnswer(`_${t('errorAnswer')}_${e instanceof Error ? ` (${e.message})` : ''}`);
      } finally {
        setPhase('idle');
      }
    },
    [t]
  );

  const handleAsk = () => {
    const q = question.trim();
    if (!q) {
      toast.error(t('toastEmpty'));
      return;
    }
    void runPipeline(q, null, null);
  };

  const handlePreset = (idx: number) => {
    if (busy) return;
    const preset = PRESET_QUESTIONS[idx];
    setQuestion('');
    void runPipeline(preset.q, preset.cypher, idx);
  };

  const zoomBy = (factor: number) => {
    const g = graphRef.current;
    if (g && typeof g.zoom === 'function') g.zoom(g.zoom() * factor, 200);
  };
  const zoomToFit = () => {
    const g = graphRef.current;
    if (g && typeof g.zoomToFit === 'function') g.zoomToFit(300, 40);
  };

  const phaseMessage =
    phase === 'cypher'
      ? t('loadingCypher')
      : phase === 'explore'
        ? t('loadingExplore')
        : phase === 'answer'
          ? t('loadingAnswer')
          : '';

  return (
    <div className="graph-qa">
      <header className="graph-qa__header">
        <div className="graph-qa__title">
          <MessagesSquare size={22} aria-hidden />
          <h1>{t('pageTitle')}</h1>
        </div>
        <p className="graph-qa__subtitle">{t('pageSubtitle')}</p>
      </header>

      <section className="graph-qa__presets" aria-label={t('presetsHeading')}>
        <div className="graph-qa__presets-head">
          <Sparkles size={15} aria-hidden />
          <span className="graph-qa__presets-title">{t('presetsHeading')}</span>
          <span className="graph-qa__presets-hint">{t('presetsHint')}</span>
        </div>
        <div className="graph-qa__chips">
          {PRESET_QUESTIONS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              className={`graph-qa__chip${activePreset === idx ? ' graph-qa__chip--active' : ''}`}
              onClick={() => handlePreset(idx)}
              disabled={busy}
              title={p.q}
            >
              <span className="graph-qa__chip-index">{idx + 1}</span>
              <span className="graph-qa__chip-text">{p.q}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="graph-qa__ask">
        <label className="graph-qa__ask-label" htmlFor="graph-qa-input">
          {t('askHeading')}
        </label>
        <div className="graph-qa__ask-row">
          <textarea
            id="graph-qa-input"
            className="graph-qa__ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleAsk();
              }
            }}
            placeholder={t('askPlaceholder')}
            rows={2}
            disabled={busy}
          />
          <button
            type="button"
            className="graph-qa__ask-btn"
            onClick={handleAsk}
            disabled={busy || !question.trim()}
          >
            {busy && activePreset === null ? (
              <>
                <Loader2 size={16} className="graph-qa__spin" aria-hidden />
                {t('askRunning')}
              </>
            ) : (
              <>
                <Send size={16} aria-hidden />
                {t('askButton')}
              </>
            )}
          </button>
        </div>
      </section>

      {phase !== 'idle' && (
        <div className="graph-qa__status" role="status">
          <Loader2 size={16} className="graph-qa__spin" aria-hidden />
          <span>{phaseMessage}</span>
        </div>
      )}

      {(cypher || result || answer) && (
        <section className="graph-qa__results">
          {askedQuestion && (
            <div className="graph-qa__asked">
              <MessagesSquare size={15} aria-hidden />
              <span>{askedQuestion}</span>
            </div>
          )}

          {cypher && (
            <div className="graph-qa__cypher">
              <button
                type="button"
                className="graph-qa__cypher-head"
                onClick={() => setCypherOpen((v) => !v)}
                aria-expanded={cypherOpen}
              >
                {cypherOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <Code2 size={15} aria-hidden />
                <span>{t('cypherHeading')}</span>
                {cypherSource && (
                  <span
                    className={`graph-qa__cypher-tag graph-qa__cypher-tag--${cypherSource}`}
                  >
                    {cypherSource === 'preset' ? t('cypherPresetTag') : t('cypherGeneratedTag')}
                  </span>
                )}
              </button>
              {cypherOpen && (
                <pre className="graph-qa__cypher-code">
                  <code>{cypher}</code>
                </pre>
              )}
            </div>
          )}

          <div className="graph-qa__panes">
            <div className="graph-qa__pane graph-qa__pane--graph">
              <div className="graph-qa__pane-head">
                <Network size={15} aria-hidden />
                <span>{t('graphHeading')}</span>
                {graphData && (
                  <span className="graph-qa__badge">
                    {t('nodesBadge', {
                      nodes: graphData.nodes.length,
                      links: graphData.links.length,
                    })}
                  </span>
                )}
              </div>
              <div
                ref={graphBoxRef}
                className={`graph-qa__graph${fullscreen ? ' graph-qa__graph--fullscreen' : ''}`}
              >
                {graphData ? (
                  <>
                    <div className="graph-qa__graph-controls">
                      <button type="button" onClick={() => zoomBy(1.3)} title={t('zoomIn')} aria-label={t('zoomIn')}>
                        <ZoomIn size={15} aria-hidden />
                      </button>
                      <button type="button" onClick={() => zoomBy(1 / 1.3)} title={t('zoomOut')} aria-label={t('zoomOut')}>
                        <ZoomOut size={15} aria-hidden />
                      </button>
                      <button type="button" onClick={zoomToFit} title={t('zoomToFit')} aria-label={t('zoomToFit')}>
                        <Expand size={15} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFullscreen((v) => !v)}
                        title={fullscreen ? t('exitFullscreen') : t('fullscreen')}
                        aria-label={fullscreen ? t('exitFullscreen') : t('fullscreen')}
                      >
                        {fullscreen ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
                      </button>
                    </div>
                    {legend.length > 0 && (
                      <div className="graph-qa__legend" aria-label={t('legendHeading')}>
                        {legend.map((l) => (
                          <span key={l.group} className="graph-qa__legend-item">
                            <span className="graph-qa__legend-dot" style={{ background: l.color }} />
                            {l.group}
                          </span>
                        ))}
                      </div>
                    )}
                    <ForceGraph2D
                      ref={graphRef}
                      graphData={graphData}
                      width={graphSize.width || undefined}
                      height={graphSize.height || undefined}
                      cooldownTicks={120}
                      onEngineTick={() => {
                        const g = graphRef.current;
                        if (!g) return;
                        const charge = g.d3Force?.('charge');
                        if (charge && typeof charge.strength === 'function') charge.strength(-500);
                        const link = g.d3Force?.('link');
                        if (link && typeof link.distance === 'function') link.distance(150);
                      }}
                      onEngineStop={() => {
                        const g = graphRef.current;
                        if (!g) return;
                        if (typeof g.zoomToFit === 'function') g.zoomToFit(300, 60);
                        // Cap zoom so a handful of nodes don't get blown up to overlapping.
                        if (typeof g.zoom === 'function' && g.zoom() > 1.6) g.zoom(1.6, 200);
                      }}
                      nodeRelSize={5}
                      nodeLabel={(n) => (n as GraphNode).name}
                      nodeCanvasObject={(node, ctx, globalScale) => {
                        const n = node as GraphNode & { x?: number; y?: number };
                        const label = (n.name ?? t('nodeFallback')).slice(0, 22);
                        // Constant on-screen font size: canvas units = target_px / zoom. No large floor.
                        const fontSize = Math.min(16, 12 / globalScale);
                        ctx.font = `${fontSize}px system-ui, sans-serif`;
                        const textWidth = ctx.measureText(label).width;
                        const w = textWidth + 12;
                        const h = fontSize + 9;
                        const x = (n.x ?? 0) - w / 2;
                        const y = (n.y ?? 0) - h / 2;
                        const stroke = colorForGroup(n.group);
                        ctx.fillStyle = 'rgba(255,255,255,0.96)';
                        ctx.strokeStyle = stroke;
                        ctx.lineWidth = 1.6 / globalScale;
                        ctx.beginPath();
                        if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, 5);
                        else ctx.rect(x, y, w, h);
                        ctx.fill();
                        ctx.stroke();
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = '#1f2937';
                        ctx.fillText(label, n.x ?? 0, n.y ?? 0);
                      }}
                      linkColor={() => 'rgba(120,120,130,0.55)'}
                      linkDirectionalArrowLength={6}
                      linkDirectionalArrowRelPos={1}
                      linkCurvature={0.12}
                      backgroundColor="#f8fafc"
                    />
                  </>
                ) : result && result.rows.length === 0 ? (
                  <p className="graph-qa__empty">{t('noRows')}</p>
                ) : (
                  <p className="graph-qa__empty">{t('noGraph')}</p>
                )}
              </div>
            </div>

            <div className="graph-qa__pane graph-qa__pane--answer">
              <div className="graph-qa__pane-head">
                <Sparkles size={15} aria-hidden />
                <span>{t('answerHeading')}</span>
              </div>
              <div className="graph-qa__answer">
                {answer ? (
                  <div className="graph-qa__answer-md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                  </div>
                ) : phase === 'answer' ? (
                  <div className="graph-qa__answer-pending">
                    <Loader2 size={16} className="graph-qa__spin" aria-hidden />
                    <span>{t('answerPending')}</span>
                  </div>
                ) : (
                  <p className="graph-qa__empty">{t('placeholder')}</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {!cypher && !result && !answer && phase === 'idle' && (
        <div className="graph-qa__placeholder">
          <Network size={40} aria-hidden />
          <p>{t('placeholder')}</p>
        </div>
      )}
    </div>
  );
}
