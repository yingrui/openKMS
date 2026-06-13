import type { SearchResult } from '../../data/knowledgeBasesApi';
import type { KbSearchRetrievalDiff, KbSearchSnapshot } from './KnowledgeBaseDetail.types';

function kbSnapshotFromResults(
  query: string,
  searchType: string,
  topK: number,
  forceDense: boolean,
  results: SearchResult[]
): KbSearchSnapshot {
  const orderedIds = results.map((r) => r.id);
  const scores: Record<string, number> = {};
  for (const r of results) scores[r.id] = r.score;
  return { query, searchType, topK, forceDense, orderedIds, scores };
}

function kbComputeSearchDiff(prev: KbSearchSnapshot, cur: KbSearchSnapshot): KbSearchRetrievalDiff {
  const prevSet = new Set(prev.orderedIds);
  const curSet = new Set(cur.orderedIds);
  const added = cur.orderedIds.filter((id) => !prevSet.has(id));
  const removed = prev.orderedIds.filter((id) => !curSet.has(id));
  const moved: { id: string; from: number; to: number }[] = [];
  cur.orderedIds.forEach((id, to) => {
    const from = prev.orderedIds.indexOf(id);
    if (from >= 0 && from !== to) moved.push({ id, from, to });
  });
  return { added, removed, moved };
}

function kbHasRetrievalProvenance(s: SearchResult): boolean {
  if (s.chunk_index != null && s.chunk_index !== undefined) return true;
  if (s.retrieval_mode) return true;
  const d = s.retrieval_debug;
  if (d && typeof d === 'object' && Object.keys(d).length > 0) return true;
  return false;
}

interface KbRetrievalProvenanceProps {
  s: SearchResult;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function KbRetrievalProvenancePanel({ s, t }: KbRetrievalProvenanceProps) {
  if (!kbHasRetrievalProvenance(s)) return null;
  const dbg = s.retrieval_debug;
  const num = (v: unknown): string | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return v;
    return null;
  };
  const stages = dbg?.pipeline_stages;
  const stageLine =
    Array.isArray(stages) && stages.length
      ? (stages as unknown[])
          .map((x) => (typeof x === 'string' ? t(`detail.retrieval.stage.${x}`, { defaultValue: String(x) }) : ''))
          .filter(Boolean)
          .join(' → ')
      : null;
  const modeLabel = s.retrieval_mode
    ? t(`detail.retrieval.mode.${s.retrieval_mode}`, { defaultValue: s.retrieval_mode })
    : null;
  const rows: { label: string; value: string }[] = [];
  if (s.chunk_index != null && s.chunk_index !== undefined) {
    rows.push({ label: t('detail.retrieval.chunkIndex'), value: String(s.chunk_index) });
  }
  if (modeLabel) rows.push({ label: t('detail.retrieval.modeLabel'), value: modeLabel });
  if (stageLine) rows.push({ label: t('detail.retrieval.pipelineLabel'), value: stageLine });
  const dr = dbg?.dense_rank;
  if (dr != null && num(dr) != null) rows.push({ label: t('detail.retrieval.denseRank'), value: num(dr)! });
  const ds = dbg?.dense_similarity;
  if (ds != null && num(ds) != null) rows.push({ label: t('detail.retrieval.denseSimilarity'), value: num(ds)! });
  const br = dbg?.bm25_rank;
  if (br != null && num(br) != null) rows.push({ label: t('detail.retrieval.bm25Rank'), value: num(br)! });
  const bs = dbg?.bm25_score;
  if (bs != null && num(bs) != null) rows.push({ label: t('detail.retrieval.bm25Score'), value: num(bs)! });
  const rf = dbg?.rrf_score;
  if (rf != null && num(rf) != null) rows.push({ label: t('detail.retrieval.rrfScore'), value: num(rf)! });
  const rr = dbg?.rerank_score;
  if (rr != null && num(rr) != null) rows.push({ label: t('detail.retrieval.rerankScore'), value: num(rr)! });
  if (!rows.length && !stageLine && !modeLabel) return null;
  return (
    <div className="kb-retrieval-panel">
      <div className="kb-retrieval-panel__title">{t('detail.retrieval.panelTitle')}</div>
      <dl className="kb-retrieval-panel__dl">
        {rows.map((row) => (
          <div key={row.label} className="kb-retrieval-panel__row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export { kbSnapshotFromResults, kbComputeSearchDiff, kbHasRetrievalProvenance, KbRetrievalProvenancePanel };
